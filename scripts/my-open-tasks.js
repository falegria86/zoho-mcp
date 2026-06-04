import "dotenv/config";
import { zohoClient } from "../src/zoho-client.js";

const PORTAL = process.env.ZOHO_PORTAL_NAME || "sigobproyectos";

const TEAM_EMAILS = new Set([
  "jose.tejeda@sigob.com.mx",
  "kevin.lizarraga@sigob.com.mx",
  "arturo.lora@sigob.com.mx",
  "marco.delgado@sigob.com.mx",
]);

const TEAM_NAME_FRAGMENTS = ["jose ramon", "tejeda", "kevin", "lizarraga", "arturo lora", "marco delgado"];

function isTeamMember(user) {
  if (!user) return false;
  if (TEAM_EMAILS.has(user.email)) return true;
  const name = (user.name || "").toLowerCase();
  return TEAM_NAME_FRAGMENTS.some(f => name.includes(f));
}

function teamOwners(task) {
  return (task.details?.owners || []).filter(isTeamMember).map(u => u.name);
}

const CLOSED_STATUSES = new Set(["closed", "cerrada", "done", "completada"]);

async function getOpenTasksForProject(project) {
  try {
    const r = await zohoClient.get(`/portal/${PORTAL}/projects/${project.id_string}/tasks/`);
    const tasks = (r.tasks || []).filter(
      t => !CLOSED_STATUSES.has((t.status?.name || "").toLowerCase())
    );
    return tasks
      .filter(t => teamOwners(t).length > 0)
      .map(t => ({
        project: project.name,
        id: t.id_string,
        name: t.name,
        status: t.status?.name || "N/A",
        priority: t.priority || "N/A",
        owners: teamOwners(t).join(", "),
        due_date: t.end_date || "—",
      }));
  } catch {
    return [];
  }
}

async function main() {
  console.log("Obteniendo proyectos...\n");
  const r = await zohoClient.get(`/portal/${PORTAL}/projects/`);
  const projects = r.projects || [];

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
