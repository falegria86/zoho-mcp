# Playbook — Cómo generar un Documento de Liberación de Versión desde Zoho

Guía reproducible del proceso usado para generar el documento de liberación TLJ-CAT (`Ver.260721.034`) a partir de una lista de URLs de tareas/issues de Zoho Projects. Sirve como referencia para futuras liberaciones.

## 0. Requisitos

- `.env` con `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_PORTAL_NAME=sigobproyectos`.
- `tokens.json` generado con `npm run setup` (OAuth). **Scopes necesarios**: además de los de tareas, se requiere `ZohoProjects.bugs.ALL` para leer *issues* (bugs). Si falta, la API responde `INVALID_OAUTHSCOPE` — hay que re-autorizar con el scope agregado en `src/setup-auth.js`.
- `npm install` (incluye `puppeteer`, que descarga su propio Chromium para el PDF).

## 1. Identificar los elementos

De cada URL de Zoho se extrae:
- **Tipo**: `task-detail` → tarea · `issue-detail` → issue (bug).
- **ID**: último número de la URL.
- **project_id**: el número tras `/projects/`. Si la URL es de vista de portal (sin `/projects/`), se resuelve probando el ID de la tarea contra los proyectos candidatos.

## 2. Resolver el portal a ID numérico

V3 requiere el **ID numérico** del portal (no el nombre):
```
GET /api/v3/portals  →  busca portal_name === "sigobproyectos"  →  id = 920809
```

## 3. Descargar detalle + comentarios

Rutas base: `https://projectsapi.zoho.com`

| Dato | Método / ruta | Notas |
|---|---|---|
| Tarea (detalle) | `GET /api/v3/portal/{P}/projects/{proj}/tasks/{id}` | Devuelve el objeto task directo. `name`, `description`, `status.name`, `priority`, `owners_and_work.owners[]`, `revisor` (custom field). |
| Comentarios tarea | `GET /api/v3/.../tasks/{id}/comments` | — |
| Issue/bug (detalle) | `GET /api/v3/portal/{P}/projects/{proj}/bugs/{id}?is_desc_needed=true` | **Requiere** `is_desc_needed=true` o da `LESS_THAN_MIN_OCCURANCE`. Respuesta: `{ bugs: [ {...} ] }`. Campos: `title`, `description`, `severity.type`, `classification.type`, `customfields[]`. |

## 4. Campo "Revisor de operaciones"

- **Tareas (V3)**: viene como campo top-level `revisor` = `{ name, zpuid, email, ... }`. (`revisor_de_desarrollo` es el revisor de desarrollo.)
- **Issues/bugs**: el detalle V3 **no** trae el valor del custom field de usuario. Hay que usar el endpoint **V2/restapi**:
  ```
  GET /restapi/portal/{P}/projects/{proj}/bugs/{id}/
  ```
  y leer `customfields[]` buscando `label_name === "Revisor operaciones"` → campo `user_name` (y `value` = zpuid).

## 5. Limpieza de descripciones (HTML de Zoho)

Las descripciones vienen en HTML. Para volcarlas a texto legible en el documento:
- Decodificar entidades: `&quot;`→`"`, `&gt;`→`>`, `&amp;`→`&`, `&nbsp;`→espacio.
- Reemplazar `<img>` por `[imagen]`, `<br>`/`</p>`/`</div>` por saltos de línea, `<li>` por viñeta.

## 6. Armar el documento

Se generan 3 formatos coherentes:
1. **Markdown** (`LIBERACION-TLJ-CAT-<fecha>.md`) — fuente auditable.
2. **HTML** (`docs/liberaciones/TLJ-CAT/2026-07-20.html`) — con estilos de marca SIGOB (azul pizarra `#3C4E5D`, dorado `#C7B383`), portada con logo (`assets/sigob-5.png`, referenciado con ruta relativa desde el HTML), tabla resumen, ficha por elemento, consideraciones de despliegue y checklist.
3. **PDF** — renderizando el HTML con Puppeteer:
   ```
   node scripts/html-to-pdf.mjs docs/liberaciones/TLJ-CAT/2026-07-20.html docs/liberaciones/TLJ-CAT/2026-07-20-Ver.XXXX.pdf
   ```
   (A4, `printBackground: true`, encabezado/pie con numeración de página.)

### Estructura del documento
1. Portada: sistema, portal, proyecto, **versión**, fecha, badge de estado, nota de validación.
2. Resumen: tabla con #, ID, tipo, severidad/prioridad, **revisor de operaciones**, estado.
3. Detalle por elemento: descripción, causa/solución, PR, revisor, validación.
4. Consideraciones de despliegue: migraciones (PRs que las contienen), dependencias de datos, coordinación con terceros (SIMUN), acciones operativas, tabla de PRs.
5. Checklist de liberación.

## 7. Buenas prácticas de este flujo

- **Confirmar antes de escribir** en Zoho (updates masivos son producción).
- **Precisar la fuente de la validación**: si no hubo equipo de QA, atribuir al *Revisor de operaciones* sobre el ambiente QA (no inventar un "QA validó").
- Guardar **respaldo** de cualquier dato antes de sobrescribir.
- **Gotcha de IDs**: los IDs de tareas de 18 dígitos exceden `Number.MAX_SAFE_INTEGER`; al parsear respuestas V2 leer `id_string` o pre-escapar los números como string. Ver `memory/subtasks-v2-endpoint.md`.

## Verbatim de comandos clave
```bash
node --env-file=.env scripts/... # cualquier script que use zohoClient necesita cargar .env
node scripts/html-to-pdf.mjs <input.html> <output.pdf>
qlmanage -t -s 1000 -o <dir> <archivo.pdf>   # miniatura para verificar visualmente
```
