# CLAUDE.md

Este archivo proporciona orientación a Claude Code (claude.ai/code) cuando trabaja con el código de este repositorio.

## Propósito del Proyecto

Servidor MCP (Model Context Protocol) que conecta Zoho Projects con Claude AI. Expone operaciones de Zoho Projects como herramientas MCP invocables por Claude, permitiendo gestión de proyectos/tareas, seguimiento de tiempo y manejo de comentarios a través de una interfaz MCP basada en stdio.

## Comandos

```bash
npm run setup       # Autenticación OAuth2 inicial — abre el navegador, inicia servidor de callback en localhost:8080, guarda tokens.json
npm start           # Inicia el servidor MCP (transporte stdio)
npm run team-tasks  # Lista tareas abiertas de los miembros del equipo (emails hardcodeados)
npm run my-mentions # Lista menciones al usuario en comentarios (todos los proyectos o uno específico)
npm run aprobar-horas # Aprueba las horas pendientes del equipo en un mes y genera el informe (MD + HTML + PDF)
```

No hay paso de compilación ni pruebas — el proyecto corre directamente como módulos ES.

## Arquitectura

Tres archivos fuente con separación clara de responsabilidades:

- **`src/server.js`** — Punto de entrada del servidor MCP. Al arrancar llama a `GET /api/v3/portals` para resolver el nombre del portal (`ZOHO_PORTAL_NAME`) a su ID numérico requerido por V3, y lo almacena en la variable `PORTAL`. Registra las 12 herramientas con esquemas de parámetros Zod y delega cada una a `zohoClient`.
- **`src/zoho-client.js`** — Cliente HTTP singleton para la API REST de Zoho Projects (`https://projectsapi.zoho.com/api/v3`). Carga los tokens desde `tokens.json`, refresca automáticamente en respuesta 401 y reintenta la solicitud original una vez. Los cuerpos de solicitud usan `application/json`. Expone `get`, `post`, `patch`, `delete`, `postForm`, `postFormV2` y `getAllPages` (paginación automática). Ver sección "Time Logs API" para detalle de cuándo usar `postForm` vs `post`.
- **`src/setup-auth.js`** — Configuración OAuth2 de una sola vez: abre la URL de autorización, recibe el código via servidor HTTP local en el puerto 8080, lo intercambia por tokens y escribe `tokens.json`.

### Scripts utilitarios (`scripts/`)

Utilidades independientes que no forman parte del servidor MCP. Todas usan `zohoClient` directamente y requieren `.env`.

**`scripts/my-open-tasks.js`** — `npm run team-tasks`
Lista todas las tareas abiertas asignadas a miembros del equipo SIGOB en todos los proyectos del portal. Los emails y fragmentos de nombre del equipo están hardcodeados en el archivo.

**`scripts/auto-timer.js`** — `npm run timer:start` / `npm run timer:stop`
Inicia o detiene el timer en la tarea definida por `ZOHO_AUTO_TIMER_PROJECT_ID` y `ZOHO_AUTO_TIMER_TASK_ID`. Pensado para ejecutarse desde un cron en Railway (ver README). No requiere `tokens.json`; funciona solo con `ZOHO_REFRESH_TOKEN` en el entorno.

**`scripts/my-mentions.js`** — `npm run my-mentions`
Lista todos los comentarios donde se menciona al usuario (`ZOHO_MY_USER_ID`). Detecta menciones en formato Zoho (`[~ID]`) y opcionalmente por nombre (`ZOHO_MY_NAME`). Soporta filtro por rango de fechas.

```bash
npm run my-mentions                                        # todos los proyectos
npm run my-mentions -- "sigob-sir-lite"                   # un proyecto específico
npm run my-mentions -- --from=2026-05-01 --to=2026-06-09 # con rango de fechas
npm run my-mentions -- "sigob-sir-lite" --from=2026-06-01
```

Variable de entorno opcional: `ZOHO_MY_NAME` — si se define (ej: `"Francisco Gomez"`), amplía la detección de menciones por nombre además de por ID.

**`scripts/aprobar-horas.js`** — `npm run aprobar-horas`
Aprueba en lote los registros de horas pendientes de un equipo en un mes y genera el informe con marca SIGOB (`.md`, `.html` y `.pdf`).

```bash
npm run aprobar-horas                                    # mes anterior, equipo del .env
npm run aprobar-horas -- --month=2026-08                 # un mes específico
npm run aprobar-horas -- --month=2026-08 --dry-run       # lista lo pendiente sin aprobar nada
npm run aprobar-horas -- --team="ana@x.com,beto@x.com"   # otro equipo, sin tocar el .env
npm run aprobar-horas -- --team="ana lopez,beto" --team-name="Equipo Backend"
npm run aprobar-horas -- --help
```

El equipo es **configurable**, no está hardcodeado: sale de `ZOHO_APPROVAL_TEAM` en `.env` y `--team` lo sobrescribe. Acepta emails (match exacto) o fragmentos de nombre (todas las palabras deben aparecer). Filtrar por email es más confiable: en el portal los nombres tienen grafías inconsistentes.

Salida: `docs/informes-horas/<YYYY-MM>-<EQUIPO>.{md,html,pdf}` (o la carpeta que indique `--out=DIR`). El PDF necesita `assets/sigob-5.png` para la portada.

## Organización de documentos

Los documentos generados viven en `docs/`, agrupados **por tipo** y dentro **por proyecto**. El índice completo, con convenciones de nombres y el contenido actual, está en **`docs/README.md`** — consúltalo antes de crear un documento nuevo para respetar dónde va y cómo se llama.

```
docs/liberaciones/<PROYECTO>/<fecha>.{md,html,pdf}
docs/informes-horas/<YYYY-MM>-<EQUIPO>.{md,html,pdf}
docs/analisis/<PROYECTO|general>/
docs/backlogs/<PROYECTO>/
docs/calidad/<PROYECTO>/
docs/guias/
assets/sigob-5.png          logo de portada (los HTML lo referencian relativo)
work/                       JSON de trabajo, backups, previews — en .gitignore
```

Regla: **un documento = tres archivos** con el mismo nombre base (`.md` fuente, `.html` maquetado, `.pdf` para compartir), fechas en ISO, y sufijo `Ver.XXXX` solo cuando hay varias versiones del PDF.

## Autenticación y Configuración

`.env` contiene:
- `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` — credenciales OAuth de la app Zoho
- `ZOHO_PORTAL_NAME` — nombre del portal (ej: `sigobproyectos`); el servidor lo resuelve automáticamente a ID numérico al arrancar via `GET /api/v3/portals`
- `ZOHO_MY_USER_ID` — zpuid del usuario por defecto para asignación automática en `create_task` (obtenerlo con `list_users` en cualquier proyecto)
- `ZOHO_MY_NAME` — nombre completo del usuario (opcional); usado por `my-mentions` para detectar menciones por nombre
- `ZOHO_TEAM_EMAILS` — emails del equipo separados por comas; usado por `team-tasks` (ej: `user1@empresa.com,user2@empresa.com`)
- `ZOHO_TEAM_NAMES` — fragmentos de nombre separados por comas para detectar miembros por nombre (ej: `jose ramon,tejeda,kevin`)
- `ZOHO_AUTO_TIMER_PROJECT_ID` — ID numérico del proyecto para el timer automático (`auto-timer.js`)
- `ZOHO_AUTO_TIMER_TASK_ID` — ID numérico de la tarea objetivo del timer automático
- `ZOHO_APPROVAL_TEAM` — emails (o fragmentos de nombre) del equipo cuyas horas se aprueban con `aprobar-horas`, separados por comas
- `ZOHO_APPROVAL_TEAM_NAME` — nombre del equipo que aparece en el informe (ej: `LIDERES Y QA FSW`)
- `ZOHO_HOURS_PER_WEEK` — jornada de referencia para el informe de horas (default: `45`)
- `ZOHO_REFRESH_TOKEN` — refresh token OAuth; reemplaza a `tokens.json` en Railway/entornos sin filesystem persistente

`tokens.json` (generado por `npm run setup`) almacena los tokens OAuth activos incluyendo el refresh token. Ambos archivos están en `.gitignore` y son requeridos en tiempo de ejecución.

El refresco de tokens es transparente: `zoho-client.js` reintenta cualquier 401 automáticamente con un token de acceso nuevo y luego persiste el nuevo token en disco.

## Paginación en la API V3

Todos los endpoints de listado en V3 usan `page`/`per_page` con `page_info.has_next_page` en la respuesta. El máximo por página es 200.

**Regla:** usar siempre `zohoClient.getAllPages(path, params, itemsKey)` en lugar de `zohoClient.get()` para cualquier endpoint que devuelva listas. `getAllPages` itera automáticamente todas las páginas hasta que `page_info.has_next_page` no sea `true`.

```js
// Correcto — trae TODAS las tareas del proyecto
const tasks = await zohoClient.getAllPages(`/portal/${PORTAL}/projects/${id}/tasks`, params);

// Incorrecto — solo devuelve la primera página (máx. 100 tareas)
const r = await zohoClient.get(`/portal/${PORTAL}/projects/${id}/tasks`, params);
const tasks = r.tasks || [];
```

El parámetro `itemsKey` (por defecto `"tasks"`) debe coincidir con la clave del array en la respuesta: `"tasks"` para tareas, `"tasklists"` para listas de tareas, `"projects"` para proyectos.

> **Nota:** `sindex` aparece en la doc de Zoho solo para el endpoint "Get Associated Tasks From Issue" — no se usa en los endpoints generales de tasks ni tasklists.

### Filtros en endpoints de tareas

El parámetro `filter` es un JSON con `criteria` + `pattern`. Ejemplos de uso en `list_tasks`:

```js
// Por estado — el value es array de IDs numéricos del estado, NO strings como "open"
params.filter = JSON.stringify({
  criteria: [{ field_name: "status", criteria_condition: "contains", value: [4000000000485] }],
  pattern: "1"
});

// Por completado — más confiable que buscar IDs de estado, funciona en todos los portales
params.filter = JSON.stringify({
  criteria: [{ field_name: "is_completed", criteria_condition: "is", value: false }],
  pattern: "1"
});
```

**Importante:** los IDs de estado (`value: [<id>]`) varían por portal. El campo `is_completed: true/false` en la respuesta de cada tarea es portable y no depende de IDs.

### Cómo obtener el ID numérico de cualquier estado

Los nombres de estado ("Cerrada", "En proceso", "Pruebas internas", etc.) no se pueden usar directamente en filtros ni en `update_task` — la API requiere el ID numérico. El patrón para obtenerlo:

1. Buscar con `list_tasks` una tarea que **ya tenga** el estado deseado (filtrar en memoria por `status.name`).
2. Llamar a `get_task` con el ID de esa tarea.
3. Leer el campo **Estado** de la respuesta: `Cerrada (id: 106599000XXXXXXX, cerrado: true)`.
4. Usar ese ID en `update_task` → `status: "<id>"` o en filtros → `value: [<id>]`.

El ID es el mismo para todas las tareas del portal que tengan ese estado — solo hay que resolverlo una vez por sesión.

```
# Ejemplo: cerrar una tarea cuando no se conoce el ID de "Cerrada"
1. list_tasks project_id=X  →  buscar en memoria una tarea con status.name == "Cerrada"
2. get_task project_id=X task_id=<esa tarea>  →  leer "Estado: Cerrada (id: 106599000035000001, ...)"
3. update_task project_id=X task_id=<tarea objetivo> status="106599000035000001"
```

`sort_by` soporta: `id`, `name`, `start_date`, `end_date`, `completion_percentage`, `created_time`, `last_modified_time`, `created_by`, `is_completed`. Formato: `ASC(campo)` o `DESC(campo)`.

## Herramientas MCP Expuestas

`list_projects`, `list_tasks`, `get_task`, `create_task`, `create_subtask`, `update_task`, `delete_task`, `list_comments`, `add_comment`, `update_comment`, `delete_comment`, `list_users`, `start_timer`, `stop_timer`, `list_task_fields`, `get_task_attachments`, `disassociate_attachment`, `get_time_logs`, `add_time_log`, `sync_task_hours`, `get_pending_approvals`, `approve_time_logs`. Todas las herramientas reciben `project_id` como parámetro requerido, excepto `list_projects`.

### `list_tasks`

- Devuelve **todas** las tareas del proyecto (paginación automática vía `getAllPages`).
- Parámetro opcional `status`: acepta `"open"`, `"closed"`, `"overdue"` — se envía a la API como filtro `criteria_condition: "is"`. Si el filtro no funciona en un portal específico (los IDs de estado varían), filtrar el resultado en memoria usando `t.is_completed` o `t.status.name`.
- Cada tarea en la respuesta incluye `is_completed: true/false` y `status.is_closed_type: true/false` para filtrar localmente sin depender de IDs.

### `update_task`

- Parámetros disponibles: `name`, `description`, `status`, `priority`, `person_responsible`, `due_date`, `completion_percentage` (0-100), `tasklist_id` (para mover a otra lista).
- Solo se envían los campos que se pasen; los demás quedan intactos.
- `status` acepta nombre (`"Closed"`, `"En proceso"`) o ID numérico del estado.

### `delete_task`

Elimina una tarea permanentemente incluyendo sus subtareas. **Irreversible.** Para cerrar sin eliminar usar `update_task` con `status="Closed"`.

### Comentarios (`list_comments`, `add_comment`, `update_comment`, `delete_comment`)

- `list_comments` trae **todos** los comentarios con paginación automática (`getAllPages` con `itemsKey="comments"`). Devuelve `id`, `created_by.full_name` y `comment`. El `id` es necesario para editar o eliminar.
- `add_comment` devuelve el ID del comentario creado.
- `update_comment` y `delete_comment` requieren el `comment_id` obtenible con `list_comments`.
- Para mencionar usuarios en comentarios: formato `[~zpuid]`.

### Subtareas (`create_subtask`)

La API V3 soporta crear subtareas via `parental_info: { parent_task_id }` en el `POST /tasks`. Sin embargo, nuestra herramienta `create_subtask` usa un enfoque híbrido v2+v3 porque el endpoint V2 (`POST /restapi/.../subtasks/`) garantiza que la subtarea hereda la lista del padre sin necesidad de conocer el `tasklist_id`. El flujo es: crear por v2 → completar campos personalizados con `PATCH` v3. `zoho-client.js` expone `postFormV2` para este caso.

### Creación rápida de tareas (`create_task`)

- `project_id` acepta nombre o ID numérico (ej: `"sigob-sir-lite"` o `"123456"`)
- ⚠️ **`hours` es obligatorio.** Ninguna tarea debe darse de alta sin horas asignadas, en ningún proyecto. Acepta `"6"` o `"06:00"`; rechaza `0` y formatos inválidos. Si no se conoce la estimación, hay que preguntarla antes de crear la tarea, no dejarla en cero.
- Si no se especifica `person_responsible`, se asigna automáticamente el usuario en `ZOHO_MY_USER_ID`
- Campos disponibles: `name`, `description`, `priority` (lowercase: `high/medium/low/none`), `start_date`, `due_date` (formato MM-DD-YYYY, se convierte a ISO internamente), `tasklist_id`, `custom_fields`
- `start_date` es **requerida por la API de Zoho**; si no se proporciona, el servidor usa la fecha de hoy automáticamente
- Para campos personalizados usar `list_task_fields` para obtener los `api_name` y pasarlos en `custom_fields` como `{"cf_area_tecnica": "Backend"}`
- `description` se convierte automáticamente a HTML antes de enviarse a Zoho (ver abajo); si ya contiene HTML se envía tal cual

### `sync_task_hours`

Para cada tarea **cerrada** del proyecto que tenga horas planeadas (`owners_and_work.total_work > 0`), crea un registro de tiempo (`add_time_log`) igual a `total_work × factor`. El caso de uso principal es registrar el 95% de las horas planeadas al cierre de una tarea.

- `factor` (0.0–1.0, por defecto 1.0): multiplicador sobre las horas planeadas antes de crear el log. Ej: `0.95` → 95% de las horas planeadas.
- Sin `user_zpuid`: aplica a todas las tareas cerradas del proyecto.
- Con `user_zpuid`: solo las tareas cerradas asignadas a ese usuario. El log se crea con ese zpuid como owner.
- La fecha del log es `end_date` de la tarea (si existe), si no usa la fecha de hoy.
- **No reemplaza logs existentes** — crea un nuevo entry adicional. Si la tarea ya tiene logs del timer, este tool agrega un log extra.
- Si `total_work` es `"0:00"` o no existe, la tarea se omite.

### Aprobación de registros de tiempo (`get_pending_approvals`, `approve_time_logs`)

Flujo típico como líder de equipo:

1. `get_pending_approvals project_id=X` — lista todos los logs con `approval_status = "Unapproved"`, con su `log_id`, fecha, usuario, tarea y horas.
2. `approve_time_logs project_id=X` — aprueba **todos** los pendientes del proyecto en el rango de fechas.
   - Con `log_ids=[...]` aprueba solo esos IDs específicos.
   - Con `user_zpuid=...` filtra por usuario antes de aprobar.
   - Con `approval_status="Rejected"` rechaza en lugar de aprobar.

Ambas herramientas iteran tarea por tarea (misma limitación que `get_time_logs`). La aprobación usa `PATCH /portal/{id}/logs` en bulk — una sola llamada para todos los logs encontrados.

El campo `approval_status` en los filtros acepta: `"Approved"`, `"Unapproved"`, `"Rejected"`.

### Registros de tiempo: timer vs manual

Hay dos formas de registrar tiempo:

| Método | Cuándo usar | Herramientas |
|---|---|---|
| **Timer en vivo** | Trabajo en curso — inicias y detienes en tiempo real | `start_timer` → `stop_timer` |
| **Registro manual** | Tiempo pasado — sabes exactamente cuántas horas trabajaste | `add_time_log` |

`get_time_logs` sirve para consultar el historial de registros de un proyecto por rango de fechas, con filtro opcional por usuario (`user_zpuid`).

### Formato HTML automático de descripciones

La función `toHtmlDescription` en `server.js` convierte texto plano a HTML estructurado para `create_task` y `update_task`:

- Líneas en **MAYÚSCULAS** → `<h3>TÍTULO</h3><br><br>`
- Líneas con `-`, `*` o `•` → `<ul><li>...</li></ul>`
- Resto de líneas → `<p>texto</p>`
- Si la descripción ya contiene etiquetas HTML, se pasa sin modificar

### Horas de tareas (`owners_and_work`)

Zoho **acepta** el campo `work: "6:00"` pero lo guarda como `00:00`. La única forma que persiste las horas es:

```json
"owners_and_work": {
  "work_type": "standard",
  "unit": "hours",
  "total_work": "06:00",
  "owners": [{ "zpuid": "1065990000...", "work_values": "06:00" }]
}
```

Las horas y el propietario viven en el mismo objeto: al cambiar uno hay que reenviar el otro o se borra. `update_task` lo maneja releyendo la tarea antes del `PATCH`. Tras crear, `create_task` reconsulta la tarea y devuelve una advertencia explícita si `total_work` quedó en `00:00`.

Las subtareas se crean por el endpoint V2 (`/restapi/.../subtasks/`), que **no** acepta horas: hay que setearlas con un `PATCH` V3 inmediatamente después de crearlas.

## API Zoho Projects V3 — Notas de Migración

El proyecto fue migrado de la API V2 (`/restapi/`) a V3 (`/api/v3/`) en junio 2026. El soporte de V2 terminó en diciembre 2025.

### Diferencias clave V2 → V3

| Aspecto | V2 | V3 |
|---|---|---|
| Base URL | `/restapi/portal/{name}/...` | `/api/v3/portal/{id}/...` |
| Content-Type | `application/x-www-form-urlencoded` | `application/json` |
| Portal identificador | Nombre (ej: `sigobproyectos`) | **ID numérico** (ej: `739121528`) |
| HTTP update | `PUT` | `PATCH` |
| Trailing slash | Requerido | **No usar** |
| Fechas | `MM-DD-YYYY` | ISO 8601 completo: `YYYY-MM-DDTHH:mm:ss.SSSZ` |
| Task owner | `person_responsible: "id"` | `owners_and_work: { owners: [{ zpuid: "id" }] }` |
| Task ID field | `id_string` | `id` |
| Task owners en response | `details.owners[]` | `owners_and_work.owners[]` |
| Status en update | String `"Open"` | Objeto `{ id: "..." }` o `{ name: "..." }` |
| Custom fields | `UDF_CHAR1`, `UDF_LONG2` | `api_name` (ej: `cf_area_tecnica`) |
| get_task response | `{ tasks: [task] }` | Task object directo |
| create_task response | `{ tasks: [task] }` | Task object directo |
| Comentario (campo body) | `content` | `comment` |
| Comentario autor en response | `posted_by.name` / `added_by` | `created_by.name` |
| add_comment response | `{ comments: [...] }` | Array directo `[{...}]` |

### Timer V3

El endpoint de timer cambió completamente:
- **Start**: `POST /api/v3/portal/{id}/timelogs/timers` con body `{ entity_id, project_id, module_id }` — el `module_id` se obtiene dinámicamente de `GET /projects/{id}/modules` buscando `module_name === "Task"`
- **Stop**: Dos pasos — `GET /timelogs/timers` para obtener el timer ID activo, luego `PATCH /timelogs/timers/{id}/stop`. Zoho descarta automáticamente timers de menos de 30 segundos.
- **Get running**: `GET /api/v3/portal/{id}/timelogs/timers?type=task`
- La path `(timesheet|timelogs)` en los docs significa que ambas palabras funcionan; usamos `timelogs`

### Timelogs y aprobación de horas

**Listar:** `GET /api/v3/portal/{id}/timelogs?module={"type":"task"}&start_date=YYYY-MM-DD&per_page=100&page=N`

- `module` va como **JSON** con campo `type`. Valores válidos: **`task`, `issue`, `general`**. Hay que barrer los tres o se pierden horas en silencio (`bug`, `all`, `milestone` dan `PATTERN_NOT_MATCHED`; V3 dice `issue` donde V2 dice `bug`).
- ⚠️ **`end_date` se ignora**: la API devuelve la **semana ISO (lun–dom) que contiene `start_date`**. Para cubrir un mes hay que consultar el lunes de cada semana involucrada.
- ⚠️ **`page_info.has_next_page` viene siempre `true`** y `page_count` siempre `100`. El corte real es "esta página ya no aportó ids nuevos" (dedupe por `log.id`).
- Encadenar cientos de llamadas produce `fetch failed` esporádico: reintentar con backoff.

**Aprobar en lote (V3):** `PATCH /api/v3/portal/{id}/logs` con un **array**:

```json
[{ "id": "106599000038411887", "module": "task", "approval_status": "Approved" }]
```

⚠️ `module` va como **string** con el tipo (`"task"` / `"issue"`). Enviarlo como objeto `{id, type}` devuelve `PATTERN_NOT_MATCHED`. `approval_status` acepta `Approved` y `Rejected`.

⚠️ Esta ruta no aparece documentada y `GET /logs` responde `INVALID_METHOD: GET`, lo que hace parecer que no existe. Sí existe, solo que únicamente acepta PATCH.

La operación es reversible: volver a mandar el registro con estado `Rejected`, o aprobarlo de nuevo, no rompe nada.

La operación es reversible: el mismo endpoint con `approval=pending` devuelve el registro a pendiente.

### Respuesta de proyectos

`GET /api/v3/portal/{id}/projects` devuelve un **array directo** `[{...}]`, no `{ projects: [...] }`. El código usa `Array.isArray(r) ? r : (r.projects || [])` para manejar ambos formatos.

El objeto proyecto en V3 tiene `status` como objeto `{ id, name, color, is_closed_type }`, no string.

### Portal ID numérico

V3 requiere ID numérico del portal en todas las rutas. El servidor resuelve esto automáticamente al arrancar:

```
GET /api/v3/portals  →  [ { portal_name: "sigobproyectos", id: "123456789", ... } ]
```

La función `initPortalId()` en `server.js` busca el portal por `portal_name`, `org_name` o `name` y actualiza la variable `PORTAL` con el ID numérico antes de aceptar cualquier tool call. Si `ZOHO_PORTAL_NAME` ya es numérico, se usa directamente sin llamar al endpoint.

## Time Logs API — Restricciones y Comportamiento

Descubrimientos críticos encontrados al implementar `get_time_logs`, `add_time_log` y `sync_task_hours`:

### 1. `GET .../timelogs` requiere `module:{id,type}` por tarea

El endpoint `GET /portal/{id}/projects/{pid}/timelogs` **no devuelve todos los logs del proyecto**. Requiere el parámetro `module` con el ID de la entidad específica (tarea), no el ID del tipo de módulo del proyecto.

```js
// ✅ Correcto — id es el ID de la TAREA (task.id), no del módulo del proyecto
zohoClient.get(`/portal/${PORTAL}/projects/${pid}/timelogs`, {
  view_type: "customdate",
  start_date: sd,
  end_date:   ed,
  module: JSON.stringify({ id: task.id, type: "task" }),
});

// ❌ Incorrecto — usar el module_id del proyecto (de /projects/{id}/modules) devuelve []
// module: JSON.stringify({ id: "106599000006744005", type: "task" })
```

Consecuencia: **no existe un endpoint que devuelva todos los logs de un proyecto en una sola llamada**. `get_time_logs` y `sync_task_hours` iteran tarea por tarea. Esto consume muchas llamadas y puede alcanzar el rate limit de Zoho (200 req/2 min).

### 2. `addbulktimelogs` requiere `application/x-www-form-urlencoded`

El endpoint `POST /portal/{id}/addbulktimelogs` **rechaza JSON** (`Content-Type: application/json`). Solo acepta form-urlencoded. El campo `log_object` debe ser un JSON serializado como string dentro del form body.

```js
// ✅ Correcto — usar postForm() de zoho-client.js
zohoClient.postForm(`/portal/${PORTAL}/addbulktimelogs`, {
  log_object: JSON.stringify([{ project_id, item_id: task_id, type: "task", date, hours, ... }])
});

// ❌ Incorrecto — post() envía JSON y retorna "Input Parameter Missing"
zohoClient.post(`/portal/${PORTAL}/addbulktimelogs`, { log_object: [...] });
```

`zoho-client.js` expone `postForm(path, body)` específicamente para este caso. Es análogo a `postFormV2` pero para V3.

### 3. PATCH a `owners_and_work` requiere `owners` y `work_type`

Actualizar las horas planeadas de una tarea requiere incluir ambos campos obligatoriamente, aunque no se cambie al owner:

```js
// ✅ Correcto
zohoClient.patch(path, {
  owners_and_work: {
    work_type:  "standard",       // REQUERIDO — sin esto: 400 "Input Parameter Missing"
    total_work: "6:05",
    unit:       "hours",
    owners: [{ zpuid: "...", work_values: "6:05" }]  // REQUERIDO — sin esto: 400
  }
});

// ❌ Incorrecto — owners_and_work sin owners ni work_type retorna 400
zohoClient.patch(path, { owners_and_work: { total_work: "6:05" } });
```

Los owners deben obtenerse del campo `task.owners_and_work.owners` de la tarea existente para no perder asignaciones.

## Endpoints V3 disponibles pero no implementados como herramientas

Existen en la API pero no están expuestos como tools MCP. Si se necesitan en el futuro, implementarlos en `server.js` siguiendo el mismo patrón:

| Endpoint | Método | Descripción |
|---|---|---|
| `/tasks/{id}/clone` | POST | Clona una tarea N veces; body: `{ no_of_instances: N }` |
| `/tasks/{id}/move` | POST | Mueve a otra tasklist con mapeo de estados; body: `{ target_tasklist_id, status_mapping[] }` — también se puede hacer via `update_task` con `tasklist_id` |
| `/tasks/count` | GET | Devuelve `{ task_count }` sin traer las tareas; acepta los mismos `filter`/`view_id` que `list_tasks` |
| `/tasks/{id}/reorder` | POST | Reordena dentro de una lista; body: `{ before }`, `{ after }` o `{ position: "first"/"last" }` |
| `/attachments` (POST) | POST | Sube archivo al portal (multipart form-data, max 125 MB); no implementable desde agente MCP porque requiere contenido binario |
| `/associate-attachments` | POST | Sube y asocia archivo a una entidad en un paso (max 20 MB, multipart); misma limitación de binario |
| `/entity-attachments` | POST | Asocia un archivo ya subido a WorkDrive (via `thirdparty_id`) a una entidad; útil si se tiene el WorkDrive resource ID |
| `/attachments/{id}` (GET) | GET | Detalle de un adjunto específico por `attachment_id` |
| `/logs` (PATCH) | PATCH | Actualiza campos de logs existentes (horas, notas, bill_status); `approve_time_logs` ya usa este endpoint para `approval_status` |
| `/(timelogs)/bulkdelete` | DELETE | Elimina registros de tiempo; body: `{ id, module: { id, type } }` |
| `/projects/{id}/timelogs/approver` (GET) | GET | Obtiene el aprobador por defecto de registros de tiempo de un usuario en el proyecto |
| `/projects/{id}/timelogs/approver` (PATCH) | PATCH | Cambia el aprobador por defecto; body: `{ user: zpuid, approver: zpuid }` |
