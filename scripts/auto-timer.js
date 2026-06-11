import { config } from "dotenv";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
config({ path: join(dirname(fileURLToPath(import.meta.url)), "..", ".env") });

import { zohoClient } from "../src/zoho-client.js";

const PORTAL_NAME = process.env.ZOHO_PORTAL_NAME || "sigobproyectos";
const PROJECT_ID  = process.env.ZOHO_AUTO_TIMER_PROJECT_ID;
const TASK_ID     = process.env.ZOHO_AUTO_TIMER_TASK_ID;
const action      = process.argv[2];

if (!PROJECT_ID || !TASK_ID) {
  console.error("Error: ZOHO_AUTO_TIMER_PROJECT_ID y ZOHO_AUTO_TIMER_TASK_ID son requeridos en .env");
  process.exit(1);
}

if (!["start", "stop"].includes(action)) {
  console.error("Uso: node scripts/auto-timer.js [start|stop]");
  process.exit(1);
}

async function getPortalId() {
  if (/^\d+$/.test(PORTAL_NAME)) return PORTAL_NAME;
  const portals = await zohoClient.get("/portals");
  const list = Array.isArray(portals) ? portals : (portals.portals || []);
  const match = list.find(p =>
    p.portal_name === PORTAL_NAME || p.org_name === PORTAL_NAME || p.name === PORTAL_NAME
  );
  if (!match?.id) throw new Error(`Portal no encontrado: ${PORTAL_NAME}`);
  return String(match.id);
}

async function startTimer(portal) {
  const modulesRes = await zohoClient.get(`/portal/${portal}/projects/${PROJECT_ID}/modules`);
  const modules = modulesRes.modules || [];
  const taskModule = modules.find(m => m.module_name === "Task");
  if (!taskModule) throw new Error("Módulo de tareas no encontrado en el proyecto.");

  const r = await zohoClient.post(`/portal/${portal}/timelogs/timers`, {
    entity_id:  TASK_ID,
    project_id: PROJECT_ID,
    module_id:  taskModule.module_id,
  });

  if (r?.timer || r?.id) {
    console.log(`[${new Date().toISOString()}] Timer iniciado — tarea ${TASK_ID}`);
  } else {
    console.log(`[${new Date().toISOString()}] Respuesta start: ${JSON.stringify(r)}`);
  }
}

async function stopTimer(portal) {
  const timersRes = await zohoClient.get(`/portal/${portal}/timelogs/timers`, { type: "task" });
  const timers = timersRes.timer || [];
  const active = timers.find(t => String(t.entity_id) === String(TASK_ID)) ?? timers[0];

  if (!active) {
    console.log(`[${new Date().toISOString()}] No hay timer activo.`);
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const r = await zohoClient.patch(`/portal/${portal}/timelogs/timers/${active.id}/stop`, {
    type:         "task",
    date:         today,
    bill_status:  "Non Billable",
    project_id:   PROJECT_ID,
  });

  if (r?.error?.details?.[0]?.message_key === "zero_hour_restriction") {
    console.log(`[${new Date().toISOString()}] Timer descartado (duración < 30 segundos).`);
  } else if (r?.error) {
    console.error(`[${new Date().toISOString()}] Error al detener: ${JSON.stringify(r.error)}`);
    process.exit(1);
  } else {
    console.log(`[${new Date().toISOString()}] Timer detenido. Tiempo: ${active.time_spent || "N/A"}`);
  }
}

const portal = await getPortalId();
if (action === "start") await startTimer(portal);
else                    await stopTimer(portal);
