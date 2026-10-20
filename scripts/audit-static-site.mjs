import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const webRoot = path.join(projectRoot, "web");
const errors = [];

const webFiles = [webRoot, path.join(webRoot, "legacy")].flatMap((directory) => fs.readdirSync(directory, { withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => path.join(directory, entry.name)));
const htmlFiles = webFiles.filter((file) => file.endsWith(".html"));
const cssFiles = webFiles.filter((file) => file.endsWith(".css"));
const jsFiles = webFiles.filter((file) => file.endsWith(".js"));

function report(file, message) {
  errors.push(`${path.relative(projectRoot, file)}: ${message}`);
}

function isIgnoredReference(value) {
  return !value
    || value.startsWith("#")
    || value.startsWith("//")
    || /^(?:https?:|mailto:|tel:|data:|blob:|javascript:)/i.test(value)
    || /\{\{|\$\{/.test(value);
}

function cleanReference(value) {
  const clean = value.split("#", 1)[0].split("?", 1)[0];
  try { return decodeURIComponent(clean); } catch { return clean; }
}

function referenceExists(fromFile, rawValue) {
  if (isIgnoredReference(rawValue)) return true;
  const value = cleanReference(rawValue);
  if (!value) return true;
  if (/^\/?mid-[cai]-\d{4}\/?$/i.test(value)) return true;
  const documentBase = fromFile.endsWith(".html") ? fs.readFileSync(fromFile, "utf8").match(/<base\s+href=["']([^"']+)["']/i)?.[1] : null;
  const baseDirectory = documentBase
    ? documentBase.startsWith("/") ? path.resolve(webRoot, `.${documentBase}`) : path.resolve(path.dirname(fromFile), documentBase)
    : path.dirname(fromFile);
  if (documentBase && rawValue === documentBase) return baseDirectory.startsWith(webRoot) && fs.existsSync(baseDirectory);
  const target = value.startsWith("/")
    ? path.resolve(webRoot, `.${value}`)
    : path.resolve(baseDirectory, value);
  return target.startsWith(webRoot) && fs.existsSync(target);
}

for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const ids = [...source.matchAll(/\sid=["']([^"']+)["']/gi)].map((match) => match[1]);
  const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
  for (const id of duplicates) report(file, `duplicate id=\"${id}\"`);

  for (const match of source.matchAll(/\s(?:src|href)=["']([^"']+)["']/gi)) {
    if (!referenceExists(file, match[1])) report(file, `missing local reference \"${match[1]}\"`);
  }
}

for (const file of cssFiles) {
  const source = fs.readFileSync(file, "utf8");
  for (const match of source.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) {
    if (!referenceExists(file, match[1].trim())) report(file, `missing CSS asset \"${match[1].trim()}\"`);
  }
}

for (const file of jsFiles) {
  const check = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (check.status !== 0) report(file, (check.stderr || check.stdout || "JavaScript syntax error").trim());
}

const designVersions = new Set();
for (const file of htmlFiles) {
  const source = fs.readFileSync(file, "utf8");
  const match = source.match(/design-system\.css\?v=(\d+)/);
  if (match) designVersions.add(match[1]);
}
if (designVersions.size > 1) errors.push(`web: inconsistent design-system versions: ${[...designVersions].join(", ")}`);

if (errors.length) {
  console.error(`Static site audit failed with ${errors.length} error(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Static site audit passed: ${htmlFiles.length} HTML, ${cssFiles.length} CSS and ${jsFiles.length} JS files checked.`);
