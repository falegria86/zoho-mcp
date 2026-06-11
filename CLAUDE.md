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
```

No hay paso de compilación ni pruebas — el proyecto corre directamente como módulos ES.

## Arquitectura

Tres archivos fuente con separación clara de responsabilidades:

- **`src/server.js`** — Punto de entrada del servidor MCP. Al arrancar llama a `GET /api/v3/portals` para resolver el nombre del portal (`ZOHO_PORTAL_NAME`) a su ID numérico requerido por V3, y lo almacena en la variable `PORTAL`. Registra las 11 herramientas con esquemas de parámetros Zod y delega cada una a `zohoClient`.
- **`src/zoho-client.js`** — Cliente HTTP singleton para la API REST de Zoho Projects (`https://projectsapi.zoho.com/api/v3`). Carga los tokens desde `tokens.json`, refresca automáticamente en respuesta 401 y reintenta la solicitud original una vez. Los cuerpos de solicitud usan `application/json`.
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
- `ZOHO_REFRESH_TOKEN` — refresh token OAuth; reemplaza a `tokens.json` en Railway/entornos sin filesystem persistente

`tokens.json` (generado por `npm run setup`) almacena los tokens OAuth activos incluyendo el refresh token. Ambos archivos están en `.gitignore` y son requeridos en tiempo de ejecución.

El refresco de tokens es transparente: `zoho-client.js` reintenta cualquier 401 automáticamente con un token de acceso nuevo y luego persiste el nuevo token en disco.

## Herramientas MCP Expuestas

`list_projects`, `list_tasks`, `get_task`, `create_task`, `update_task`, `list_comments`, `add_comment`, `list_users`, `start_timer`, `stop_timer`, `list_task_fields`. Todas las herramientas reciben `project_id` como parámetro requerido, excepto `list_projects`.

### Creación rápida de tareas (`create_task`)

- `project_id` acepta nombre o ID numérico (ej: `"sigob-sir-lite"` o `"123456"`)
- Si no se especifica `person_responsible`, se asigna automáticamente el usuario en `ZOHO_MY_USER_ID`
- Campos disponibles: `name`, `description`, `priority` (lowercase: `high/medium/low/none`), `start_date`, `due_date` (formato MM-DD-YYYY, se convierte a ISO internamente), `tasklist_id`, `custom_fields`
- `start_date` es **requerida por la API de Zoho**; si no se proporciona, el servidor usa la fecha de hoy automáticamente
- Para campos personalizados usar `list_task_fields` para obtener los `api_name` y pasarlos en `custom_fields` como `{"cf_area_tecnica": "Backend"}`
- `description` se convierte automáticamente a HTML antes de enviarse a Zoho (ver abajo); si ya contiene HTML se envía tal cual

### Formato HTML automático de descripciones

La función `toHtmlDescription` en `server.js` convierte texto plano a HTML estructurado para `create_task` y `update_task`:

- Líneas en **MAYÚSCULAS** → `<h3>TÍTULO</h3><br><br>`
- Líneas con `-`, `*` o `•` → `<ul><li>...</li></ul>`
- Resto de líneas → `<p>texto</p>`
- Si la descripción ya contiene etiquetas HTML, se pasa sin modificar

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

### Respuesta de proyectos

`GET /api/v3/portal/{id}/projects` devuelve un **array directo** `[{...}]`, no `{ projects: [...] }`. El código usa `Array.isArray(r) ? r : (r.projects || [])` para manejar ambos formatos.

El objeto proyecto en V3 tiene `status` como objeto `{ id, name, color, is_closed_type }`, no string.

### Portal ID numérico

V3 requiere ID numérico del portal en todas las rutas. El servidor resuelve esto automáticamente al arrancar:

```
GET /api/v3/portals  →  [ { portal_name: "sigobproyectos", id: "123456789", ... } ]
```

La función `initPortalId()` en `server.js` busca el portal por `portal_name`, `org_name` o `name` y actualiza la variable `PORTAL` con el ID numérico antes de aceptar cualquier tool call. Si `ZOHO_PORTAL_NAME` ya es numérico, se usa directamente sin llamar al endpoint.
