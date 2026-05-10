import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = (process.env.PIKELET_WS_URL || "").trim();

if (!url) {
  console.log("PIKELET_WS_URL not set — leaving pikelet-ws-endpoint meta empty (same-origin /ws).");
  process.exit(0);
}

const escaped = url.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const metaTag = `<meta name="pikelet-ws-endpoint" content="${escaped}" />`;

for (const f of ["index.html", "host.html", "join.html"]) {
  const fp = path.join(root, f);
  let html = fs.readFileSync(fp, "utf8");
  if (!html.includes('name="pikelet-ws-endpoint"')) {
    console.warn(`Skip ${f}: no pikelet-ws-endpoint meta found.`);
    continue;
  }
  html = html.replace(/<meta name="pikelet-ws-endpoint"[^>]*>/, metaTag);
  fs.writeFileSync(fp, html);
  console.log(`Updated ${f}`);
}
