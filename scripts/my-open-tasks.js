import "dotenv/config";
import { zohoClient } from "../src/zoho-client.js";

const PORTAL_NAME = process.env.ZOHO_PORTAL_NAME || "sigobproyectos";
let PORTAL = PORTAL_NAME;

const TEAM_EMAILS = new Set(
  (process.env.ZOHO_TEAM_EMAILS || "").split(",").map(e => e.trim()).filter(Boolean)
);

const TEAM_NAME_FRAGMENTS = (process.env.ZOHO_TEAM_NAMES || "")
  .split(",").map(n => n.trim().toLowerCase()).filter(Boolean);

async function initPortalId() {
  if (/^\d+$/.test(PORTAL_NAME)) return;
  const portals = await zohoClient.get("/portals");
  const list = Array.isArray(portals) ? portals : (portals.portals || []);
  const match = list.find(p =>
    p.portal_name === PORTAL_NAME || p.org_name === PORTAL_NAME || p.name === PORTAL_NAME
  );
  if (match?.id) PORTAL = String(match.id);
}

function isTeamMember(user) {
  if (!user) return false;
  if (TEAM_EMAILS.has(user.email)) return true;
  const name = (user.name || "").toLowerCase();
  return TEAM_NAME_FRAGMENTS.some(f => name.includes(f));
}

function teamOwners(task) {
  return (task.owners_and_work?.owners || []).filter(isTeamMember).map(u => u.name);
}

const CLOSED_STATUSES = new Set(["closed", "cerrada", "done", "completada"]);

async function getOpenTasksForProject(project) {
  try {
    const allTasks = await zohoClient.getAllPages(`/portal/${PORTAL}/projects/${project.id}/tasks`);
    const tasks = allTasks.filter(
      t => !CLOSED_STATUSES.has((t.status?.name || "").toLowerCase())
    );
    return tasks
      .filter(t => teamOwners(t).length > 0)
      .map(t => ({
        project:  project.name,
        id:       t.id,
        name:     t.name,
        status:   t.status?.name || "N/A",
        priority: t.priority || "N/A",
        owners:   teamOwners(t).join(", "),
        due_date: t.end_date ? t.end_date.slice(0, 10) : "—",
      }));
  } catch {
    return [];
  }
}

async function main() {
  await initPortalId();
  console.log("Obteniendo proyectos...\n");
  const r = await zohoClient.get(`/portal/${PORTAL}/projects`);
  const projects = Array.isArray(r) ? r : (r.projects || []);

  console.log(`Buscando tareas abiertas en ${projects.length} proyectos...\n`);

  const results = await Promise.all(projects.map(getOpenTasksForProject));
  const tasks = results.flat();

  if (!tasks.length) {
    console.log("No se encontraron tareas abiertas del equipo.");
    return;
  }

  console.log(`Se encontraron ${tasks.length} tarea(s):\n`);

  const sorted = tasks.sort((a, b) => a.project.localeCompare(b.project) || a.name.localeCompare(b.name));

  const col = (str, len) => str.length > len ? str.slice(0, len - 1) + "…" : str.padEnd(len);

  const COLS = { project: 22, name: 52, owners: 22, status: 24, priority: 10, due_date: 12 };
  const header = col("Proyecto", COLS.project) + col("Tarea", COLS.name) + col("Asignado", COLS.owners) + col("Estado", COLS.status) + col("Prioridad", COLS.priority) + col("Vence", COLS.due_date);
  const divider = "─".repeat(header.length);

  console.log(header);
  console.log(divider);

  for (const t of sorted) {
    console.log(
      col(t.project,  COLS.project) +
      col(t.name,     COLS.name)    +
      col(t.owners,   COLS.owners)  +
      col(t.status,   COLS.status)  +
      col(t.priority, COLS.priority)+
      col(t.due_date, COLS.due_date)
    );
  }
}

main().catch(console.error);
