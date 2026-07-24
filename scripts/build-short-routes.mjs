import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(root, "web");
const recordTemplate = await readFile(path.join(webRoot, "record.html"), "utf8");
const entries = await readdir(webRoot, { withFileTypes: true });
const sourceFiles = entries
  .filter((entry) => entry.isFile() && /\.(?:html|js)$/i.test(entry.name))
  .map((entry) => entry.name);

const ids = new Set();
for (const file of sourceFiles) {
  const source = await readFile(path.join(webRoot, file), "utf8");
  for (const match of source.matchAll(/\bMID-[CAI]-\d{4}\b/gi)) ids.add(match[0].toUpperCase());
}

const routeTemplate = recordTemplate.replace("<head>", '<head>\n    <base href="../" />');
for (const id of [...ids].sort()) {
  const route = path.join(webRoot, id.toLowerCase());
  await rm(route, { recursive: true, force: true });
  await mkdir(route, { recursive: true });
  await writeFile(path.join(route, "index.html"), routeTemplate, "utf8");
}

const fallbackTemplate = recordTemplate.replace("<head>", '<head>\n    <base href="/" />');
await writeFile(path.join(webRoot, "404.html"), fallbackTemplate, "utf8");
console.log(`Generated ${ids.size} short dossier routes and the fallback route.`);
