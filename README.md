# zoho-projects-mcp

Servidor [MCP (Model Context Protocol)](https://modelcontextprotocol.io) que conecta **Zoho Projects** con **Claude AI**. Permite gestionar proyectos y tareas, registrar tiempo y manejar comentarios directamente desde conversaciones con Claude.

## Requisitos

- Node.js 18+
- Cuenta de Zoho Projects con acceso a la API
- Claude Desktop (u otro cliente MCP compatible)

## Instalación

```bash
git clone https://github.com/tu-org/zoho-projects-mcp.git
cd zoho-projects-mcp
npm install
```

## Configuración

### 1. Variables de entorno

Crea un archivo `.env` en la raíz del proyecto:

```env
ZOHO_CLIENT_ID=tu_client_id
ZOHO_CLIENT_SECRET=tu_client_secret
ZOHO_PORTAL_NAME=nombre_de_tu_portal
ZOHO_MY_USER_ID=tu_id_de_usuario_numerico
ZOHO_MY_NAME=Tu Nombre Completo
ZOHO_TEAM_EMAILS=usuario1@empresa.com,usuario2@empresa.com
ZOHO_TEAM_NAMES=nombre1,apellido1,nombre2,apellido2
```

- `ZOHO_PORTAL_NAME` — nombre del portal en la URL de Zoho Projects (por defecto: `sigobproyectos`)
- `ZOHO_MY_USER_ID` — ID numérico del usuario que se asigna por defecto al crear tareas; obténlo ejecutando `list_users` en cualquier proyecto
- `ZOHO_MY_NAME` — nombre completo del usuario (opcional); amplía la detección de menciones por nombre en `my-mentions`
- `ZOHO_TEAM_EMAILS` — lista separada por comas de emails del equipo para `team-tasks`
- `ZOHO_TEAM_NAMES` — fragmentos de nombre separados por comas para detectar miembros del equipo por nombre (ej: `"jose ramon,tejeda,kevin"`)

> Para crear las credenciales OAuth, registra una aplicación en la [Consola de Desarrolladores de Zoho](https://api-console.zoho.com/) con URI de redirección `http://localhost:8080/callback`.

### 2. Autenticación OAuth2

Ejecuta el flujo de autenticación una sola vez. Abrirá el navegador para autorizar la app y guardará los tokens en `tokens.json`:

```bash
npm run setup
```

Los tokens se renuevan automáticamente; no es necesario repetir este paso.

### 3. Integrar con Claude Desktop

Agrega el servidor al archivo de configuración de Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "zoho-projects": {
      "command": "node",
      "args": ["/ruta/absoluta/al/proyecto/src/server.js"]
    }
  }
}
```

## Uso

### Iniciar el servidor manualmente

```bash
npm start
```

### Scripts de utilidad

**Tareas abiertas del equipo**

Muestra las tareas abiertas asignadas a los miembros del equipo en todos los proyectos. Requiere `ZOHO_TEAM_EMAILS` y/o `ZOHO_TEAM_NAMES` en `.env`:

```bash
npm run team-tasks
```

**Menciones en comentarios**

Busca todos los comentarios donde te mencionan (`[~ZOHO_MY_USER_ID]`) en uno o todos los proyectos. Soporta filtro por rango de fechas:

```bash
npm run my-mentions                                        # todos los proyectos
npm run my-mentions -- "nombre-proyecto"                  # un proyecto específico
npm run my-mentions -- --from=2026-05-01 --to=2026-06-09 # con rango de fechas
npm run my-mentions -- "nombre-proyecto" --from=2026-06-01
```

## Herramientas MCP disponibles

| Herramienta | Descripción | Parámetros requeridos |
|---|---|---|
| `list_projects` | Lista todos los proyectos del portal | — |
| `list_tasks` | Lista las tareas de un proyecto | `project_id` |
| `get_task` | Detalle completo de una tarea | `project_id`, `task_id` |
| `create_task` | Crea una nueva tarea | `project_id`, `name` |
| `update_task` | Actualiza estado, prioridad, responsable, etc. | `project_id`, `task_id` |
| `list_comments` | Lista los comentarios de una tarea | `project_id`, `task_id` |
| `add_comment` | Agrega un comentario a una tarea | `project_id`, `task_id`, `content` |
| `list_users` | Lista los usuarios de un proyecto | `project_id` |
| `list_task_fields` | Lista los campos personalizados disponibles | `project_id` |
| `start_timer` | Inicia el timer de tiempo en una tarea | `project_id`, `task_id` |
| `stop_timer` | Detiene el timer de una tarea | `project_id`, `task_id` |

### Notas sobre `create_task`

- `project_id` acepta nombre o ID numérico: `"sigob-sir-lite"` o `"123456789"`
- Si no se especifica `person_responsible`, se asigna automáticamente `ZOHO_MY_USER_ID`
- `priority` debe ir en minúsculas: `"high"`, `"medium"`, `"low"`, `"none"`
- `start_date` y `due_date` usan formato `MM-DD-YYYY` (se convierten a ISO internamente)
- Para campos personalizados usa `list_task_fields` para obtener los `api_name` y pásalos en `custom_fields`:
  ```json
  { "cf_area_tecnica": "Backend" }
  ```

## Arquitectura

```
src/
├── server.js        # Punto de entrada MCP — registra las 11 herramientas con esquemas Zod
├── zoho-client.js   # Cliente HTTP singleton — refresco automático de tokens en 401
└── setup-auth.js    # Flujo OAuth2 de una sola vez

scripts/
├── my-open-tasks.js # Utilidad CLI — tareas abiertas del equipo en todos los proyectos
└── my-mentions.js   # Utilidad CLI — comentarios que te mencionan, con filtro de fechas
```

El cliente HTTP (`zoho-client.js`) intercepta respuestas 401, renueva el access token usando el refresh token y reintenta la solicitud original de forma transparente.

## Archivos sensibles

Los siguientes archivos contienen credenciales y están excluidos del repositorio (`.gitignore`):

- `.env` — variables de entorno con credenciales OAuth
- `tokens.json` — tokens de acceso activos generados por `npm run setup`
