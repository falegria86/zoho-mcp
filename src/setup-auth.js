#!/usr/bin/env node
/**
 * Ejecuta este script UNA SOLA VEZ para autenticarte con Zoho.
 * Abre el navegador, captura el código OAuth y guarda los tokens en tokens.json
 *
 * Uso: npm run setup
 */
import "dotenv/config";
import { createServer } from "http";
import { exec } from "child_process";
import { writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const BASE_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");

const CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;
const REDIRECT_URI  = "http://localhost:8080/callback";
const SCOPES = [
  "ZohoProjects.portals.READ",
  "ZohoProjects.projects.ALL",
  "ZohoProjects.tasks.ALL",
  "ZohoProjects.timesheets.ALL",
  "ZohoProjects.users.READ",
].join(",");

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error("Error: ZOHO_CLIENT_ID y ZOHO_CLIENT_SECRET deben estar en el archivo .env");
  process.exit(1);
}

function waitForCode() {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, "http://localhost:8080");
      const code  = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(`<h1 style="font-family:sans-serif;color:#27ae60">
        Autenticacion exitosa — puedes cerrar esta ventana.
      </h1>`);

      server.close();
      if (error) reject(new Error(error));
      else resolve(code);
    });

    server.listen(8080, () => {
      console.log("Esperando callback en http://localhost:8080/callback ...");
    });
  });
}

const authUrl = new URL("https://accounts.zoho.com/oauth/v2/auth");
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("client_id", CLIENT_ID);
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("Abriendo navegador para autenticacion con Zoho...");
exec(`open "${authUrl.toString()}"`);

const code = await waitForCode();
console.log("Codigo recibido. Obteniendo tokens...");

const params = new URLSearchParams({
  code,
  client_id:     CLIENT_ID,
  client_secret: CLIENT_SECRET,
  redirect_uri:  REDIRECT_URI,
  grant_type:    "authorization_code",
});

const res  = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, { method: "POST" });
const data = await res.json();

if (data.error) {
  console.error("Error obteniendo tokens:", data);
  process.exit(1);
}

const tokensFile = join(BASE_DIR, "tokens.json");
writeFileSync(tokensFile, JSON.stringify({
  access_token:  data.access_token,
  refresh_token: data.refresh_token,
  client_id:     CLIENT_ID,
  client_secret: CLIENT_SECRET,
}, null, 2));

console.log(`\nTokens guardados en ${tokensFile}`);
console.log("Listo. Ya puedes usar el servidor MCP con Claude.");
