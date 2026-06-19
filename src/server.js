import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { zohoClient } from "./zoho-client.js";

const PORTAL_NAME = process.env.ZOHO_PORTAL_NAME || "sigobproyectos";
const server = new McpServer({ name: "Zoho Projects", version: "1.0.0" });

const text = (str) => ({ content: [{ type: "text", text: String(str) }] });
const toZpuid = (id) => (id != null ? String(id).trim() : "") || undefined;

let PORTAL = PORTAL_NAME;

async function initPortalId() {
  if (/^\d+$/.test(PORTAL_NAME)) return;
  const portals = await zohoClient.get("/portals");
  const list = Array.isArray(portals) ? portals : (portals.portals || []);
  const match = list.find(p =>
    p.portal_name === PORTAL_NAME ||
    p.org_name === PORTAL_NAME ||
    p.name === PORTAL_NAME
  );
  if (match?.id) PORTAL = String(match.id);
}

async function resolveProjectId(nameOrId) {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const r = await zohoClient.get(`/portal/${PORTAL}/projects`);
  const list = Array.isArray(r) ? r : (r.projects || []);
  const match = list.find(p =>
    p.name.toLowerCase() === nameOrId.toLowerCase() ||
    p.name.toLowerCase().includes(nameOrId.toLowerCase())
  );
  if (!match) throw new Error(`No se encontró proyecto con nombre: "${nameOrId}"`);
  return match.id;
}

// Devuelve el conjunto de zpuids de los miembros de un proyecto, para validar que los
// campos de usuario (propietario, revisores) apunten a alguien que sí pertenece al proyecto.
async function fetchProjectMembers(projectId) {
  const r = await zohoClient.get(`/portal/${PORTAL}/projects/${projectId}/users`);
  return new Set((r.users || []).map(u => toZpuid(u.zpuid || u.id)).filter(Boolean));
}

function toISODate(mmddyyyy) {
  if (!mmddyyyy) return undefined;
  const [m, d, y] = mmddyyyy.split("-");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

// Convierte horas decimales o enteras (ej: "8", "1.5") al formato "H:MM" que espera Zoho
function toHHMM(hours) {
  const val = parseFloat(hours);
  const total = Math.round((Number.isFinite(val) ? val : 8) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

function toHtmlDescription(text) {
  if (!text) return text;
  if (/<[a-z][\s\S]*>/i.test(text)) return text;

  const lines = text.split("\n");
  const out = [];
  let listItems = [];

  const flushList = () => {
    if (!listItems.length) return;
    out.push(`<ul>${listItems.map(i => `<li>${i}</li>`).join("")}</ul>`);
    listItems = [];
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); continue; }

    if (/^[-*•]\s+/.test(line)) {
      listItems.push(line.replace(/^[-*•]\s+/, ""));
      continue;
    }

    flushList();

    // Heading: all-caps line (optionally ending with :), at least 3 chars
    if (/^[A-ZÁÉÍÓÚÜÑ0-9\s,.()\-_:]{3,}$/.test(line) && line === line.toUpperCase()) {
      out.push(`<h3>${line.replace(/:$/, "")}</h3><br><br>`);
    } else {
      out.push(`<p>${line}</p>`);
    }
  }

  flushList();
  return out.join("");
}

// Construye los campos v3 compartidos por create_task y create_subtask: propietario y horas
// (dentro de owners_and_work), revisores con default validado por membresía, tamaño y campos
// personalizados. No incluye name/start_date/tasklist; cada llamador los agrega.
async function buildTaskV3Fields({ resolvedId, person_responsible, estimated_hours, priority, description, due_date, custom_fields }) {
  const responsible = toZpuid(person_responsible || process.env.ZOHO_MY_USER_ID);
  const workHHMM = toHHMM(estimated_hours ?? "8");

  const body = {};
  if (description) body.description = toHtmlDescription(description);
  if (priority)    body.priority = priority;
  // En V3 las horas viven dentro de owners_and_work (total_work + work_values por owner);
  // el campo top-level "work" se ignora silenciosamente.
  body.owners_and_work = { work_type: "standard", total_work: workHHMM, unit: "hours", copy_task_duration: false };
  if (responsible) body.owners_and_work.owners = [{ zpuid: responsible, work_values: workHHMM }];
  if (due_date)    body.end_date = toISODate(due_date);
  if (custom_fields) {
    for (const [key, val] of Object.entries(custom_fields)) {
      // Quote large integers in zpuid fields before parsing to preserve 18-digit precision
      const safe = val.replace(/"zpuid"\s*:\s*(\d{15,})/g, '"zpuid":"$1"');
      try { body[key] = JSON.parse(safe); } catch { body[key] = val; }
    }
  }

  // El revisor por defecto debe ser miembro del proyecto. revisor (Revisor operaciones) suele
  // ser obligatorio, así que no basta omitirlo: usamos ZOHO_MY_USER_ID si es miembro, y si no,
  // caemos al propietario de la tarea (que sí asignamos como owner).
  const myId = toZpuid(process.env.ZOHO_MY_USER_ID);
  if (!body.revisor || !body.revisor_de_desarrollo) {
    const members = await fetchProjectMembers(resolvedId);
    const defaultReviewer =
      (myId && members.has(myId)) ? myId :
      (responsible && members.has(responsible)) ? responsible : undefined;
    if (defaultReviewer) {
      if (!body.revisor)               body.revisor               = { zpuid: defaultReviewer };
      if (!body.revisor_de_desarrollo) body.revisor_de_desarrollo = { zpuid: defaultReviewer };
    }
  }
  if (!body.tamano_de_tarea_1_facil_5_dificil) body.tamano_de_tarea_1_facil_5_dificil = "3";
  return body;
}

// Envía la tarea reintentando sin los campos de usuario que Zoho rechaza por no ser miembros
// del proyecto (ej: revisor/revisor_de_desarrollo apuntando a un no-miembro). Sin esto, un
// solo usuario inválido aborta toda la operación con un 400. method: "post" (crear) o "patch".
async function sendTaskResilient(method, path, body) {
  const stripped = [];
  let t;
  for (let i = 0; i < 5; i++) {
    t = await zohoClient[method](path, body);
    if (t?.id) break;
    const details = t?.error?.details;
    if (!Array.isArray(details)) break;
    const toStrip = details
      .filter(d => /not available in the project/i.test(d.message || ""))
      .map(d => d.field_name)
      .filter(f => f && f in body);
    if (!toStrip.length) break;
    for (const f of toStrip) { delete body[f]; stripped.push(f); }
  }
  return { t, stripped };
}

// ── list_projects ────────────────────────────────────────────────────────────
server.tool("list_projects", "Lista todos los proyectos del portal. Devuelve ID numérico, nombre y estado de cada proyecto. Usa el ID numérico (no el nombre) en las demás herramientas para evitar búsquedas adicionales; aunque list_tasks y list_users también aceptan nombre, el ID es más rápido y preciso.", {}, async () => {
  const r = await zohoClient.get(`/portal/${PORTAL}/projects`);
  const projects = Array.isArray(r) ? r : (r.projects || []);
  if (!projects.length) return text("No se encontraron proyectos.");
  return text(projects.map(p =>
    `ID: ${p.id} | Nombre: ${p.name} | Estado: ${p.status?.name || p.status || "N/A"}`
  ).join("\n"));
});

// ── list_tasks ────────────────────────────────────────────────────────────────
server.tool(
  "list_tasks",
  "Lista TODAS las tareas de un proyecto (paginación automática, sin límite de página). Cada tarea incluye: id, name, status.name, status.is_closed_type, is_completed, priority, owners_and_work.owners[]{name,email,zpuid}, end_date. IMPORTANTE: filtra en memoria — NO uses el parámetro 'status' para filtrar por nombre de estado (los IDs varían por portal). Usa 'is_completed === false' para abiertas, 'status.is_closed_type === true' para cerradas, y 'owners_and_work.owners[].name' para filtrar por persona. Para obtener el ID numérico de un estado: (1) filtra en memoria por status.name para encontrar una tarea con ese estado, (2) llama a get_task con esa tarea y lee el id entre paréntesis en el campo Estado.",
  {
    project_id: z.string().describe("ID numérico del proyecto (obtenlo con list_projects)"),
    status: z.string().optional().describe('Filtro de API: "open", "closed", "overdue". Poco confiable porque depende de IDs de estado específicos del portal. Preferir filtrar en memoria por is_completed.'),
  },
  async ({ project_id, status }) => {
    const params = {};
    if (status) params.filter = JSON.stringify({ criteria: [{ field_name: "status", criteria_condition: "is", value: status }], pattern: "1" });
    const tasks = await zohoClient.getAllPages(`/portal/${PORTAL}/projects/${project_id}/tasks`, params);
    if (!tasks.length) return text("No se encontraron tareas.");
    return text(tasks.map(t => {
      const owners = (t.owners_and_work?.owners || []).map(o => o.name).join(", ") || "Sin asignar";
      return `ID: ${t.id} | ${t.name} | Estado: ${t.status?.name || "N/A"} | Prioridad: ${t.priority || "N/A"} | Asignado: ${owners}`;
    }).join("\n"));
  }
);

// ── get_task ──────────────────────────────────────────────────────────────────
server.tool(
  "get_task",
  "Obtiene el detalle completo de una tarea: nombre, estado, prioridad, responsable, fechas, descripción y campos personalizados. Útil para obtener el status.id real del portal antes de construir filtros, o para leer campos personalizados (cf_*) que list_tasks no expone.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    task_id:    z.string().describe("ID numérico de la tarea"),
  },
  async ({ project_id, task_id }) => {
    const t = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}`);
    if (!t?.id) return text("Tarea no encontrada.");
    const owners = (t.owners_and_work?.owners || []).map(o => o.name).join(", ") || "Sin asignar";
    return text([
      `Nombre:        ${t.name}`,
      `ID:            ${t.id}`,
      `Estado:        ${t.status?.name || "N/A"} (id: ${t.status?.id || "N/A"}, cerrado: ${t.status?.is_closed_type ?? "N/A"})`,
      `Completada:    ${t.is_completed ?? "N/A"}`,
      `Prioridad:     ${t.priority || "N/A"}`,
      `Asignado a:    ${owners}`,
      `Fecha inicio:  ${t.start_date ? t.start_date.slice(0, 10) : "Sin fecha"}`,
      `Fecha límite:  ${t.end_date ? t.end_date.slice(0, 10) : "Sin fecha"}`,
      `% completado:  ${t.completion_percentage ?? "N/A"}`,
      `Lista:         ${t.tasklist?.id || "N/A"}`,
      `Descripción:   ${t.description || "Sin descripción"}`,
    ].join("\n"));
  }
);

// ── create_task ───────────────────────────────────────────────────────────────
server.tool(
  "create_task",
  "Crea una nueva tarea. Acepta nombre o ID de proyecto. Defaults si no se especifican: propietario=ZOHO_MY_USER_ID, revisor=ZOHO_MY_USER_ID, revisor_de_desarrollo=ZOHO_MY_USER_ID, horas=8, tamaño=3. Los campos de usuario que no sean miembros del proyecto se omiten automáticamente en vez de hacer fallar la creación.",
  {
    project_id:         z.string().describe("ID numérico o nombre del proyecto (ej: 'sigob-sir-lite')"),
    name:               z.string().describe("Nombre de la tarea"),
    description:        z.string().optional().describe("Descripción"),
    priority:           z.enum(["high", "medium", "low", "none"]).optional(),
    person_responsible: z.string().optional().describe("ID (zpuid) del usuario responsable (por defecto: ZOHO_MY_USER_ID del .env)"),
    start_date:         z.string().optional().describe("Fecha de inicio MM-DD-YYYY (requerida por Zoho; por defecto: hoy)"),
    due_date:           z.string().optional().describe("Fecha de vencimiento MM-DD-YYYY"),
    estimated_hours:    z.string().optional().describe("Horas de trabajo estimadas (decimal, ej: '8' o '1.5'; por defecto: 8)"),
    tasklist_id:        z.string().optional().describe("ID de la lista de tareas"),
    custom_fields:      z.record(z.string()).optional().describe("Campos personalizados por api_name (ej: {cf_area_tecnica: 'Backend'})"),
  },
  async ({ project_id, name, description, priority, person_responsible, start_date, due_date, estimated_hours, tasklist_id, custom_fields }) => {
    const resolvedId = await resolveProjectId(project_id);
    const body = await buildTaskV3Fields({ resolvedId, person_responsible, estimated_hours, priority, description, due_date, custom_fields });
    body.name = name;
    const effectiveStartDate = start_date || new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
    body.start_date = toISODate(effectiveStartDate);
    if (tasklist_id) body.tasklist = { id: tasklist_id };

    const { t, stripped } = await sendTaskResilient("post", `/portal/${PORTAL}/projects/${resolvedId}/tasks`, body);
    if (t?.id) {
      let msg = `Tarea creada.\nID: ${t.id} | Nombre: ${t.name}`;
      if (stripped.length) msg += `\nNota: se omitieron campos que apuntaban a usuarios no miembros del proyecto: ${stripped.join(", ")}`;
      return text(msg);
    }
    return text(`Respuesta: ${JSON.stringify(t)}`);
  }
);

// ── create_subtask ────────────────────────────────────────────────────────────
server.tool(
  "create_subtask",
  "Crea una subtarea bajo una tarea padre. Las subtareas solo existen en la API v2 de Zoho (el padre va en la URL), así que se crea por v2 y luego se completan los campos personalizados por v3. Mismos defaults que create_task (revisor, horas=8, tamaño=3). Hereda la lista del padre.",
  {
    project_id:         z.string().describe("ID numérico o nombre del proyecto"),
    parent_task_id:     z.string().describe("ID de la tarea padre"),
    name:               z.string().describe("Nombre de la subtarea"),
    description:        z.string().optional().describe("Descripción"),
    priority:           z.enum(["high", "medium", "low", "none"]).optional(),
    person_responsible: z.string().optional().describe("ID (zpuid) del responsable (por defecto: ZOHO_MY_USER_ID del .env)"),
    due_date:           z.string().optional().describe("Fecha de vencimiento MM-DD-YYYY"),
    estimated_hours:    z.string().optional().describe("Horas de trabajo estimadas (decimal, ej: '8' o '1.5'; por defecto: 8)"),
    custom_fields:      z.record(z.string()).optional().describe("Campos personalizados por api_name (ej: {area_tecnica: 'BACKEND'})"),
  },
  async ({ project_id, parent_task_id, name, description, priority, person_responsible, due_date, estimated_hours, custom_fields }) => {
    const resolvedId = await resolveProjectId(project_id);

    // 1) Crear la subtarea por v2: es el único endpoint que la vincula al padre (vía la URL).
    const v2 = await zohoClient.postFormV2(
      `/portal/${PORTAL_NAME}/projects/${resolvedId}/tasks/${parent_task_id}/subtasks/`,
      { name }
    );
    const sub = (v2?.tasks || [])[0];
    if (!sub) return text(`No se pudo crear la subtarea. Respuesta: ${JSON.stringify(v2)}`);
    const subId = sub.id_string || String(sub.id);

    // 2) Completar los campos personalizados (revisor, horas, área, etc.) por v3 PATCH.
    const fields = await buildTaskV3Fields({ resolvedId, person_responsible, estimated_hours, priority, description, due_date, custom_fields });
    const { t, stripped } = await sendTaskResilient("patch", `/portal/${PORTAL}/projects/${resolvedId}/tasks/${subId}`, fields);

    let msg = `Subtarea creada.\nID: ${subId} | Nombre: ${sub.name} | Padre: ${parent_task_id}`;
    if (stripped.length) msg += `\nNota: se omitieron campos que apuntaban a usuarios no miembros del proyecto: ${stripped.join(", ")}`;
    if (!t?.id) msg += `\nAviso: la subtarea se creó pero no se pudieron completar todos los campos: ${JSON.stringify(t?.error || t).slice(0, 200)}`;
    return text(msg);
  }
);

// ── update_task ───────────────────────────────────────────────────────────────
server.tool(
  "update_task",
  "Actualiza campos de una tarea existente. Solo se envían los campos que se pasen; los demás quedan intactos. Para mover a otra lista pasa tasklist_id. La descripción se convierte a HTML automáticamente si se pasa texto plano. IMPORTANTE sobre status: la API requiere el ID numérico del estado, no el nombre. Para obtenerlo: (1) llama a list_tasks y filtra en memoria por status.name para encontrar una tarea con el estado deseado, (2) llama a get_task con esa tarea — el campo Estado muestra 'NombreEstado (id: XXXXXXXXX, ...)' — usa ese ID numérico en este campo.",
  {
    project_id:            z.string().describe("ID numérico del proyecto"),
    task_id:               z.string().describe("ID numérico de la tarea"),
    name:                  z.string().optional().describe("Nuevo nombre"),
    description:           z.string().optional().describe("Nueva descripción (texto plano o HTML)"),
    status:                z.string().optional().describe("Nombre del estado ('Open', 'Closed', 'En proceso', etc.) o ID numérico del estado"),
    priority:              z.enum(["high", "medium", "low", "none"]).optional(),
    person_responsible:    z.string().optional().describe("zpuid del nuevo responsable (obtenible con list_users)"),
    due_date:              z.string().optional().describe("Fecha límite MM-DD-YYYY"),
    completion_percentage: z.number().int().min(0).max(100).optional().describe("Porcentaje de avance (0-100)"),
    tasklist_id:           z.string().optional().describe("ID de la lista de tareas destino; mover la tarea a otra lista"),
  },
  async ({ project_id, task_id, name, description, status, priority, person_responsible, due_date, completion_percentage, tasklist_id }) => {
    const body = {};
    if (name)                        body.name = name;
    if (description)                 body.description = toHtmlDescription(description);
    if (status)                      body.status = /^\d+$/.test(status) ? { id: status } : { name: status };
    if (priority)                    body.priority = priority;
    if (person_responsible)          body.owners_and_work = { owners: [{ zpuid: toZpuid(person_responsible) }] };
    if (due_date)                    body.end_date = toISODate(due_date);
    if (completion_percentage != null) body.completion_percentage = completion_percentage;
    if (tasklist_id)                 body.tasklist = { id: tasklist_id };

    if (!Object.keys(body).length) return text("No se proporcionaron campos para actualizar.");

    const t = await zohoClient.patch(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}`, body);
    if (t?.id) return text(`Tarea actualizada.\nID: ${t.id} | Nombre: ${t.name} | Estado: ${t.status?.name || "N/A"}`);
    return text(`Respuesta: ${JSON.stringify(t)}`);
  }
);

// ── delete_task ───────────────────────────────────────────────────────────────
server.tool(
  "delete_task",
  "Elimina una tarea permanentemente del proyecto. Esta acción es irreversible. También elimina todas sus subtareas. No usar para cerrar tareas — para eso usa update_task con status='Closed'.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    task_id:    z.string().describe("ID numérico de la tarea a eliminar"),
  },
  async ({ project_id, task_id }) => {
    await zohoClient.delete(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}`);
    return text(`Tarea ${task_id} eliminada.`);
  }
);

// ── list_comments ─────────────────────────────────────────────────────────────
server.tool(
  "list_comments",
  "Lista TODOS los comentarios de una tarea (paginación automática). Cada comentario incluye id, autor (created_by.full_name), texto (comment) y fecha (created_time). El id del comentario es necesario para update_comment y delete_comment.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    task_id:    z.string().describe("ID numérico de la tarea"),
  },
  async ({ project_id, task_id }) => {
    const comments = await zohoClient.getAllPages(
      `/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments`,
      {},
      "comments"
    );
    if (!comments.length) return text("No hay comentarios en esta tarea.");
    return text(comments.map(c =>
      `ID: ${c.id} | [${c.created_by?.full_name || c.created_by?.name || "Desconocido"}]: ${c.comment || ""}`
    ).join("\n---\n"));
  }
);

// ── add_comment ───────────────────────────────────────────────────────────────
server.tool(
  "add_comment",
  "Agrega un comentario de texto a una tarea. Para mencionar a un usuario en el comentario usa el formato [~zpuid] (ej: [~106599000002000123]). Devuelve el ID del comentario creado.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    task_id:    z.string().describe("ID numérico de la tarea"),
    content:    z.string().describe("Texto del comentario. Usa [~zpuid] para mencionar usuarios."),
  },
  async ({ project_id, task_id, content }) => {
    const r = await zohoClient.post(
      `/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments`,
      { comment: content }
    );
    if (Array.isArray(r) && r.length) return text(`Comentario agregado. ID: ${r[0].id}`);
    return text(`Respuesta: ${JSON.stringify(r)}`);
  }
);

// ── update_comment ────────────────────────────────────────────────────────────
server.tool(
  "update_comment",
  "Edita el texto de un comentario existente. Requiere el ID del comentario (obtenible con list_comments).",
  {
    project_id:  z.string().describe("ID numérico del proyecto"),
    task_id:     z.string().describe("ID numérico de la tarea"),
    comment_id:  z.string().describe("ID numérico del comentario a editar"),
    content:     z.string().describe("Nuevo texto del comentario"),
  },
  async ({ project_id, task_id, comment_id, content }) => {
    const r = await zohoClient.patch(
      `/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments/${comment_id}`,
      { comment: content }
    );
    if (Array.isArray(r) && r.length) return text(`Comentario actualizado. ID: ${r[0].id}`);
    return text(`Respuesta: ${JSON.stringify(r)}`);
  }
);

// ── delete_comment ────────────────────────────────────────────────────────────
server.tool(
  "delete_comment",
  "Elimina un comentario de una tarea permanentemente. Irreversible. Requiere el ID del comentario (obtenible con list_comments).",
  {
    project_id:  z.string().describe("ID numérico del proyecto"),
    task_id:     z.string().describe("ID numérico de la tarea"),
    comment_id:  z.string().describe("ID numérico del comentario a eliminar"),
  },
  async ({ project_id, task_id, comment_id }) => {
    await zohoClient.delete(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments/${comment_id}`);
    return text(`Comentario ${comment_id} eliminado.`);
  }
);

// ── list_users ────────────────────────────────────────────────────────────────
server.tool(
  "list_users",
  "Lista los miembros de un proyecto con su zpuid, nombre, email y rol. El zpuid es el identificador que debes usar en person_responsible (create_task/update_task) y en menciones de comentarios ([~zpuid]). Solo usuarios que pertenecen al proyecto pueden ser asignados como responsables.",
  {
    project_id: z.string().describe("ID numérico o nombre del proyecto"),
  },
  async ({ project_id }) => {
    const resolvedId = await resolveProjectId(project_id);
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${resolvedId}/users`);
    const users = r.users || [];
    if (!users.length) return text("No se encontraron usuarios.");
    return text(users.map(u =>
      `zpuid: ${u.zpuid || u.id || "N/A"} | Nombre: ${u.full_name || u.name || "N/A"} | Email: ${u.email || "N/A"} | Rol: ${u.role?.name || u.role || "N/A"}`
    ).join("\n"));
  }
);

// ── start_timer ───────────────────────────────────────────────────────────────
server.tool(
  "start_timer",
  "Inicia el timer de seguimiento de tiempo en una tarea. Solo puede haber un timer activo a la vez en el portal. Si ya hay uno corriendo, inícialo en la nueva tarea (Zoho lo detiene automáticamente). Usa stop_timer para detenerlo.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    task_id:    z.string().describe("ID numérico de la tarea"),
    notes:      z.string().optional().describe("Notas opcionales del registro de tiempo"),
  },
  async ({ project_id, task_id, notes }) => {
    const modulesRes = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/modules`);
    const modules = modulesRes.modules || [];
    const taskModule = modules.find(m => m.module_name === "Task");
    if (!taskModule) return text("No se encontró el módulo de tareas en este proyecto.");
    const body = { entity_id: task_id, project_id, module_id: taskModule.module_id };
    if (notes) body.notes = notes;
    const r = await zohoClient.post(`/portal/${PORTAL}/timelogs/timers`, body);
    if (r.timer || r.id) return text("Timer iniciado.");
    return text(`Respuesta: ${JSON.stringify(r)}`);
  }
);

// ── stop_timer ────────────────────────────────────────────────────────────────
server.tool(
  "stop_timer",
  "Detiene el timer activo del portal. Zoho descarta automáticamente registros de menos de 30 segundos. El project_id se usa para identificar qué timer detener si hay varios; si no se encuentra uno exacto, detiene el primer timer activo.",
  {
    project_id: z.string().describe("ID numérico del proyecto donde corre el timer"),
    task_id:    z.string().describe("ID numérico de la tarea (referencia, el timer se busca por project_id)"),
  },
  async ({ project_id, task_id }) => {
    const timersRes = await zohoClient.get(`/portal/${PORTAL}/timelogs/timers`, { type: "task" });
    const timers = timersRes.timer || [];
    const active = timers.find(t => t.project?.project_id === project_id) ?? timers[0];
    if (!active) return text("No se encontró un timer activo para esta tarea.");
    const today = new Date().toISOString().slice(0, 10);
    const r = await zohoClient.patch(`/portal/${PORTAL}/timelogs/timers/${active.id}/stop`, {
      type: "task",
      date: today,
      bill_status: "Non Billable",
      project_id,
    });
    if (r?.error?.details?.[0]?.message_key === "zero_hour_restriction")
      return text("Timer detenido pero descartado: duración menor a 30 segundos (regla de Zoho).");
    if (r?.error) return text(`Error al detener timer: ${JSON.stringify(r.error)}`);
    return text(`Timer detenido. Tiempo registrado: ${active.time_spent || "N/A"}`);
  }
);

// ── list_task_fields ──────────────────────────────────────────────────────────
server.tool(
  "list_task_fields",
  "Lista todos los campos disponibles en las tareas de un proyecto, incluyendo campos personalizados (custom fields). Devuelve api_name, label y tipo de cada campo. Usa esta herramienta antes de create_task o update_task cuando necesites pasar custom_fields: el api_name (ej: 'cf_area_tecnica') es la clave que debes usar en el objeto custom_fields.",
  {
    project_id: z.string().describe("ID o nombre del proyecto"),
  },
  async ({ project_id }) => {
    const resolvedId = await resolveProjectId(project_id);
    const myUserId = toZpuid(process.env.ZOHO_MY_USER_ID);
    if (!myUserId) return text("ZOHO_MY_USER_ID no está definido en .env");
    const r = await zohoClient.get(
      `/portal/${PORTAL}/projects/${resolvedId}/users/${myUserId}/fields/permissions`,
      { modules: "tasks" }
    );
    const fields = Array.isArray(r)
      ? r
      : (r[myUserId] ?? Object.values(r).find(v => Array.isArray(v)) ?? []);
    if (!fields.length) return text(`Sin campos. Respuesta cruda: ${JSON.stringify(r).slice(0, 500)}`);
    return text(fields.map(f =>
      `api_name: ${f.api_name || "N/A"} | label: ${f.display_name || "N/A"} | tipo: ${f.field_type || "N/A"} | oculto: ${f.is_hidden ?? "N/A"}`
    ).join("\n"));
  }
);

// ── get_task_attachments ──────────────────────────────────────────────────────
server.tool(
  "get_task_attachments",
  "Lista los archivos adjuntos de una tarea. Devuelve attachment_id, nombre, tipo, tamaño, quién lo asoció y URLs de descarga/preview. El attachment_id es necesario para disassociate_attachment.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    task_id:    z.string().describe("ID numérico de la tarea"),
  },
  async ({ project_id, task_id }) => {
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/attachments`, {
      entity_type: "task",
      entity_id: task_id,
    });
    const attachments = r.attachment || [];
    if (!attachments.length) return text("Esta tarea no tiene archivos adjuntos.");
    return text(attachments.map(a =>
      `ID: ${a.attachment_id} | Nombre: ${a.name} | Tipo: ${a.type} | Tamaño: ${Math.round(a.size / 1024)} KB | Por: ${a.associated_by_name || "N/A"}\nDescarga: ${a.download_url || "N/A"}`
    ).join("\n---\n"));
  }
);

// ── disassociate_attachment ───────────────────────────────────────────────────
server.tool(
  "disassociate_attachment",
  "Desvincula un archivo adjunto de una tarea. El archivo no se elimina de WorkDrive, solo se desasocia de la tarea. Requiere el attachment_id (obtenible con get_task_attachments).",
  {
    project_id:    z.string().describe("ID numérico del proyecto"),
    task_id:       z.string().describe("ID numérico de la tarea"),
    attachment_id: z.string().describe("ID del adjunto a desvincular (obtenible con get_task_attachments)"),
  },
  async ({ project_id, task_id, attachment_id }) => {
    await zohoClient.delete(
      `/portal/${PORTAL}/projects/${project_id}/attachments/${attachment_id}?entity_type=task&entity_id=${task_id}`
    );
    return text(`Adjunto ${attachment_id} desvinculado de la tarea.`);
  }
);

// ── get_time_logs ─────────────────────────────────────────────────────────────
// NOTA TÉCNICA: la API de Zoho requiere module:{id:task_id,type:"task"} por cada tarea.
// No existe un endpoint que devuelva todos los logs de un proyecto en una sola llamada.
// Este tool itera sobre las tareas del proyecto (filtradas por user si se pasa user_zpuid)
// y agrega los logs de cada una. Para proyectos grandes puede ser lento.
server.tool(
  "get_time_logs",
  "Lista los registros de tiempo de un proyecto. Itera sobre las tareas del proyecto y agrega sus logs en el rango de fechas. Si se pasa user_zpuid, solo consulta las tareas asignadas a ese usuario. Devuelve: fecha, owner, tarea, horas, estado de aprobación. Si no se pasan fechas devuelve el mes actual.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    start_date: z.string().optional().describe("Fecha inicio YYYY-MM-DD (por defecto: primer día del mes actual)"),
    end_date:   z.string().optional().describe("Fecha fin YYYY-MM-DD (por defecto: hoy). Diferencia máxima: 6 meses"),
    user_zpuid: z.string().optional().describe("zpuid del usuario — si se pasa, solo consulta tareas asignadas a ese usuario"),
  },
  async ({ project_id, start_date, end_date, user_zpuid }) => {
    const now = new Date();
    const sd = start_date || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    const ed = end_date   || now.toISOString().slice(0, 10);

    const allTasks = await zohoClient.getAllPages(`/portal/${PORTAL}/projects/${project_id}/tasks`);
    const openTasks = allTasks.filter(t => !t.is_completed && !t.status?.is_closed_type);
    const tasks = user_zpuid
      ? openTasks.filter(t => (t.owners_and_work?.owners || []).some(o => String(o.zpuid) === String(user_zpuid)))
      : openTasks;
    if (!tasks.length) return text("No se encontraron tareas abiertas.");

    const allLogs = [];
    for (const task of tasks) {
      const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/timelogs`, {
        view_type:  "customdate",
        start_date: sd,
        end_date:   ed,
        module:     JSON.stringify({ id: task.id, type: "task" }),
      });
      for (const day of r.time_logs || []) {
        for (const log of day.log_details || []) allLogs.push(log);
      }
    }

    if (!allLogs.length) return text("No se encontraron registros de tiempo en ese rango.");
    allLogs.sort((a, b) => a.date.localeCompare(b.date));

    const lines = [];
    for (const log of allLogs) {
      lines.push(`${log.date} | ${log.owner?.name || "N/A"} | ${log.module_detail?.name || "N/A"} | ${log.log_hour} | ${log.approval?.status || "N/A"}${log.notes ? " | " + log.notes.split("\n")[0] : ""}`);
    }
    return text(lines.join("\n"));
  }
);

// ── add_time_log ──────────────────────────────────────────────────────────────
server.tool(
  "add_time_log",
  "Registra horas manualmente en una tarea (sin usar el timer). Útil para registrar tiempo pasado. Las horas van en formato decimal: '1.5' = 1h 30min. La fecha es YYYY-MM-DD. Si no se pasa owner_zpuid se usa ZOHO_MY_USER_ID.",
  {
    project_id:  z.string().describe("ID numérico del proyecto"),
    task_id:     z.string().describe("ID numérico de la tarea"),
    hours:       z.string().describe("Horas en formato decimal, ej: '2.5' para 2h 30min"),
    date:        z.string().describe("Fecha del registro YYYY-MM-DD"),
    notes:       z.string().optional().describe("Notas del registro"),
    owner_zpuid: z.string().optional().describe("zpuid del propietario del registro (por defecto: ZOHO_MY_USER_ID)"),
    bill_status: z.enum(["Billable", "Non Billable"]).optional().describe("Estado de facturación (por defecto: Non Billable)"),
  },
  async ({ project_id, task_id, hours, date, notes, owner_zpuid, bill_status }) => {
    const zpuid = owner_zpuid || process.env.ZOHO_MY_USER_ID;
    const entry = {
      project_id,
      item_id:     task_id,
      type:        "task",
      date,
      hours,
      bill_status: bill_status || "Non Billable",
      owner_zpuid: zpuid,
    };
    if (notes) entry.notes = notes;

    const r = await zohoClient.postForm(`/portal/${PORTAL}/addbulktimelogs`, { log_object: JSON.stringify([entry]) });
    const logs = r.time_logs?.[0]?.log_details || [];
    if (logs.length) return text(`Tiempo registrado. ID: ${logs[0].id} | Horas: ${logs[0].log_hour}`);
    return text(`Respuesta: ${JSON.stringify(r)}`);
  }
);

// ── sync_task_hours ───────────────────────────────────────────────────────────
server.tool(
  "sync_task_hours",
  "Para cada tarea CERRADA del proyecto con horas planeadas (owners_and_work.total_work > 0), crea un time log igual a total_work × factor. Uso principal: registrar el 95% de las horas planeadas al cierre de una tarea. Con user_zpuid solo procesa las tareas de ese usuario y crea los logs con ese owner. La fecha del log usa end_date de la tarea (o hoy si no tiene). NO reemplaza logs existentes — agrega un entry nuevo.",
  {
    project_id: z.string().describe("ID numérico del proyecto"),
    user_zpuid: z.string().optional().describe("zpuid del usuario — solo procesa tareas cerradas asignadas a él y crea los logs con ese owner (obtenible con list_users)"),
    factor:     z.number().min(0).max(2).optional().describe("Multiplicador sobre las horas planeadas (por defecto 1.0 = 100%). Ej: 0.95 para registrar el 95% de las horas planeadas."),
  },
  async ({ project_id, user_zpuid, factor = 1.0 }) => {
    const today = new Date().toISOString().slice(0, 10);

    const parseMinutes = (hhmm) => {
      if (!hhmm) return 0;
      const [h, m] = String(hhmm).split(":").map(Number);
      return (h || 0) * 60 + (m || 0);
    };

    const allTasks = await zohoClient.getAllPages(`/portal/${PORTAL}/projects/${project_id}/tasks`);
    const closedTasks = allTasks.filter(t => t.is_completed || t.status?.is_closed_type);
    const tasks = user_zpuid
      ? closedTasks.filter(t => (t.owners_and_work?.owners || []).some(o => String(o.zpuid) === String(user_zpuid)))
      : closedTasks;
    if (!tasks.length) return text("No se encontraron tareas cerradas para ese usuario en este proyecto.");

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));
    const results = [];
    const skipped = [];
    const errors = [];
    let count = 0;

    for (const task of tasks) {
      const plannedMinutes = parseMinutes(task.owners_and_work?.total_work);
      if (plannedMinutes === 0) { skipped.push(`${task.name} (sin horas planeadas)`); continue; }

      const adjusted = Math.round(plannedMinutes * factor);
      if (adjusted === 0) { skipped.push(`${task.name} (resultado 0 con factor ${factor})`); continue; }

      const decimalHours = (adjusted / 60).toFixed(4);
      const logDate = task.end_date ? task.end_date.slice(0, 10) : today;
      const owner = user_zpuid || task.owners_and_work?.owners?.[0]?.zpuid || process.env.ZOHO_MY_USER_ID;

      const entry = {
        project_id,
        item_id:     task.id,
        type:        "task",
        date:        logDate,
        hours:       decimalHours,
        bill_status: "Non Billable",
        owner_zpuid: owner,
      };

      const r = await zohoClient.postForm(`/portal/${PORTAL}/addbulktimelogs`, { log_object: JSON.stringify([entry]) });
      count++;
      // Pausa cada 3 tareas para no saturar el rate limit (200 req/2min)
      if (count % 3 === 0) await sleep(1500);
      const logs = r.time_logs?.[0]?.log_details || [];
      if (logs.length) {
        const tw = task.owners_and_work?.total_work || "?";
        results.push(`${task.name}: ${tw} planeadas → ${logs[0].log_hour} registradas`);
      } else {
        errors.push(`${task.name}: ${JSON.stringify(r).slice(0, 120)}`);
      }
    }

    const pct = Math.round(factor * 100);
    let out = `Procesadas ${tasks.length} tarea(s) cerradas al ${pct}% de horas planeadas.\nRegistradas: ${results.length} | Omitidas: ${skipped.length} | Errores: ${errors.length}`;
    if (results.length) out += "\n\n" + results.join("\n");
    if (errors.length) out += "\n\nErrores:\n" + errors.join("\n");
    if (skipped.length) out += "\n\nOmitidas:\n" + skipped.join("\n");
    return text(out);
  }
);

// ── start server ──────────────────────────────────────────────────────────────
await initPortalId();
const transport = new StdioServerTransport();
await server.connect(transport);
