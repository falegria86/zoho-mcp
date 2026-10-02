# Optimización de endpoints con timeout (504) — módulo Trámites

**Fecha:** 2026-08-27
**Rama:** `hotfix/buffer-cargos-orden-de-pago`
**Contexto:** Dos endpoints del módulo de trámites devolvían `504 Gateway Timeout`. El comportamiento común: **sin filtros respondían, pero al aplicar filtros la consulta se colgaba** hasta que el gateway cortaba la conexión (límite ~120 s, visto en el header `Retry-After: 120`).

> Todos los cambios deben pasar por **pruebas y revisión humana** antes de producción. No hay migraciones de base de datos en ninguno de los dos casos.

---

## Resumen ejecutivo

| Endpoint | Causa raíz del 504 | Solución | Archivos |
|---|---|---|---|
| `tramites/plantillas-de-tramites/` | `SELECT DISTINCT` sobre tabla ancha (~130 columnas) provocado por el filtro automático de un campo **ManyToMany** | Filtro M2M basado en `Exists()` (sin JOIN + DISTINCT) | filtro, vista, serializer |
| `tramites/tramites-indexados/` | **N+1 masivo**: bucle en Python sobre todo el queryset sin paginar, con varias consultas por trámite | Precarga en lote (`select_related`/`prefetch_related` + diccionarios) | vista, serializer |

---

## Endpoint 1 — `tramites/plantillas-de-tramites/`

### Síntoma
```
GET /tramites/plantillas-de-tramites/?estado_de_ficha=3&departamentos=5&page=1
→ 504 Gateway Timeout
```
Sin filtros respondía bien; al filtrar por `departamentos` (M2M) daba timeout.

### Causa raíz
`departamentos` es un campo **ManyToManyField**. `django-filter` genera automáticamente un `ModelMultipleChoiceFilter` que aplica **`.distinct()`** al queryset.

En PostgreSQL, un `SELECT DISTINCT` sobre la tabla `plantillas_de_tramite` (~130 columnas, con varios `TextField` grandes) obliga a ordenar/deduplicar por **todas** esas columnas anchas. Además, el paginador ejecuta un `COUNT` que **envuelve** ese `DISTINCT` en un subquery. Resultado: consulta inviable → 504.

- `estado_de_ficha` es **FK** → no añade `distinct` → por sí solo no causaba el problema.
- Detalle: con un solo `departamentos=5` el `distinct` **ni siquiera es necesario** (un M2M no genera duplicados con un único valor), pero se pagaba el costo igual.

### Solución
Se reemplazó el filtrado M2M por defecto por uno basado en `Exists()`, que **no requiere JOIN ni DISTINCT** en la consulta principal, manteniendo la semántica (OR por defecto, AND si `conjoined`). Se aplicó de forma **genérica a todos los `ManyToManyField`** del FilterSet vía `filter_overrides`, de modo que cualquier M2M actual o futuro queda protegido.

**16 filtros M2M** quedaron cubiertos:
`departamentos`, `usuarios`, `plantilla_de_tramite_relacionada`, `calendario_de_presentacion`, `meses_de_recurrencia`, `tipos_de_cargos`, `categorias_de_plantillas_de_tramites`, `fundamento_legal`, `fundamento_legal_monto`, `tecnologia_del_sistema`, `tipos_de_personas`, `catalogo_de_canales_de_pago`, `centro_de_costos`, `tipos_de_cargos_consulta`, `tipos_de_visitas_domiciliarias`, `configuraciones_de_actualizador_de_carteras`.

### Cambios por archivo

**`opensir/tramites/filters/plantilla_de_tramite.py`**
- Nueva clase `M2MExistsFilter(ModelMultipleChoiceFilter)` cuyo `filter()` usa `Exists()` en lugar de `JOIN + DISTINCT`.
- `filter_overrides` en `Meta` mapea todos los `ManyToManyField` a `M2MExistsFilter`.
- El `queryset` de cada filtro se resuelve inline con `f.remote_field.model._default_manager.complex_filter(f.get_limit_choices_to())` (equivalente a `remote_queryset`, que **no existe** como importable en la versión instalada de `django-filter` 2.4.0).

```python
class M2MExistsFilter(filters.ModelMultipleChoiceFilter):
    def filter(self, qs, value):
        if not value:
            return qs
        model = qs.model
        if self.conjoined:
            for item in value:
                qs = qs.filter(Exists(model._default_manager.filter(
                    pk=OuterRef('pk'), **{self.field_name: item})))
            return qs
        return qs.filter(Exists(model._default_manager.filter(
            pk=OuterRef('pk'), **{'%s__in' % self.field_name: list(value)})))
```

```python
class Meta:
    model = PlantillaDeTramite
    filter_overrides = {
        models.ManyToManyField: {
            'filter_class': M2MExistsFilter,
            'extra': lambda f: {
                'queryset': f.remote_field.model._default_manager.complex_filter(
                    f.get_limit_choices_to()
                ),
            },
        },
    }
    fields = [ ... ]
```

**`opensir/tramites/views/plantilla_de_tramite.py`** (mejora complementaria, no era la causa del 504)
- Nuevo `get_queryset` que, **solo en la acción `list`**, precarga con `prefetch_related` las ~21 relaciones M2M/inversas que serializa el listado, más `Prefetch(..., to_attr=...)` filtrados (`eliminado=False`) para lo que consume `to_representation`, y el nivel anidado `casos__requisitos` + `casos__requisitos__fundamento_legal`.
- Objetivo: eliminar el N+1 de serialización (una consulta por relación en lugar de una por objeto).

**`opensir/tramites/serializers/plantilla_de_tramite.py`**
- `to_representation` reutiliza los datos precargados (`departamentos_activos`, `centro_de_costos_activos`, `pasos_activos`) con **fallback seguro** (`getattr(..., None)`) para las rutas que no precargan (p. ej. `update` de un solo objeto).

---

## Endpoint 2 — `tramites/tramites-indexados/`

### Síntoma
```
GET /tramites/tramites-indexados/?usuario_puede_atender=true&departamento=5&estados_globales=2&page=1
→ 504 Gateway Timeout
```

### Causa raíz
Aquí el filtro **no** era el problema: `departamento` y `estados_globales` son **ForeignKey** (no M2M) → sin `DISTINCT`.

El cuello de botella estaba en el método `list()` de `TramiteIndexView`. Cuando llega `usuario_puede_atender=true`, se ejecutaba un **bucle en Python sobre todo el queryset filtrado sin paginar**, y por **cada trámite** se lanzaban varias consultas:

- `HistorialDeTramite.objects.filter(tramite=objeto).last()` → 1 query/trámite
- `paso_a_mandar.usuarios.all()` y `paso_a_mandar.groups.all()` → queries/trámite
- `usuario.groups.all()` → query/trámite
- rama sin historial: `PasoParaTramite.objects.filter(orden=1, ...).last()` → +1 query/trámite

Con `estados_globales=2` ("en proceso") + `departamento=5` = miles de trámites × ~4 consultas → **N+1 masivo antes de paginar** → 504.

### Solución
Se reescribió el bloque para **precargar en lote** todo lo que antes se consultaba dentro del bucle, preservando la lógica exacta:

- Se verificó que `HistorialDeTramite` y `PasoParaTramite` tienen `ordering = ['pk']`, por lo que `.last()` equivale al de **mayor `pk`**. La versión en lote respeta esa semántica.
- Un solo query para todos los historiales (con `select_related` del paso y `prefetch_related` de `usuarios`/`groups`).
- Un solo query para los pasos `orden=1` de las plantillas sin historial.
- Un solo query para los grupos del usuario.
- La condición de inclusión/exclusión y la lista `pasos_a_mandar` se mantienen idénticas.

**Resultado:** de **O(N × 4) consultas** a **~7 consultas fijas**, independientemente del número de trámites.

### Cambios por archivo

**`opensir/tramites/views/tramite.py`**
- Bloque `usuario_puede_atender` reescrito con precarga en lote (diccionarios `ultimo_historial` y `paso_orden_1_por_plantilla`, helper `usuario_puede_atender_paso`).
- `select_related('ciudadano', 'contribuyente', 'plantilla')` en el queryset de la vista (mejora menor para la serialización de la página).

**`opensir/tramites/serializers/tramite.py`**
- Se eliminó **código muerto** en `TramiteIndexSerializer.to_representation`:
  ```python
  paso = PasoParaTramite.objects.get(tramite=instance.pk)  # 'tramite' no es campo de PasoParaTramite
  ```
  `PasoParaTramite` no tiene campo ni relación inversa `tramite`, por lo que esa línea **siempre** lanzaba `FieldError` y caía en el `except` → `data['paso']` nunca se llenaba. La salida del serializer es idéntica tras eliminarla.

---

## Sobre el comportamiento de "cada consulta tarda menos" (60 s → 40 s → 33 s)

Observado en la versión **sin optimizar**. No es caché de aplicación ni de HTTP (si lo fuera, la 2ª respuesta sería instantánea). Es **calentamiento de cachés de datos**:

- **`shared_buffers` de PostgreSQL** y **page cache del SO**: la 1ª consulta lee de disco; las siguientes leen de RAM.
- En la versión con N+1, el efecto se amplifica porque son **miles** de consultas pequeñas las que se calientan.

Que con caché caliente aún tarde ~33 s confirma que el costo real es la **cantidad de trabajo** (round-trips + carga en memoria), no el disco. Eso es justo lo que atacan los cambios.

---

## Verificación recomendada (antes de desplegar)

1. **Levantar / check del proyecto:**
   ```bash
   python manage.py check
   ```

2. **Probar los endpoints reales:**
   - `/tramites/plantillas-de-tramites/?estado_de_ficha=3&departamentos=5&page=1`
   - `/tramites/tramites-indexados/?usuario_puede_atender=true&departamento=5&estados_globales=2&page=1`

3. **Comparar número de consultas (antes/después):**
   ```python
   from django.db import connection
   from django.test.utils import CaptureQueriesContext
   with CaptureQueriesContext(connection) as ctx:
       # ... ejecutar la lógica del endpoint ...
       pass
   print("num queries:", len(ctx))
   ```

4. **Medir el plan real (disco vs. CPU):**
   ```sql
   EXPLAIN (ANALYZE, BUFFERS)
   SELECT * FROM tramites
   WHERE departamento_id = 5 AND estados_globales_id = 2 AND eliminado = false;
   ```

5. **Correr los tests del módulo** (se tocó lógica de negocio, filtros y serializers compartidos):
   ```bash
   python manage.py test opensir.tramites
   ```

---

## Pendientes / mejoras futuras (mayor alcance, fuera de hotfix)

1. **`tramites-indexados` — empujar la lógica de "puede atender" al SQL.**
   El diseño actual (aun sin N+1) **carga en memoria todos los trámites del filtro** para decidir en Python cuáles puede atender el usuario. Si el volumen es muy grande, seguirá siendo lento por cantidad de filas (varias con `TextField` grandes).
   Refactor propuesto: usar `Subquery`/`Exists` con `OuterRef` sobre el último `HistorialDeTramite` por trámite y las membresías de `usuarios`/`groups` del paso, para que el filtro y la paginación los haga PostgreSQL y solo se traigan ~10 filas por página.

2. **`plantillas-de-tramites` — nivel de anidamiento más profundo.**
   Si el perfilado lo justifica, revisar N+1 adicionales en relaciones anidadas de segundo/tercer nivel dentro de los serializers.

3. **`tramite-index` — filtro M2M con duplicados.**
   El filtro `departamentos` del endpoint 1 y patrones similares: validar necesidad de `.distinct()` solo cuando se pasan múltiples valores (ya resuelto con `Exists`, pero conviene revisar otros filtros por el mismo patrón).

---

## Archivos modificados

| Archivo | Endpoint | Naturaleza |
|---|---|---|
| `opensir/tramites/filters/plantilla_de_tramite.py` | plantillas-de-tramites | **Fix del 504** (M2M → Exists) |
| `opensir/tramites/views/plantilla_de_tramite.py` | plantillas-de-tramites | Prefetch (N+1 serialización) |
| `opensir/tramites/serializers/plantilla_de_tramite.py` | plantillas-de-tramites | Reutiliza prefetch |
| `opensir/tramites/views/tramite.py` | tramites-indexados | **Fix del 504** (N+1 bucle) + select_related |
| `opensir/tramites/serializers/tramite.py` | tramites-indexados | Limpieza de código muerto |
