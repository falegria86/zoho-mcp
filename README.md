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
```

- `ZOHO_PORTAL_NAME` — nombre del portal en la URL de Zoho Projects (por defecto: `sigobproyectos`)
- `ZOHO_MY_USER_ID` — ID numérico del usuario que se asigna por defecto al crear tareas; obténlo ejecutando `list_users` en cualquier proyecto

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

### Listar tareas abiertas del equipo

Script independiente que muestra las tareas abiertas asignadas a los miembros del equipo en todos los proyectos:

```bash
npm run team-tasks
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
- `estimated_hours` acepta decimales: `"8"` o `"1.5"`
- Para campos personalizados usa `list_task_fields` para obtener los `column_name` y pásalos en `custom_fields`:
  ```json
  { "UDF_CHAR1": "Backend" }
  ```

## Arquitectura

```
src/
├── server.js        # Punto de entrada MCP — registra las 11 herramientas con esquemas Zod
├── zoho-client.js   # Cliente HTTP singleton — refresco automático de tokens en 401
└── setup-auth.js    # Flujo OAuth2 de una sola vez

scripts/
└── my-open-tasks.js # Utilidad CLI — tareas abiertas del equipo en todos los proyectos
```

El cliente HTTP (`zoho-client.js`) intercepta respuestas 401, renueva el access token usando el refresh token y reintenta la solicitud original de forma transparente.

## Archivos sensibles

Los siguientes archivos contienen credenciales y están excluidos del repositorio (`.gitignore`):

- `.env` — variables de entorno con credenciales OAuth
- `tokens.json` — tokens de acceso activos generados por `npm run setup`
