import puppeteer from "puppeteer";
import { pathToFileURL } from "url";
const S = "/private/tmp/claude-501/-Users-usuario-Documents-GitHub-zoho-mcp/4848f3e2-ab9c-4435-b169-16bbceee8ef1/scratchpad";
const b = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const p = await b.newPage();
await p.setViewport({ width: 1300, height: 1400 });
await p.goto(pathToFileURL(`${S}/preview.html`).href, { waitUntil: "networkidle0" });
// capturar solo las primeras 3 tarjetas (una plana, una html, una con quotes)
await p.screenshot({ path: `${S}/preview-top.png`, clip: { x: 0, y: 0, width: 1300, height: 1400 } });
await b.close();
console.log("shot ok");
