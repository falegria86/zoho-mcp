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

## Timer automático (cron)

El script `scripts/auto-timer.js` inicia o detiene el timer de una tarea de Zoho automáticamente. La tarea objetivo se configura vía variables de entorno — **cada usuario apunta a su propia tarea sin tocar el código**.

```bash
npm run timer:start   # inicia el timer
npm run timer:stop    # detiene el timer
```

### Paso 1 — obtener los IDs de tu tarea

Abre la tarea en Zoho Projects y copia los IDs del URL:

```
https://projects.zoho.com/portal/miportal#zp/projects/106599000032339072/tasks/.../106599000033129351
                                                                ↑ project_id                ↑ task_id
```

### Paso 2 — obtener el refresh token

Corre el flujo de autenticación local una vez (`npm run setup`) y luego copia el valor de `refresh_token` de tu `tokens.json`:

```bash
cat tokens.json | python3 -c "import sys,json; print(json.load(sys.stdin)['refresh_token'])"
```

### Paso 3 — elegir dónde desplegar

---

#### Opción A — Railway *(recomendado, sin servidor propio)*

Railway ejecuta cron services como contenedores que corren el comando y terminan. Se necesitan **dos servicios** dentro del mismo proyecto Railway.

**Variables de entorno** (configurar en cada servicio):

```env
ZOHO_CLIENT_ID=tu_client_id
ZOHO_CLIENT_SECRET=tu_client_secret
ZOHO_PORTAL_NAME=tu_portal
ZOHO_REFRESH_TOKEN=tu_refresh_token
ZOHO_AUTO_TIMER_PROJECT_ID=id_numerico_del_proyecto
ZOHO_AUTO_TIMER_TASK_ID=id_numerico_de_la_tarea
TZ=America/Mexico_City
```

**Servicio 1 — iniciar timer**

| Campo | Valor |
|---|---|
| Tipo | Cron Job |
| Comando | `node scripts/auto-timer.js start` |
| Schedule (UTC) | `0 13 * * 1-5` *(8am CDMX, verano UTC-5)* |

**Servicio 2 — detener timer**

| Campo | Valor |
|---|---|
| Tipo | Cron Job |
| Comando | `node scripts/auto-timer.js stop` |
| Schedule (UTC) | `0 22 * * 1-5` *(5pm CDMX, verano UTC-5)* |

> **Timezone:** Railway siempre interpreta el schedule en UTC. Ajusta la hora según tu zona:
>
> | Zona | UTC offset | 8am en UTC | 5pm en UTC |
> |---|---|---|---|
> | CDMX verano (CDT) | UTC-5 | `0 13 * * 1-5` | `0 22 * * 1-5` |
> | CDMX invierno (CST) | UTC-6 | `0 14 * * 1-5` | `0 23 * * 1-5` |
> | Colombia / Perú | UTC-5 | `0 13 * * 1-5` | `0 22 * * 1-5` |
> | Argentina | UTC-3 | `0 11 * * 1-5` | `0 20 * * 1-5` |
> | España (verano) | UTC+2 | `0 6 * * 1-5` | `0 15 * * 1-5` |

Para verificar que funciona, usa el botón **"Run Now"** en cada servicio y revisa los logs. Deberías ver `Timer iniciado` o `Timer detenido`.

---

#### Opción B — VPS / servidor Linux *(Ubuntu, Debian, etc.)*

No necesitas `tokens.json` si defines `ZOHO_REFRESH_TOKEN` en el entorno. Clona el repo, instala dependencias y registra los crons:

```bash
git clone https://github.com/tu-org/zoho-projects-mcp.git /opt/zoho-mcp
cd /opt/zoho-mcp
npm install
cp .env.example .env   # edita con tus valores, incluyendo ZOHO_AUTO_TIMER_* y ZOHO_REFRESH_TOKEN
```

Edita el crontab:

```bash
crontab -e
```

Agrega las dos líneas (ajusta la hora a tu zona horaria del servidor):

```cron
0 8 * * 1-5 cd /opt/zoho-mcp && node scripts/auto-timer.js start >> /var/log/zoho-timer.log 2>&1
0 17 * * 1-5 cd /opt/zoho-mcp && node scripts/auto-timer.js stop >> /var/log/zoho-timer.log 2>&1
```

> Si el servidor corre en UTC, convierte las horas igual que en Railway. Verifica la zona del servidor con `timedatectl` y cámbiala si quieres usar hora local: `sudo timedatectl set-timezone America/Mexico_City`.

---

#### Opción C — Mac o Linux local *(la máquina debe estar encendida a esas horas)*

Requiere `tokens.json` generado por `npm run setup`. Registra los crons con `crontab -e`:

```cron
0 8 * * 1-5 cd /ruta/al/proyecto && node scripts/auto-timer.js start >> /tmp/zoho-timer.log 2>&1
0 17 * * 1-5 cd /ruta/al/proyecto && node scripts/auto-timer.js stop >> /tmp/zoho-timer.log 2>&1
```

En Mac, si la máquina duerme exactamente a esa hora el cron puede no dispararse. Una alternativa más robusta en Mac es usar `launchd` en lugar de `crontab`.

---

### Solución de problemas

| Síntoma | Posible causa |
|---|---|
| `ZOHO_AUTO_TIMER_PROJECT_ID y ZOHO_AUTO_TIMER_TASK_ID son requeridos` | Faltan esas variables de entorno |
| `No hay timer activo` al hacer stop | El timer no se inició antes (revisa logs del servicio start) |
| `Error 401` | El refresh token expiró — corre `npm run setup` localmente y actualiza `ZOHO_REFRESH_TOKEN` |
| Timer descartado (< 30 segundos) | Normal si se prueba con "Run Now" dos veces seguidas muy rápido |

## Arquitectura

```
src/
├── server.js        # Punto de entrada MCP — registra las 11 herramientas con esquemas Zod
├── zoho-client.js   # Cliente HTTP singleton — refresco automático de tokens en 401
└── setup-auth.js    # Flujo OAuth2 de una sola vez

scripts/
├── auto-timer.js    # Cron — inicia/detiene timer automáticamente (Railway, VPS o local)
├── my-open-tasks.js # Utilidad CLI — tareas abiertas del equipo en todos los proyectos
└── my-mentions.js   # Utilidad CLI — comentarios que te mencionan, con filtro de fechas
```

El cliente HTTP (`zoho-client.js`) intercepta respuestas 401, renueva el access token usando el refresh token y reintenta la solicitud original de forma transparente.

## Archivos sensibles

Los siguientes archivos contienen credenciales y están excluidos del repositorio (`.gitignore`):

- `.env` — variables de entorno con credenciales OAuth
- `tokens.json` — tokens de acceso activos generados por `npm run setup`
