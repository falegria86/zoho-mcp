import "dotenv/config";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { zohoClient } from "./zoho-client.js";

const PORTAL = process.env.ZOHO_PORTAL_NAME || "sigobproyectos";
const server = new McpServer({ name: "Zoho Projects", version: "1.0.0" });

const text = (str) => ({ content: [{ type: "text", text: String(str) }] });

async function resolveProjectId(nameOrId) {
  if (/^\d+$/.test(nameOrId)) return nameOrId;
  const r = await zohoClient.get(`/portal/${PORTAL}/projects/`);
  const match = (r.projects || []).find(p =>
    p.name.toLowerCase() === nameOrId.toLowerCase() ||
    p.name.toLowerCase().includes(nameOrId.toLowerCase())
  );
  if (!match) throw new Error(`No se encontró proyecto con nombre: "${nameOrId}"`);
  return match.id_string;
}

// Convierte horas decimales o enteras a "HH:MM" que espera Zoho
function toHHMM(hours) {
  const total = Math.round(parseFloat(hours) * 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ── list_projects ────────────────────────────────────────────────────────────
server.tool("list_projects", "Lista todos los proyectos del portal", {}, async () => {
  const r = await zohoClient.get(`/portal/${PORTAL}/projects/`);
  const projects = r.projects || [];
  if (!projects.length) return text("No se encontraron proyectos.");
  return text(projects.map(p =>
    `ID: ${p.id_string} | Nombre: ${p.name} | Estado: ${p.status || "N/A"}`
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
    const r = await zohoClient.get(
      `/portal/${PORTAL}/projects/${project_id}/tasks/`,
      status ? { status } : {}
    );
    const tasks = r.tasks || [];
    if (!tasks.length) return text("No se encontraron tareas.");
    return text(tasks.map(t => {
      const owners = (t.details?.owners || []).map(o => o.name).join(", ") || "Sin asignar";
      return `ID: ${t.id_string} | ${t.name} | Estado: ${t.status?.name || "N/A"} | Prioridad: ${t.priority || "N/A"} | Asignado: ${owners}`;
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
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/`);
    const t = (r.tasks || [])[0];
    if (!t) return text("Tarea no encontrada.");
    const owners = (t.details?.owners || []).map(o => o.name).join(", ") || "Sin asignar";
    return text([
      `Nombre:      ${t.name}`,
      `ID:          ${t.id_string}`,
      `Estado:      ${t.status?.name || "N/A"}`,
      `Prioridad:   ${t.priority || "N/A"}`,
      `Asignado a:  ${owners}`,
      `Fecha límite:${t.end_date || "Sin fecha"}`,
      `Descripción: ${t.description || "Sin descripción"}`,
    ].join("\n"));
  }
);

// ── create_task ───────────────────────────────────────────────────────────────
server.tool(
  "create_task",
  "Crea una nueva tarea. Acepta nombre o ID de proyecto. Si no se especifica responsable, se asigna al usuario configurado en ZOHO_MY_USER_ID.",
  {
    project_id:         z.string().describe("ID numérico o nombre del proyecto (ej: 'sigob-sir-lite')"),
    name:               z.string().describe("Nombre de la tarea"),
    description:        z.string().optional().describe("Descripción"),
    priority:           z.enum(["High", "Medium", "Low", "None"]).optional(),
    person_responsible: z.string().optional().describe("ID del usuario responsable (por defecto: ZOHO_MY_USER_ID del .env)"),
    start_date:         z.string().optional().describe("Fecha de inicio MM-DD-YYYY"),
    due_date:           z.string().optional().describe("Fecha de vencimiento MM-DD-YYYY"),
    estimated_hours:    z.string().optional().describe("Horas de trabajo estimadas (ej: '8' o '1.5')"),
    tasklist_id:        z.string().optional().describe("ID de la lista de tareas"),
    custom_fields:      z.record(z.string()).optional().describe("Campos personalizados como objeto {column_name: valor} (ej: {UDF_CHAR1: 'Backend'})"),
  },
  async ({ project_id, name, description, priority, person_responsible, start_date, due_date, estimated_hours, tasklist_id, custom_fields }) => {
    const resolvedId = await resolveProjectId(project_id);
    const responsible = person_responsible || process.env.ZOHO_MY_USER_ID;

    const body = { name };
    if (description)    body.description = description;
    if (priority)       body.priority = priority;
    if (responsible)    body.person_responsible = responsible;
    if (start_date)     body.start_date = start_date;
    if (due_date)       body.due_date = due_date;
    if (estimated_hours) body.estimated_time = toHHMM(estimated_hours);
    if (tasklist_id)    body.tasklist_id = tasklist_id;
    if (custom_fields)  Object.assign(body, custom_fields);

    const r = await zohoClient.post(`/portal/${PORTAL}/projects/${resolvedId}/tasks/`, body);
    const t = (r.tasks || [])[0];
    if (t) return text(`Tarea creada.\nID: ${t.id_string} | Nombre: ${t.name}`);
    return text(`Respuesta: ${JSON.stringify(r)}`);
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
    status:            z.string().optional().describe('Estado: "Open", "Closed" o nombre personalizado'),
    priority:          z.enum(["High", "Medium", "Low", "None"]).optional(),
    person_responsible:z.string().optional().describe("ID del usuario responsable"),
    due_date:          z.string().optional().describe("Fecha límite MM-DD-YYYY"),
  },
  async ({ project_id, task_id, name, status, priority, person_responsible, due_date }) => {
    const body = {};
    if (name)              body.name = name;
    if (status)            body.status = status;
    if (priority)          body.priority = priority;
    if (person_responsible)body.person_responsible = person_responsible;
    if (due_date)          body.due_date = due_date;

    if (!Object.keys(body).length) return text("No se proporcionaron campos para actualizar.");

    const r = await zohoClient.put(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/`, body);
    const t = (r.tasks || [])[0];
    if (t) return text(`Tarea actualizada.\nID: ${t.id_string} | Nombre: ${t.name} | Estado: ${t.status?.name || "N/A"}`);
    return text(`Respuesta: ${JSON.stringify(r)}`);
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
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments/`);
    const comments = r.comments || [];
    if (!comments.length) return text("No hay comentarios en esta tarea.");
    return text(comments.map(c => `[${c.added_by || "Desconocido"}]: ${c.content || ""}`).join("\n---\n"));
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
      `/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/comments/`,
      { content }
    );
    if (r.comments?.length) return text("Comentario agregado exitosamente.");
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
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project_id}/users/`);
    const users = r.users || [];
    if (!users.length) return text("No se encontraron usuarios.");
    return text(users.map(u =>
      `ID: ${u.zpuid || u.id || "N/A"} | Nombre: ${u.name || "N/A"} | Email: ${u.email || "N/A"} | Rol: ${u.role || "N/A"}`
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
    const body = { bill_status: "Non Billable" };
    if (notes) body.notes = notes;
    const r = await zohoClient.post(
      `/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/timelogs/timer/`,
      body
    );
    if (r.timelogs || r.timelog || r.response?.status === "success") return text("Timer iniciado.");
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
    await zohoClient.delete(`/portal/${PORTAL}/projects/${project_id}/tasks/${task_id}/timelogs/timer/`);
    return text("Timer detenido.");
  }
);

// ── list_task_fields ──────────────────────────────────────────────────────────
server.tool(
  "list_task_fields",
  "Lista los campos personalizados disponibles en las tareas de un proyecto, incluyendo su column_name para usar en create_task",
  {
    project_id: z.string().describe("ID o nombre del proyecto"),
  },
  async ({ project_id }) => {
    const resolvedId = await resolveProjectId(project_id);
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${resolvedId}/taskfields/`);
    const fields = r.taskfields || r.task_fields || [];
    if (!fields.length) return text("No se encontraron campos personalizados.");
    return text(fields.map(f =>
      `column_name: ${f.column_name} | label: ${f.label_name || f.field_name || "N/A"} | tipo: ${f.type || "N/A"}`
    ).join("\n"));
  }
);

// ── start server ──────────────────────────────────────────────────────────────
const transport = new StdioServerTransport();
await server.connect(transport);
