// Lists all comments that mention you (ZOHO_MY_USER_ID), across all projects or one specific project.
// Usage:
//   node scripts/my-mentions.js                          # todos los proyectos
//   node scripts/my-mentions.js <project_id_o_nombre>   # un proyecto
//   node scripts/my-mentions.js --from=YYYY-MM-DD --to=YYYY-MM-DD

import "dotenv/config";
import { zohoClient } from "../src/zoho-client.js";

const PORTAL_NAME = process.env.ZOHO_PORTAL_NAME || "sigobproyectos";
let PORTAL = PORTAL_NAME;
const MY_USER_ID = process.env.ZOHO_MY_USER_ID;
const MY_NAME = process.env.ZOHO_MY_NAME || "";

if (!MY_USER_ID) {
  console.error("Error: ZOHO_MY_USER_ID no está definido en .env");
  process.exit(1);
}

async function initPortalId() {
  if (/^\d+$/.test(PORTAL_NAME)) return;
  const portals = await zohoClient.get("/portals");
  const list = Array.isArray(portals) ? portals : (portals.portals || []);
  const match = list.find(p =>
    p.portal_name === PORTAL_NAME || p.org_name === PORTAL_NAME || p.name === PORTAL_NAME
  );
  if (match?.id) PORTAL = String(match.id);
}

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const projectArg = args.find(a => !a.startsWith("--")) ?? null;
const fromArg = args.find(a => a.startsWith("--from="))?.split("=")[1];
const toArg   = args.find(a => a.startsWith("--to="))?.split("=")[1];

const fromDate = fromArg ? new Date(fromArg) : null;
const toDate   = toArg   ? new Date(toArg + "T23:59:59") : null;

// ── API helpers ───────────────────────────────────────────────────────────────
async function getAllProjects() {
  const r = await zohoClient.get(`/portal/${PORTAL}/projects`);
  return Array.isArray(r) ? r : (r.projects || []);
}

async function resolveProject(nameOrId) {
  if (/^\d+$/.test(nameOrId)) return { id: nameOrId, name: nameOrId };
  const projects = await getAllProjects();
  const match = projects.find(p =>
    p.name.toLowerCase() === nameOrId.toLowerCase() ||
    p.name.toLowerCase().includes(nameOrId.toLowerCase())
  );
  if (!match) throw new Error(`No se encontró proyecto: "${nameOrId}"`);
  return { id: match.id, name: match.name };
}

async function getAllTasks(projectId) {
  const tasks = [];
  let page = 1;
  while (true) {
    let r;
    try {
      r = await zohoClient.get(`/portal/${PORTAL}/projects/${projectId}/tasks`, {
        per_page: 100,
        page,
      });
    } catch {
      break;
    }
    const batch = r.tasks || [];
    tasks.push(...batch);
    if (!r.page_info?.has_next_page || batch.length < 100) break;
    page++;
  }
  return tasks;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function getComments(projectId, taskId, attempt = 0) {
  try {
    const r = await zohoClient.get(
      `/portal/${PORTAL}/projects/${projectId}/tasks/${taskId}/comments`
    );
    if (r?.error?.title === "URL_ROLLING_THROTTLES_LIMIT_EXCEEDED") {
      if (attempt >= 2) return [];
      process.stderr.write(`\n  ⏳ Rate limit alcanzado, esperando 65s...\n`);
      await sleep(65000);
      return getComments(projectId, taskId, attempt + 1);
    }
    return r.comments || [];
  } catch {
    return [];
  }
}

async function getSubtasks(projectId, taskId) {
  try {
    const r = await zohoClient.get(
      `/portal/${PORTAL}/projects/${projectId}/tasks/${taskId}/subtasks`
    );
    return r.tasks || [];
  } catch {
    return [];
  }
}

// Run at most `limit` async jobs concurrently
async function pLimit(jobs, limit) {
  const results = new Array(jobs.length);
  let i = 0;
  async function worker() {
    while (i < jobs.length) {
      const idx = i++;
      results[idx] = await jobs[idx]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
  return results;
}

// ── filtering ─────────────────────────────────────────────────────────────────
function parseCommentDate(comment) {
  const raw = comment.created_time || comment.added_time_long || comment.added_time;
  if (!raw) return null;
  const d = new Date(typeof raw === "number" ? raw : raw);
  return isNaN(d) ? null : d;
}

function mentionsMe(content) {
  if (!content) return false;
  if (content.includes(`[~${MY_USER_ID}]`)) return true;
  if (MY_NAME && content.toLowerCase().includes(`@${MY_NAME.toLowerCase()}`)) return true;
  return false;
}

// ── display ───────────────────────────────────────────────────────────────────
function truncate(str, len) {
  if (!str) return "";
  const clean = str.replace(/\[~\d+\]/g, "@user").replace(/\s+/g, " ").trim();
  return clean.length > len ? clean.slice(0, len - 1) + "…" : clean;
}

const col = (str, len) => {
  const s = String(str ?? "");
  return s.length > len ? s.slice(0, len - 1) + "…" : s.padEnd(len);
};

// ── scan a single project ─────────────────────────────────────────────────────
async function scanProject(project) {
  process.stderr.write(`  → ${project.name} (${project.id})... `);
  let tasks;
  try {
    tasks = await getAllTasks(project.id);
  } catch {
    process.stderr.write(`omitido (sin acceso)\n`);
    return [];
  }
  process.stderr.write(`${tasks.length} tareas\n`);
  if (!tasks.length) return [];

  const jobs = tasks.map(task => async () => {
    const [comments, subtasks] = await Promise.all([
      getComments(project.id, task.id),
      getSubtasks(project.id, task.id),
    ]);
    const subtaskResults = await Promise.all(
      subtasks.map(async sub => ({
        task: { ...sub, name: `${task.name} › ${sub.name}` },
        comments: await getComments(project.id, sub.id),
      }))
    );
    return [{ task, comments }, ...subtaskResults];
  });

  const taskResults = (await pLimit(jobs, 3)).flat();
  const mentions = [];

  for (const { task, comments } of taskResults) {
    for (const c of comments) {
      if (!mentionsMe(c.comment)) continue;
      const date = parseCommentDate(c);
      if (fromDate && date && date < fromDate) continue;
      if (toDate   && date && date > toDate)   continue;
      mentions.push({
        project:   project.name,
        task_name: task.name,
        author:    c.created_by?.name || "Desconocido",
        date:      date ? date.toISOString().slice(0, 10) : "?",
        content:   c.comment || "",
      });
    }
  }
  return mentions;
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  await initPortalId();
  const rangeLabel = [fromArg, toArg].filter(Boolean).join(" → ") || "sin rango";
  console.log(`\nUsuario: ${MY_USER_ID}  |  Rango: ${rangeLabel}\n`);

  let projects;
  if (projectArg) {
    const p = await resolveProject(projectArg);
    projects = [p];
    console.log(`Proyecto: ${p.name} (${p.id})\n`);
  } else {
    projects = (await getAllProjects()).map(p => ({ id: p.id, name: p.name }));
    console.log(`Escaneando ${projects.length} proyecto(s):\n`);
  }

  const allMentions = [];
  for (const project of projects) {
    const mentions = await scanProject(project);
    allMentions.push(...mentions);
  }

  if (!allMentions.length) {
    console.log("\nNo se encontraron comentarios con menciones.");
    return;
  }

  console.log(`\nSe encontraron ${allMentions.length} mención(es):\n`);

  const COLS = { project: 22, task: 36, author: 20, date: 12, content: 52 };
  const header =
    col("Proyecto",    COLS.project) +
    col("Tarea",       COLS.task) +
    col("Autor",       COLS.author) +
    col("Fecha",       COLS.date) +
    col("Comentario",  COLS.content);
  const divider = "─".repeat(header.length);

  console.log(header);
  console.log(divider);

  const sorted = allMentions.sort((a, b) => b.date.localeCompare(a.date));
  for (const m of sorted) {
    console.log(
      col(m.project,                        COLS.project) +
      col(m.task_name,                      COLS.task) +
      col(m.author,                         COLS.author) +
      col(m.date,                           COLS.date) +
      col(truncate(m.content, COLS.content), COLS.content)
    );
  }

  console.log(divider);
  console.log(`Total: ${allMentions.length} mención(es)\n`);
}

main().catch(err => {
  console.error("Error:", err.message);
  process.exit(1);
});
