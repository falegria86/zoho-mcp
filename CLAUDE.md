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

- **`src/server.js`** — Punto de entrada del servidor MCP. Registra las 10 herramientas con esquemas de parámetros Zod y delega cada una a `zohoClient`. La variable de entorno `ZOHO_PORTAL_NAME` (por defecto: `sigobproyectos`) define el portal en todas las rutas de la API.
- **`src/zoho-client.js`** — Cliente HTTP singleton para la API REST de Zoho Projects (`https://projectsapi.zoho.com/restapi`). Carga los tokens desde `tokens.json`, refresca automáticamente en respuesta 401 y reintenta la solicitud original una vez. Los cuerpos de solicitud usan `application/x-www-form-urlencoded`.
- **`src/setup-auth.js`** — Configuración OAuth2 de una sola vez: abre la URL de autorización, recibe el código via servidor HTTP local en el puerto 8080, lo intercambia por tokens y escribe `tokens.json`.

### Scripts utilitarios (`scripts/`)

Utilidades independientes que no forman parte del servidor MCP. Todas usan `zohoClient` directamente y requieren `.env`.

**`scripts/my-open-tasks.js`** — `npm run team-tasks`
Lista todas las tareas abiertas asignadas a miembros del equipo SIGOB en todos los proyectos del portal. Los emails y fragmentos de nombre del equipo están hardcodeados en el archivo.

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
- `ZOHO_PORTAL_NAME` — nombre del portal (por defecto: `sigobproyectos`)
- `ZOHO_MY_USER_ID` — ID numérico del usuario por defecto para asignación automática en `create_task` (obtenerlo con `list_users` en cualquier proyecto)
- `ZOHO_MY_NAME` — nombre completo del usuario (opcional); usado por `my-mentions` para detectar menciones por nombre
- `ZOHO_TEAM_EMAILS` — emails del equipo separados por comas; usado por `team-tasks` (ej: `user1@empresa.com,user2@empresa.com`)
- `ZOHO_TEAM_NAMES` — fragmentos de nombre separados por comas para detectar miembros por nombre (ej: `jose ramon,tejeda,kevin`)

`tokens.json` (generado por `npm run setup`) almacena los tokens OAuth activos incluyendo el refresh token. Ambos archivos están en `.gitignore` y son requeridos en tiempo de ejecución.

El refresco de tokens es transparente: `zoho-client.js` reintenta cualquier 401 automáticamente con un token de acceso nuevo y luego persiste el nuevo token en disco.

## Herramientas MCP Expuestas

`list_projects`, `list_tasks`, `get_task`, `create_task`, `update_task`, `list_comments`, `add_comment`, `list_users`, `start_timer`, `stop_timer`, `list_task_fields`. Todas las herramientas reciben `project_id` como parámetro requerido, excepto `list_projects`.

### Creación rápida de tareas (`create_task`)

- `project_id` acepta nombre o ID numérico (ej: `"sigob-sir-lite"` o `"123456"`)
- Si no se especifica `person_responsible`, se asigna automáticamente el usuario en `ZOHO_MY_USER_ID`
- Campos disponibles: `name`, `description`, `priority`, `start_date`, `due_date`, `estimated_hours` (decimal, ej: `"8"` o `"1.5"`), `tasklist_id`, `custom_fields`
- Para campos personalizados (área técnica, tamaño, etc.), usar `list_task_fields` para obtener los `column_name` correspondientes y pasarlos en `custom_fields` como `{"UDF_CHAR1": "valor"}`
