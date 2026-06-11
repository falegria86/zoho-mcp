import "dotenv/config";
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

function toISODate(mmddyyyy) {
  if (!mmddyyyy) return undefined;
  const [m, d, y] = mmddyyyy.split("-");
  return `${y}-${m}-${d}T00:00:00.000Z`;
}

// ── list_projects ────────────────────────────────────────────────────────────
server.tool("list_projects", "Lista todos los proyectos del portal", {}, async () => {
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
  "Lista las tareas de un proyecto",
  {
    project_id: z.string().describe("ID del proyecto"),
    status: z.string().optional().describe('Filtro: "open", "closed", "overdue"'),
  },
  async ({ project_id, status }) => {
    const params = {};
    if (status) params.filter = JSON.stringify({ criteria: [{ field_name: "status", criteria_condition: "is", value: status }], pattern: "1" });
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/tasks`, params);
    const tasks = r.tasks || [];
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
  "Obtiene el detalle completo de una tarea",
  {
    project_id: z.string().describe("ID del proyecto"),
    task_id: z.string().describe("ID de la tarea"),
  },
  async ({ project_id, task_id }) => {
    const t = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}`);
    if (!t?.id) return text("Tarea no encontrada.");
    const owners = (t.owners_and_work?.owners || []).map(o => o.name).join(", ") || "Sin asignar";
    return text([
      `Nombre:      ${t.name}`,
      `ID:          ${t.id}`,
      `Estado:      ${t.status?.name || "N/A"}`,
      `Prioridad:   ${t.priority || "N/A"}`,
      `Asignado a:  ${owners}`,
      `Fecha límite:${t.end_date ? t.end_date.slice(0, 10) : "Sin fecha"}`,
      `Descripción: ${t.description || "Sin descripción"}`,
    ].join("\n"));
  }
);

// ── create_task ───────────────────────────────────────────────────────────────
server.tool(
  "create_task",
  "Crea una nueva tarea. Acepta nombre o ID de proyecto. Defaults automáticos si no se especifican: propietario=ZOHO_MY_USER_ID, revisor=ZOHO_MY_USER_ID, revisor_de_desarrollo=ZOHO_MY_USER_ID, work=8:00, tamaño=3.",
  {
    project_id:         z.string().describe("ID numérico o nombre del proyecto (ej: 'sigob-sir-lite')"),
    name:               z.string().describe("Nombre de la tarea"),
    description:        z.string().optional().describe("Descripción"),
    priority:           z.enum(["high", "medium", "low", "none"]).optional(),
    person_responsible: z.string().optional().describe("ID (zpuid) del usuario responsable (por defecto: ZOHO_MY_USER_ID del .env)"),
    start_date:         z.string().optional().describe("Fecha de inicio MM-DD-YYYY (requerida por Zoho; por defecto: hoy)"),
    due_date:           z.string().optional().describe("Fecha de vencimiento MM-DD-YYYY"),
    tasklist_id:        z.string().optional().describe("ID de la lista de tareas"),
    custom_fields:      z.record(z.string()).optional().describe("Campos personalizados por api_name (ej: {cf_area_tecnica: 'Backend'})"),
  },
  async ({ project_id, name, description, priority, person_responsible, start_date, due_date, tasklist_id, custom_fields }) => {
    const resolvedId = await resolveProjectId(project_id);
    const responsible = toZpuid(person_responsible || process.env.ZOHO_MY_USER_ID);

    const body = { name };
    if (description) body.description = description;
    if (priority)    body.priority = priority;
    if (responsible) body.owners_and_work = { owners: [{ zpuid: responsible }] };
    const effectiveStartDate = start_date || new Date().toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" }).replace(/\//g, "-");
    body.start_date = toISODate(effectiveStartDate);
    if (due_date)    body.end_date = toISODate(due_date);
    if (tasklist_id) body.tasklist = { id: tasklist_id };
    if (custom_fields) {
      for (const [key, val] of Object.entries(custom_fields)) {
        // Quote large integers in zpuid fields before parsing to preserve 18-digit precision
        const safe = val.replace(/"zpuid"\s*:\s*(\d{15,})/g, '"zpuid":"$1"');
        try { body[key] = JSON.parse(safe); } catch { body[key] = val; }
      }
    }

    const myId = toZpuid(process.env.ZOHO_MY_USER_ID);
    if (myId) {
      if (!body.revisor)              body.revisor              = { zpuid: myId };
      if (!body.revisor_de_desarrollo) body.revisor_de_desarrollo = { zpuid: myId };
    }
    if (!body.work)                              body.work = "8:00";
    if (!body.tamano_de_tarea_1_facil_5_dificil) body.tamano_de_tarea_1_facil_5_dificil = "3";

    const t = await zohoClient.post(`/portal/${PORTAL}/projects/${resolvedId}/tasks`, body);
    if (t?.id) return text(`Tarea creada.\nID: ${t.id} | Nombre: ${t.name}`);
    return text(`Respuesta: ${JSON.stringify(t)}`);
  }
);

// ── update_task ───────────────────────────────────────────────────────────────
server.tool(
  "update_task",
  "Actualiza una tarea existente (estado, prioridad, responsable, etc.)",
  {
    project_id:        z.string().describe("ID del proyecto"),
    task_id:           z.string().describe("ID de la tarea"),
    name:              z.string().optional().describe("Nuevo nombre"),
    status:            z.string().optional().describe("ID numérico del estado, o nombre: 'Open', 'Closed'"),
    priority:          z.enum(["high", "medium", "low", "none"]).optional(),
    person_responsible:z.string().optional().describe("zpuid del usuario responsable"),
    due_date:          z.string().optional().describe("Fecha límite MM-DD-YYYY"),
  },
  async ({ project_id, task_id, name, status, priority, person_responsible, due_date }) => {
    const body = {};
    if (name)              body.name = name;
    if (status)            body.status = /^\d+$/.test(status) ? { id: status } : { name: status };
    if (priority)          body.priority = priority;
    if (person_responsible)body.owners_and_work = { owners: [{ zpuid: toZpuid(person_responsible) }] };
    if (due_date)          body.end_date = toISODate(due_date);

    if (!Object.keys(body).length) return text("No se proporcionaron campos para actualizar.");

    const t = await zohoClient.patch(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}`, body);
    if (t?.id) return text(`Tarea actualizada.\nID: ${t.id} | Nombre: ${t.name} | Estado: ${t.status?.name || "N/A"}`);
    return text(`Respuesta: ${JSON.stringify(t)}`);
  }
);

// ── list_comments ─────────────────────────────────────────────────────────────
server.tool(
  "list_comments",
  "Lista los comentarios de una tarea",
  {
    project_id: z.string().describe("ID del proyecto"),
    task_id:    z.string().describe("ID de la tarea"),
  },
  async ({ project_id, task_id }) => {
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments`);
    const comments = r.comments || [];
    if (!comments.length) return text("No hay comentarios en esta tarea.");
    return text(comments.map(c => `[${c.created_by?.name || "Desconocido"}]: ${c.comment || ""}`).join("\n---\n"));
  }
);

// ── add_comment ───────────────────────────────────────────────────────────────
server.tool(
  "add_comment",
  "Agrega un comentario a una tarea",
  {
    project_id: z.string().describe("ID del proyecto"),
    task_id:    z.string().describe("ID de la tarea"),
    content:    z.string().describe("Texto del comentario"),
  },
  async ({ project_id, task_id, content }) => {
    const r = await zohoClient.post(
      `/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments`,
      { comment: content }
    );
    if (Array.isArray(r) && r.length) return text("Comentario agregado exitosamente.");
    return text(`Respuesta: ${JSON.stringify(r)}`);
  }
);

// ── list_users ────────────────────────────────────────────────────────────────
server.tool(
  "list_users",
  "Lista los usuarios de un proyecto",
  {
    project_id: z.string().describe("ID del proyecto"),
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
  "Inicia el timer de seguimiento de tiempo en una tarea",
  {
    project_id: z.string().describe("ID del proyecto"),
    task_id:    z.string().describe("ID de la tarea"),
    notes:      z.string().optional().describe("Notas del registro"),
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
  "Detiene el timer de una tarea",
  {
    project_id: z.string().describe("ID del proyecto"),
    task_id:    z.string().describe("ID de la tarea"),
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
  "Lista los campos disponibles en las tareas de un proyecto (incluidos custom fields), con su api_name para usar en create_task",
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

// ── start server ──────────────────────────────────────────────────────────────
await initPortalId();
const transport = new StdioServerTransport();
await server.connect(transport);
