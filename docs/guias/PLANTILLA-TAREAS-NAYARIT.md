# Plantilla de alta de tareas — Proyecto Nayarit (NAY-ING-STE)

> Referencia para dar de alta tareas en el proyecto **NAY-ING-STE** del portal SIGOB.
> Cuando digas *"vamos a dar de alta tareas para el proyecto de Nayarit"*, se usan estos
> defaults automáticamente. **La PRIORIDAD siempre se pregunta — nunca se asume.**

## Datos fijos del proyecto

| Dato | Valor |
|---|---|
| Portal | `sigobproyectos` → ID `920809` |
| Proyecto | `NAY-ING-STE` → ID `106599000036049465` |
| Lista de tareas (default) | **FASE3. AJUSTES CONTROLADOS** → ID `106599000036040017` |
| Prefijo de nombre | `NAY-ST: ` (se antepone **automáticamente** — el usuario NO lo escribe) |

### Listas de tareas del proyecto (tasklists)

| Nombre | ID |
|---|---|
| GESTIÓN DEL PROYECTO | `106599000036040014` |
| FASE1. ESTABILIZACIÓN DEL SISTEMA | `106599000036040015` |
| FASE2. SOPORTE FUNCIONAL (Oficios y operación) | `106599000036040016` |
| FASE3. AJUSTES CONTROLADOS (transición a evolutivo) | `106599000036040017` |
| FASE4. EVOLUTIVO FUNCIONAL | `106599000036040018` |

> ⚠️ Dime **cuál de estas listas usar como default** al dar de alta tareas.

## Defaults al crear una tarea

| Campo | Default | Nota |
|---|---|---|
| Lista de tareas | FASE3. AJUSTES CONTROLADOS (`106599000036040017`) | salvo que se indique otra |
| Revisor de operaciones (`revisor`) | **Dulce Gonzalez** (`106599000027271388`) | campo **obligatorio** |
| Horas (`work`) | 8 | va dentro de `owners_and_work` |
| Tamaño (`tamano_de_tarea_1_facil_5_dificil`) | 3 | 1=fácil … 5=difícil |
| `start_date` | hoy | requerida por Zoho |
| **Prioridad** | ⚠️ **SE PREGUNTA SIEMPRE** | high / medium / low / none |
| Área técnica | según la tarea | ver catálogo |
| Propietario | según la tarea | debe ser miembro del proyecto |

## Qué me das al pedir una tarea

```
Nombre:        SOLO el nombre corto — yo antepongo "NAY-ST: " siempre (si no lo trae ya)
Propietario:   nombre — lo busco; si no es miembro del proyecto, hay que añadirlo en Zoho
Área técnica:  FRONTEND / BACKEND / etc. (ver catálogo)
Prioridad:     OBLIGATORIO — me la dices tú
Objetivo:      la redacto/desgloso yo si me lo pides
(opcional)     horas, lista, revisor, tamaño — solo si cambian respecto al default
```

## Catálogo de Área técnica (valores en MAYÚSCULAS)

Valores observados en las tareas actuales de NAY-ING-STE:

`FRONTEND` · `BACKEND` · `BASE DE DATOS` · `DISEÑO` · `OPERACIONES` ·
`VALIDACIÓN` · `DOCUMENTACIÓN` · `HITOS DEL PROYECTO` · `OTROS`

> Nota: son los valores **vistos en uso**; el campo `area_tecnica` es un picklist y
> podría tener opciones adicionales no usadas todavía.

## Propietarios/usuarios conocidos (zpuid)

Miembros confirmados del proyecto NAY-ING-STE (30 en total). Los más frecuentes:

| Persona | zpuid | Email |
|---|---|---|
| Dulce Guadalupe Gonzalez Barradas | `106599000027271388` | dulce.gonzalez@sigob.com.mx |
| Alejandro German | `106599000022294467` | alejandro.leon@sigob.com.mx |
| Mauricio Tanuz Navarro Delgado | `106599000007764127` | mauricio.tanuz@sigob.com.mx |
| Jose Navarro | `106599000007764063` | jose.navarro@sigob.com.mx |
| Victor Manuel Prieto Mercado | `106599000007764097` | victor.prieto@sigob.com.mx |
| Karina Guadalupe Monroy Cervantes | `106599000007764099` | karina.monroy@sigob.com.mx |
| Julio Velarde | `106599000007764125` | julio.velarde@sigob.com.mx |
| Erick Villa | `106599000012853261` | erick.villa@sigob.com.mx |
| Cinthia Gallegos | `106599000024202075` | cinthia.gallegos@sigob.com.mx |
| Haniel Rojo | `106599000030715707` | haniel.rojo@sigob.com.mx |

> Hay 30 miembros en total. Para cualquier otro responsable, lo busco con `list_users`
> sobre NAY-ING-STE. Si la persona está en el portal pero no en este proyecto, primero
> hay que añadirla al proyecto.

## Campos personalizados del proyecto (api_name)

| api_name | Etiqueta | Tipo |
|---|---|---|
| `revisor` | Revisor operaciones | userpicklist (**obligatorio**) |
| `revisor_de_desarrollo` | Revisor de desarrollo | userpicklist |
| `revisor_de_datos` | Revisor de datos | userpicklist |
| `revisor_qa` | Revisor QA | userpicklist |
| `area_tecnica` | Área técnica | picklist |
| `tamano_de_tarea_1_facil_5_dificil` | Tamaño de tarea (1-5) | picklist |
| `work` | Horas de trabajo | (se manda en `owners_and_work`) |

> ✅ Confirmado con `list_task_fields` sobre NAY-ING-STE: los `api_name` son idénticos
> a los de Jalisco.

## Subtareas

Las subtareas **solo se crean por la API v2** (no hay endpoint v3). El padre va en la URL:
`POST /restapi/portal/sigobproyectos/projects/{PID}/tasks/{ID_PADRE}/subtasks/` (form-urlencoded, **barra final** obligatoria).

Mecánica (híbrida v2 + v3):
1. Crear la subtarea por **v2** con `name` (+ priority/description) → queda vinculada al padre.
2. Completar los campos personalizados (revisor, area_tecnica, horas, tamaño) con un **PATCH v3** usando el id devuelto.
3. Verificar el vínculo listando las subtareas del padre por v2.

Para pedir una subtarea: dame la **tarea padre** (su clave `XX-T###`, nombre o ID) + los mismos datos de una tarea normal. La **prioridad sigue siendo obligatoria**.

## Notas técnicas (API V3)

- **Horas:** van en `owners_and_work`, NO en el campo top-level `work` (V3 lo ignora). El formato que **sí funciona** (verificado): `{ work_type:"standard", copy_task_duration:false, unit:"hours", total_work:"40:00", owners:[{ zpuid, work_values:"40:00" }] }`. Es **obligatorio** incluir `unit:"hours"` a nivel de `owners_and_work`; sin él Zoho responde `Enter the valid work value units`. `work_type` solo acepta `"standard"`.
- **Subtareas:** se crean por v2 (`POST /restapi/portal/sigobproyectos/projects/{PID}/tasks/{PADRE}/subtasks/`, form-urlencoded). El `id` numérico que devuelve v2 pierde precisión si se parsea como número (>16 dígitos); usar `id_string`. La subtarea **hereda la lista del padre** (no se puede forzar otra). Las claves de tarea de este proyecto usan prefijo **`NABO-`** (campo `prefix`), p. ej. la padre FACTURACIÓN = `NABO-T101`.
- **`revisor` es obligatorio** y debe apuntar a un miembro del proyecto.
- **Propietario no-miembro** → Zoho responde `400 "user not available in the project"`; hay que añadirlo al proyecto primero.
- **Adjuntar archivos** a tareas requiere el scope `ZohoPC.files.ALL`, que el token actual **no tiene** (habría que agregarlo a `setup-auth.js` y re-autenticar).
- Fechas que se pasan al MCP en formato `MM-DD-YYYY`; el server las convierte a ISO 8601.

---

## Pendiente único

✅ Ya confirmados contra Zoho: ID del proyecto, listas de tareas, campos personalizados y miembros.

⚠️ **Falta solo tu decisión:** ¿cuál de las 5 listas de tareas usar como **default** al dar de alta?
(o si prefieres elegir lista en cada alta y no fijar default).

---
_Archivo de referencia local — no forma parte del repo (no commitear al PR de la contribución)._
