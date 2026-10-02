# Guía: datos mínimos para dar de alta una tarea en Zoho Projects

Referencia práctica para crear tareas (y subtareas) de forma consistente vía la API v3 de Zoho Projects, portal **sigobproyectos** (`portal_id = 920809`).

> Convención de nombres, campos obligatorios, valores válidos de picklists y heurísticas de horas/complejidad. Última actualización: 2026-07-22.

---

## 1. Datos mínimos OBLIGATORIOS

| Dato | Campo API | Formato / ejemplo | Notas |
|---|---|---|---|
| Nombre | `name` | `PCFDI: [HITO A] TÍTULO` | Ver nomenclatura (§4) |
| Proyecto | (ruta) | `106599000037303064` | ID numérico del proyecto |
| Listado (tasklist) | `tasklist` | `{ "id": "106599000037313010" }` | El milestone se hereda del listado |
| Fecha de inicio | `start_date` | `2026-07-22T00:00:00.000Z` | **Requerida por Zoho.** ISO 8601 para tareas |
| Propietario | `owners_and_work.owners[].zpuid` | `"106599000012853261"` | Debe ser miembro del proyecto |

Cuerpo mínimo:
```json
{
  "name": "PCFDI: [HITO A] TÍTULO DE LA TAREA",
  "start_date": "2026-07-22T00:00:00.000Z",
  "tasklist": { "id": "<tasklist_id>" },
  "owners_and_work": { "owners": [ { "zpuid": "<zpuid>" } ] }
}
```
`POST /api/v3/portal/920809/projects/{projectId}/tasks`

---

## 2. Datos RECOMENDADOS (para tarea completa)

| Dato | Campo API | Valor / ejemplo |
|---|---|---|
| Descripción | `description` | HTML (ver §6) |
| Prioridad | `priority` | `high` · `medium` · `low` · `none` |
| Horas de trabajo | `owners_and_work.total_work` + `owners[].work_values` | `"12:00"` (HH:MM) |
| Revisor de operaciones | `revisor` | `{ "zpuid": "..." }` |
| Revisor de desarrollo | `revisor_de_desarrollo` | `{ "zpuid": "..." }` |
| Área técnica | `area_tecnica` | picklist (ver §5) |
| Complejidad / tamaño | `tamano_de_tarea_1_facil_5_dificil` | `"1"`..`"5"` (ver §7) |
| Estatus | `status` | `{ "id": "..." }` (ver §5) |

Cuerpo completo de ejemplo:
```json
{
  "name": "PCFDI: [HITO A] DESCARGA MASIVA DE CFDI DEL SAT",
  "description": "<div>...HTML...</div>",
  "priority": "high",
  "start_date": "2026-07-22T00:00:00.000Z",
  "tasklist": { "id": "106599000037313010" },
  "owners_and_work": { "work_type": "standard", "unit": "hours", "total_work": "96:00", "owners": [ { "zpuid": "106599000036340993", "work_values": "96:00" } ] },
  "revisor": { "zpuid": "106599000027271388" },
  "revisor_de_desarrollo": { "zpuid": "106599000035979375" },
  "area_tecnica": "HITOS DEL PROYECTO",
  "tamano_de_tarea_1_facil_5_dificil": "5",
  "status": { "id": "106599000029307305" }
}
```

---

## 3. Subtareas

Las subtareas **no** se crean por v3. Flujo correcto:

1. **Crear anidada** (V2/restapi, form-encoded):
   `POST /restapi/portal/920809/projects/{projectId}/tasks/{parentTaskId}/subtasks/`
   con `name` y `person_responsible=<zpuid>`.
2. **Completar** por v3 (`PATCH .../tasks/{subtaskId}`): `description`, `priority`, `revisor`, `revisor_de_desarrollo`, `area_tecnica`, `tamano_de_tarea_1_facil_5_dificil`, horas.

> ⚠️ Crear con `POST .../tasks/` + campo `parent_task_id` devuelve 201 pero crea una tarea SUELTA (no anidada). Usar SIEMPRE el endpoint `/subtasks/`.

Nomenclatura de subtarea: `PCFDI- [FULLSTACK]: título de la subtarea`

---

## 4. Nomenclatura de nombres

| Nivel | Formato | Ejemplo |
|---|---|---|
| Tarea principal | `ABREV: [TIPO] TÍTULO EN MAYÚSCULAS` | `PCFDI: [HITO A] DESCARGA MASIVA DE CFDI DEL SAT` |
| Subtarea | `ABREV- [TIPO]: título` | `PCFDI- [FULLSTACK]: parsear cada nodo del XML` |

- **ABREV** = abreviatura del proyecto (se infiere del prefijo de las tareas existentes). Ej: `PCFDI`, `NAV`, `OAX`, `IPR`.
- **[TIPO]** = tipo de tarea entre corchetes. Ej: `[HITO X]`, `[BACK]`, `[FULLSTACK]`.
- El **título de la tarea principal va en MAYÚSCULAS**.

---

## 5. Valores válidos de picklists

### Área técnica (`area_tecnica`) — confirmadas
`BACKEND` · `FRONTEND` · `BASE DE DATOS` · `QA` · `DEVOPS` · `DISEÑO` · `FULL STACK (Revisión menor)` · `HITOS DEL PROYECTO` · `OTROS`

> El valor de "full stack" incluye el calificador exacto: **`FULL STACK (Revisión menor)`**.
> Convención en PCFDI: tareas principales = `HITOS DEL PROYECTO`; subtareas = `FULL STACK (Revisión menor)`.

### Prioridad (`priority`)
`high` · `medium` · `low` · `none` (en minúsculas)

### Estatus (`status` → por **ID**, no por nombre)

| Estatus | ID |
|---|---|
| No iniciada | `106599000029307305` |
| En documentación | `106599000029803423` |
| En proceso | `106599000029307298` |
| Ajustes de desarrollo | `106599000029307300` |
| Pruebas internas | `106599000029307307` |
| Pruebas internas (QA) | `106599000037239434` |
| Pruebas con cliente | `106599000029307297` |
| Listo para producción | `106599000029307301` |
| Validación en producción | `106599000029307306` |
| En pausa | `106599000029307302` |
| Pausa desarrollo | `106599000033976312` |
| Pausa operaciones | `106599000033976308` |
| Cerrada | `106599000029307303` |
| Cancelado | `106599000029307299` |

> El estatus **debe** setearse por `{ "id": "..." }`. Por nombre no funciona.

### Usuarios frecuentes (zpuid)

| Persona | zpuid | Rol típico |
|---|---|---|
| Dulce Gonzalez | `106599000027271388` | Revisor de operaciones |
| Francisco Gómez Alegría | `106599000035979375` | Revisor de desarrollo |
| Arturo Lora | `106599000036340993` | Desarrollador / propietario |
| Erick Villa | `106599000012853261` | Desarrollador / propietario |
| Paolo Payan | `106599000009450150` | Revisor de desarrollo |

> Obtener el zpuid de cualquier usuario: `GET /api/v3/portal/920809/projects/{projectId}/users`.

---

## 6. Descripción HTML

Zoho preserva estilos inline (colores, fondos, bordes, badges), tablas, `<hr>`, emoji, `<b>`, `<i>`, `<h2>/<h3>`, listas.

- Escapar el **contenido de texto** (`&`→`&amp;`, `<`→`&lt;`, `>`→`&gt;`) antes de insertarlo entre etiquetas. HTML sin escapar (ej. `<title>`) **trunca** la descripción al guardar.
- Estructura recomendada: encabezado con banda de color + badges + secciones con icono (🎯 Objetivo, ✅ Criterios de aceptación, 🧪 Cómo probar, 🔥 Smoke tests).

---

## 7. Heurísticas (PCFDI)

### Horas de trabajo (por estado del requisito)
| Estado | Horas |
|---|---|
| Existe | 2 h |
| Auditar | 4 h |
| Adaptar / Automatizar | 6 h |
| Nuevo | 8 h |

Tarea principal = **suma** de las horas de sus subtareas. (Escala conservadora/realista: un requisito "Nuevo" ≈ 1 día.)

### Complejidad / tamaño (1-fácil … 5-difícil)
| Estado | Tamaño |
|---|---|
| Existe | 1 |
| Auditar | 2 |
| Adaptar / Automatizar | 3 |
| Nuevo | 4 |
| Ruta crítica (ej. descarga masiva, modelo de datos) | 5 |

Tarea principal = **máximo** de la complejidad de sus subtareas.

> Nota: horas y complejidad son estimaciones por heurística, auditables y ajustables. La validación final del esfuerzo es del responsable humano.

---

## 8. Formatos de fecha (importante)

| Entidad | Formato de fecha |
|---|---|
| Tareas / subtareas (`start_date`, `end_date`) | ISO 8601: `YYYY-MM-DDTHH:mm:ss.SSSZ` |
| Milestones (`start_date`, `end_date`) | `MM-DD-YYYY` |

---

## 9. Checklist rápido para dar de alta una tarea

- [ ] Nombre con nomenclatura correcta (título en MAYÚSCULAS para tareas principales)
- [ ] `tasklist` correcto (define el milestone)
- [ ] `start_date` (obligatoria)
- [ ] Propietario (`owners_and_work`)
- [ ] Horas (`total_work` + `work_values`)
- [ ] `revisor` y `revisor_de_desarrollo`
- [ ] `area_tecnica`
- [ ] `tamano_de_tarea_1_facil_5_dificil` (complejidad)
- [ ] `status` por ID
- [ ] `description` en HTML (contenido escapado)
