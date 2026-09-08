#!/usr/bin/env node
/**
 * bump-admin-version.mjs — mantiene consistente el token de versión del panel
 * admin (?v=adm-...) en admin.html y en todos los imports de js/admin/**.
 *
 * El token es un hash del contenido de los módulos: si el código del panel
 * cambia, el token cambia (y la caché baja el grafo nuevo completo, sin
 * mezclar versiones — lo que dejaba el panel en negro). Si nada cambió, el
 * token queda igual y no se genera diff (idempotente).
 *
 * Uso:
 *   node scripts/bump-admin-version.mjs           # reescribe el token si hace falta
 *   node scripts/bump-admin-version.mjs --check   # exit 1 si está desactualizado
 *   node scripts/bump-admin-version.mjs --quiet   # solo imprime si hubo cambios
 *
 * scripts/guardar.sh lo corre automáticamente antes de cada commit.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ADMIN_DIR = join(ROOT, "js", "admin");
const ADMIN_HTML = join(ROOT, "admin.html");

const CHECK = process.argv.includes("--check");
const QUIET = process.argv.includes("--quiet");

// Solo tokens del panel ("adm..."); no roza ?v=fase6-actividad, ?v=icons-4, etc.
const TOKEN_RE = /v=adm[\w-]*/g;

function log(...args) {
  if (!QUIET) console.log(...args);
}

function listAdminFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listAdminFiles(full));
    else if (entry.endsWith(".js")) out.push(full);
  }
  return out.sort((a, b) => relative(ROOT, a).localeCompare(relative(ROOT, b)));
}

// Hash del contenido con los tokens normalizados: el token no se hashea a sí
// mismo (si no, cada corrida cambiaría el resultado y nunca sería idempotente).
function computeToken(files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const normalized = readFileSync(file, "utf8").replace(TOKEN_RE, "v=ADMTOKEN");
    hash.update(relative(ROOT, file) + "\0" + normalized + "\0");
  }
  return "adm-" + hash.digest("hex").slice(0, 8);
}

// En admin.html el token solo aparece en líneas que referencian js/admin/
// (los demás ?v= de la página son de otros recursos y no se tocan).
function replaceInHtml(content, token) {
  return content
    .split("\n")
    .map((line) => (line.includes("js/admin/") ? line.replace(TOKEN_RE, "v=" + token) : line))
    .join("\n");
}

const jsFiles = listAdminFiles(ADMIN_DIR);
if (jsFiles.length === 0) {
  console.error("❌ No encontré módulos en js/admin/ — ¿se movió el panel?");
  process.exit(1);
}

const token = computeToken(jsFiles);
let occurrences = 0;
let filesChanged = 0;
const stale = new Set();

for (const file of [...jsFiles, ADMIN_HTML]) {
  const original = readFileSync(file, "utf8");
  const isHtml = file === ADMIN_HTML;
  const matches = isHtml
    ? original.split("\n").filter((l) => l.includes("js/admin/")).join("\n").match(TOKEN_RE)
    : original.match(TOKEN_RE);
  if (!matches) continue;

  occurrences += matches.length;
  for (const m of matches) if (m !== "v=" + token) stale.add(m.slice(2));

  const updated = isHtml
    ? replaceInHtml(original, token)
    : original.replace(TOKEN_RE, "v=" + token);
  if (updated !== original) {
    filesChanged++;
    if (!CHECK) writeFileSync(file, updated);
  }
}

if (occurrences === 0) {
  console.error("❌ No encontré ningún token v=adm... — revisa TOKEN_RE o los imports del panel.");
  process.exit(1);
}

if (filesChanged === 0) {
  log(`✓ Token del panel al día: ${token} (${occurrences} ocurrencias).`);
  process.exit(0);
}

if (CHECK) {
  console.error(
    `❌ Token del panel desactualizado: ${[...stale].join(", ")} → ${token} ` +
      `(${filesChanged} archivos). Corre: node scripts/bump-admin-version.mjs (o usa /guardar).`
  );
  process.exit(1);
}

console.log(
  `✓ Token del panel: ${[...stale].join(", ") || "(nuevo)"} → ${token} ` +
    `(${occurrences} ocurrencias en ${filesChanged} archivos actualizados).`
);
