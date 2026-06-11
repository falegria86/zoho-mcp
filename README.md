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
- `ZOHO_AUTO_TIMER_PROJECT_ID` — ID numérico del proyecto para el timer automático (ver sección Railway)
- `ZOHO_AUTO_TIMER_TASK_ID` — ID numérico de la tarea en la que se inicia/detiene el timer automático
- `ZOHO_REFRESH_TOKEN` — refresh token OAuth; solo necesario en entornos sin `tokens.json` (Railway, CI)

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

### Formato HTML de descripciones

El campo `description` en `create_task` y `update_task` se convierte automáticamente a HTML antes de enviarse a Zoho, para que se renderice correctamente en la interfaz.

- Si el texto **ya contiene HTML**, se envía tal cual.
- Si es **texto plano**, se aplica la siguiente conversión:

| Entrada | HTML generado |
|---|---|
| Línea en MAYÚSCULAS (ej: `SITUACIÓN ACTUAL`) | `<h3>SITUACIÓN ACTUAL</h3><br><br>` |
| Línea con `-`, `*` o `•` al inicio | Agrupada en `<ul><li>...</li></ul>` |
| Cualquier otro texto | `<p>texto</p>` |

**Ejemplo de entrada:**

```
SITUACIÓN ACTUAL
El sistema presenta errores al guardar.

LO QUE SE NECESITA
- Revisar el endpoint de guardado
- Agregar validación en el frontend

ARCHIVOS A MODIFICAR
src/api/save.js
```

**HTML generado:**

```html
<h3>SITUACIÓN ACTUAL</h3><br><br><p>El sistema presenta errores al guardar.</p><h3>LO QUE SE NECESITA</h3><br><br><ul><li>Revisar el endpoint de guardado</li><li>Agregar validación en el frontend</li></ul><h3>ARCHIVOS A MODIFICAR</h3><br><br><p>src/api/save.js</p>
```

## Timer automático con Railway (cron)

El script `scripts/auto-timer.js` inicia o detiene el timer de una tarea de Zoho según el argumento que recibe. La tarea objetivo se configura vía variables de entorno, por lo que **cada usuario puede apuntar a su propia tarea** sin tocar el código.

```bash
npm run timer:start   # inicia el timer en ZOHO_AUTO_TIMER_TASK_ID
npm run timer:stop    # detiene el timer
```

### Variables de entorno requeridas

```env
ZOHO_AUTO_TIMER_PROJECT_ID=106599000032339072
ZOHO_AUTO_TIMER_TASK_ID=106599000033129351
ZOHO_REFRESH_TOKEN=<tu_refresh_token de tokens.json>
```

> `ZOHO_REFRESH_TOKEN` reemplaza a `tokens.json` en entornos sin sistema de archivos persistente. Lo encuentras en tu `tokens.json` local bajo la clave `refresh_token`.

### Configuración en Railway

Railway ejecuta cada cron service como un contenedor que corre el comando y termina. Se necesitan **dos servicios** en el mismo proyecto:

**Servicio 1 — iniciar timer**

| Campo | Valor |
|---|---|
| Tipo | Cron Job |
| Comando | `node scripts/auto-timer.js start` |
| Schedule | `0 8 * * 1-5` *(lunes a viernes 8am)* |

**Servicio 2 — detener timer**

| Campo | Valor |
|---|---|
| Tipo | Cron Job |
| Comando | `node scripts/auto-timer.js stop` |
| Schedule | `0 17 * * 1-5` *(lunes a viernes 5pm)* |

**Variables de entorno en Railway** (en cada servicio):

```
ZOHO_CLIENT_ID
ZOHO_CLIENT_SECRET
ZOHO_PORTAL_NAME
ZOHO_REFRESH_TOKEN
ZOHO_AUTO_TIMER_PROJECT_ID
ZOHO_AUTO_TIMER_TASK_ID
TZ=America/Mexico_City
```

> Railway corre en UTC. Definir `TZ=America/Mexico_City` hace que los logs muestren la hora local correcta, pero el schedule del cron **siempre se interpreta en UTC**. Para 8am Ciudad de México (UTC-6) usa `0 14 * * 1-5`; para 5pm (UTC-6) usa `0 23 * * 1-5`. Si el horario de verano (UTC-5) es relevante, ajusta una hora.

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
