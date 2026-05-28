import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BEGIN_MARKER_RE = /<!--\s*agentic:begin[^>]*-->/;
const END_MARKER_RE = /<!--\s*agentic:end\s*-->/;

function getTemplatesDir(): string {
  return path.join(__dirname, "..", "templates");
}

function getBundledSkillsDir(): string {
  return path.join(getTemplatesDir(), "skills");
}

function getVersion(): string {
  const pkgPath = path.join(__dirname, "..", "..", "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
  return pkg.version;
}

function readRulesTemplate(): string {
  const src = path.join(getTemplatesDir(), "RULES.md");
  return fs.readFileSync(src, "utf-8").replace(/\{\{version\}\}/g, getVersion());
}

/**
 * The managed sentinel block extracted from the bundled RULES.md template,
 * including the begin/end marker lines but excluding any content after the
 * end marker (which is the user-facing "add rules below" hint).
 */
function buildManagedBlock(): string {
  const content = readRulesTemplate();
  const beginMatch = content.match(BEGIN_MARKER_RE);
  const endMatch = content.match(END_MARKER_RE);
  if (!beginMatch || !endMatch) {
    throw new Error("Bundled RULES.md template missing agentic markers");
  }
  const beginIdx = content.indexOf(beginMatch[0]);
  const endIdx = content.indexOf(endMatch[0]) + endMatch[0].length;
  return content.slice(beginIdx, endIdx);
}

/**
 * Write a fresh RULES.md from the bundled template (managed block + hint).
 */
export function writeRulesFromTemplate(destPath: string): void {
  fs.writeFileSync(destPath, readRulesTemplate());
}

/**
 * Replace the managed block in RULES.md with the bundled version.
 * Returns "updated" if markers were found and replaced; "no-file" if the
 * file is missing; "no-markers" if the file exists but lacks markers.
 */
export function updateManagedBlock(
  rulesPath: string
): "updated" | "no-file" | "no-markers" {
  if (!fs.existsSync(rulesPath)) return "no-file";
  const content = fs.readFileSync(rulesPath, "utf-8");
  const beginMatch = content.match(BEGIN_MARKER_RE);
  const endMatch = content.match(END_MARKER_RE);
  if (!beginMatch || !endMatch) return "no-markers";

  const beginIdx = content.indexOf(beginMatch[0]);
  const endIdx = content.indexOf(endMatch[0]) + endMatch[0].length;
  const before = content.slice(0, beginIdx);
  const after = content.slice(endIdx);

  fs.writeFileSync(rulesPath, before + buildManagedBlock() + after);
  return "updated";
}

/**
 * Prepend the managed block to RULES.md if markers are absent; otherwise
 * update in place. Used by `inject` to wrap imported content.
 */
export function ensureManagedBlock(rulesPath: string): void {
  const existing = fs.existsSync(rulesPath)
    ? fs.readFileSync(rulesPath, "utf-8")
    : "";
  const hasMarkers =
    BEGIN_MARKER_RE.test(existing) && END_MARKER_RE.test(existing);
  if (hasMarkers) {
    updateManagedBlock(rulesPath);
    return;
  }
  const block = buildManagedBlock();
  const body = existing.length > 0 ? "\n\n" + existing : "\n";
  fs.writeFileSync(rulesPath, block + body);
}

/**
 * Strip the managed block (and one trailing blank line) from RULES.md.
 * Used by `eject` so the flattened standalone rules file doesn't carry
 * the "managed" header anymore.
 */
export function stripManagedBlock(rulesPath: string): void {
  if (!fs.existsSync(rulesPath)) return;
  const content = fs.readFileSync(rulesPath, "utf-8");
  const beginMatch = content.match(BEGIN_MARKER_RE);
  const endMatch = content.match(END_MARKER_RE);
  if (!beginMatch || !endMatch) return;

  const beginIdx = content.indexOf(beginMatch[0]);
  const endIdx = content.indexOf(endMatch[0]) + endMatch[0].length;
  const before = content.slice(0, beginIdx);
  const after = content.slice(endIdx).replace(/^\s*\n+/, "");
  fs.writeFileSync(rulesPath, before + after);
}

/**
 * List bundled skill directory names (always prefixed `agentic-`).
 */
export function getBundledSkillNames(): string[] {
  const dir = getBundledSkillsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name.startsWith("agentic-"))
    .map((entry) => entry.name);
}

/**
 * Copy all bundled skills into the workspace's skills/ directory,
 * overwriting any existing directories with the same names.
 * Returns the list of skill names copied.
 */
export function copyBundledSkills(destSkillsDir: string): string[] {
  const srcDir = getBundledSkillsDir();
  if (!fs.existsSync(srcDir)) return [];
  fs.mkdirSync(destSkillsDir, { recursive: true });
  const copied: string[] = [];
  for (const name of getBundledSkillNames()) {
    const dest = path.join(destSkillsDir, name);
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(path.join(srcDir, name), dest, { recursive: true });
    copied.push(name);
  }
  return copied;
}

/**
 * Remove all bundled skills from the workspace's skills/ directory.
 * Used by `eject`.
 */
export function removeBundledSkills(destSkillsDir: string): string[] {
  if (!fs.existsSync(destSkillsDir)) return [];
  const removed: string[] = [];
  for (const name of getBundledSkillNames()) {
    const target = path.join(destSkillsDir, name);
    if (fs.existsSync(target)) {
      fs.rmSync(target, { recursive: true, force: true });
      removed.push(name);
    }
  }
  return removed;
}
