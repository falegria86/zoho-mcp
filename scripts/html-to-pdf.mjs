import puppeteer from "puppeteer";
import { pathToFileURL } from "url";
import { resolve } from "path";

const input = resolve(process.argv[2] || "liberacion-tlj-cat.html");
const output = resolve(process.argv[3] || "LIBERACION-TLJ-CAT-2026-07-20.pdf");

const browser = await puppeteer.launch({ headless: "new", args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.goto(pathToFileURL(input).href, { waitUntil: "networkidle0" });
const docTitle = (await page.title()) || "Liberación";
await page.pdf({
  path: output,
  format: "A4",
  printBackground: true,
  margin: { top: "14mm", bottom: "16mm", left: "0mm", right: "0mm" },
  displayHeaderFooter: true,
  headerTemplate: "<div></div>",
  footerTemplate:
    '<div style="width:100%;font-size:8px;color:#8a97a0;padding:0 34px;font-family:sans-serif;">' +
    `<span style="float:left;">SIGOB · ${docTitle}</span>` +
    '<span style="float:right;">Página <span class="pageNumber"></span> de <span class="totalPages"></span></span>' +
    "</div>",
});
await browser.close();
console.log("PDF generado:", output);
