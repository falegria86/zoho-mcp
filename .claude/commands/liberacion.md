---
description: Genera un Documento de Liberación de Versión (MD + HTML + PDF con marca SIGOB) a partir de URLs de tareas/issues de Zoho
argument-hint: <Ver.XXXXXX.XXX> <URLs de Zoho separadas por espacio o salto de línea>
---

Genera un **Documento de Liberación de Versión** siguiendo el instructivo del repo `docs/guias/PLAYBOOK-documento-liberacion.md`. Léelo primero y respeta todos sus pasos y gotchas.

## Entrada del usuario
$ARGUMENTS

El primer token con formato `Ver.XXXXXX.XXX` es el **número de versión**. El resto son **URLs de Zoho Projects** (tareas `task-detail` e issues `issue-detail`). Si falta la versión, pídela antes de continuar.

## Pasos a ejecutar

1. **Verifica credenciales**: debe existir `.env` y `tokens.json`. Si falta `tokens.json` o la lectura de issues da `INVALID_OAUTHSCOPE`, indica correr `npm run setup` (con el scope `ZohoProjects.bugs.ALL` presente en `src/setup-auth.js`). Todo script que use `zohoClient` debe correr con `node --env-file=.env`.

2. **Parsea cada URL**: tipo (`task-detail`→tarea, `issue-detail`→issue), ID (último número), y `project_id` (tras `/projects/`). Si la URL es de vista de portal sin proyecto, resuelve el proyecto probando el ID contra los proyectos candidatos.

3. **Resuelve el portal** a ID numérico vía `GET /api/v3/portals` (portal `sigobproyectos`).

4. **Descarga** de cada elemento: detalle + comentarios.
   - Tareas: `GET /api/v3/portal/{P}/projects/{proj}/tasks/{id}`
   - Issues: `GET /api/v3/portal/{P}/projects/{proj}/bugs/{id}?is_desc_needed=true` (respuesta `{bugs:[...]}`)

5. **Revisor de operaciones**: tareas → campo top-level `revisor.name`; issues → endpoint V2 `GET /restapi/portal/{P}/projects/{proj}/bugs/{id}/` → `customfields[]` con `label_name==="Revisor operaciones"` → `user_name`. Ojo con el gotcha de IDs de 18 dígitos (usar `id_string` / pre-escapar como string).

6. **Arma 3 formatos coherentes**:
   - Markdown `LIBERACION-<PROYECTO>-<fecha>.md`
   - HTML `liberacion-<proyecto>.html` con estilo de marca SIGOB (azul `#3C4E5D`, dorado `#C7B383`, logo `sigob-5.png`), portada con la **versión**, tabla resumen (con columna *Revisor de operaciones*), ficha por elemento, consideraciones de despliegue (migraciones/PRs, dependencias, terceros como SIMUN, acciones operativas) y checklist.
   - PDF: `node scripts/html-to-pdf.mjs <input.html> LIBERACION-<PROYECTO>-<Ver>.pdf`

7. **Redacción precisa**: no inventes datos. Si la validación no la hizo un equipo de QA, atribúyela al *Revisor de operaciones* sobre el ambiente QA. Marca con ⚠️ los PRs con migraciones y las acciones externas.

## Reglas
- **Antes de escribir/actualizar cualquier cosa en Zoho, confirma con el usuario.** Este comando por defecto solo LEE de Zoho y genera archivos locales.
- Al final, entrega la ruta del PDF, verifica visualmente la portada con `qlmanage -t`, y ofrece un **título + descripción** para notas de PMO.
