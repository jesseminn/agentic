import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTIC_DIR, getAgenticDir } from "./platforms.js";
import { CURRENT_PROTOCOL, DEFAULT_PROTOCOL, compareProtocol } from "./protocol.js";
import { readLock, writeLock, emptyLock, type Lock } from "./lock.js";
import { COMMON_RULES, PROJECT_RULES, PROJECT_STUB, LEGACY_PATHS, extraRulesFiles } from "./harness.js";
import { linkPlatform, removeIfEmpty, type LinkReport } from "./linker.js";
import { isLinkInto } from "./symlink.js";

/**
 * One step from a protocol to the next. Steps touch only project-owned
 * content and derived files: a harness-owned path (in the lock) is left for
 * `update`, which replaces it from a harness on the new protocol.
 */
interface Step {
  from: string;
  to: string;
  run: (cwd: string, lock: Lock) => string[];
}

const STEPS: Step[] = [{ from: "1.0", to: "1.1", run: from10to11 }];

export interface MigrateResult {
  from: string;
  to: string;
  lines: string[];
  links: LinkReport[];
}

/**
 * The protocol a project is on. A lock says so; without one, `.agentic/`
 * that still carries the 1.0 paths is 1.0 (v0.2 and lock-less v1.0.0
 * projects), anything else is current.
 */
export function effectiveProtocol(cwd: string, lock: Lock | null): string {
  if (lock) return lock.protocol;
  const agenticDir = getAgenticDir(cwd);
  return LEGACY_PATHS.some((p) => fs.existsSync(path.join(agenticDir, p))) ? DEFAULT_PROTOCOL : CURRENT_PROTOCOL;
}

/** Stop when the project is not on this build's protocol. `update` and `install` migrate instead. */
export function requireCurrentProtocol(cwd: string): void {
  const from = effectiveProtocol(cwd, readLock(cwd));
  const c = compareProtocol(from, CURRENT_PROTOCOL);
  if (c === 0) return;
  console.error(
    c < 0
      ? `Error: ${AGENTIC_DIR}/ is on protocol ${from}; this agentic reads ${CURRENT_PROTOCOL}. Run \`agentic migrate\` (or \`agentic update\`, which migrates first).`
      : `Error: ${AGENTIC_DIR}/ is on protocol ${from}; this agentic reads ${CURRENT_PROTOCOL}. Upgrade agentic.`
  );
  process.exit(1);
}

/**
 * Apply every step from the project's protocol up to the current one, stamp
 * the lock, and re-link recorded platforms. Returns null when nothing is
 * pending. Throws when the project is ahead of this build.
 */
export function migrateProject(cwd: string): MigrateResult | null {
  if (!fs.existsSync(getAgenticDir(cwd))) return null;
  const existing = readLock(cwd);
  const from = effectiveProtocol(cwd, existing);
  const c = compareProtocol(from, CURRENT_PROTOCOL);
  if (c === 0) return null;
  if (c > 0) {
    throw new Error(`${AGENTIC_DIR}/ is on protocol ${from}; this agentic reads ${CURRENT_PROTOCOL}. Upgrade agentic.`);
  }

  const lock = existing ?? emptyLock();
  const lines: string[] = [];
  let cur = from;
  while (compareProtocol(cur, CURRENT_PROTOCOL) < 0) {
    const step = STEPS.find((s) => s.from === cur);
    if (!step) throw new Error(`no migration from protocol ${cur}`);
    lines.push(...step.run(cwd, lock));
    cur = step.to;
  }
  lock.protocol = CURRENT_PROTOCOL;
  writeLock(cwd, lock);

  const links = lock.platforms.map((p) => linkPlatform(cwd, p));
  return { from, to: CURRENT_PROTOCOL, lines, links };
}

// --- steps ---

/**
 * 1.0 → 1.1. RULES.md, rules/<topic>.md, PROJECT.md and project/<topic>.md
 * become rules/COMMON.md + rules/PROJECT.md. Project-owned topic files are
 * folded into rules/PROJECT.md, lossless and marked with their source, for
 * the user to promote to skills. v1.0 also linked rules one by one into
 * .claude/rules/; those links are stale and removed, real files there stay.
 */
function from10to11(cwd: string, lock: Lock): string[] {
  const agenticDir = getAgenticDir(cwd);
  const owned = new Set(Object.keys(lock.files));
  const abs = (rel: string) => path.join(agenticDir, rel);
  const out: string[] = [];

  const move = (from: string, to: string) => {
    if (!fs.existsSync(abs(from))) return;
    if (owned.has(from)) {
      out.push(`${from} is harness-owned — \`update\` replaces it with ${to}`);
      return;
    }
    if (fs.existsSync(abs(to))) {
      out.push(`${from} kept: ${to} already exists — merge them by hand`);
      return;
    }
    fs.mkdirSync(path.dirname(abs(to)), { recursive: true });
    fs.renameSync(abs(from), abs(to));
    out.push(`${from} → ${to}`);
  };
  move("RULES.md", COMMON_RULES);
  move("PROJECT.md", PROJECT_RULES);

  const topics: string[] = [];
  for (const name of extraRulesFiles(agenticDir)) {
    if (name.endsWith(".md") && fs.statSync(abs(`rules/${name}`)).isFile()) topics.push(`rules/${name}`);
  }
  walk(abs("project"), (p) => {
    if (p.endsWith(".md")) topics.push(path.relative(agenticDir, p));
  });
  for (const rel of topics) {
    if (owned.has(rel)) {
      out.push(`${rel} is harness-owned — \`update\` removes it`);
      continue;
    }
    if (!fs.existsSync(abs(PROJECT_RULES))) {
      fs.mkdirSync(path.dirname(abs(PROJECT_RULES)), { recursive: true });
      fs.writeFileSync(abs(PROJECT_RULES), PROJECT_STUB);
    }
    const title = path.basename(rel, ".md");
    const body = fs.readFileSync(abs(rel), "utf-8").trim();
    fs.appendFileSync(
      abs(PROJECT_RULES),
      `\n\n## ${title}\n<!-- migrated from ${AGENTIC_DIR}/${rel} (protocol 1.0 → 1.1) -->\n${body}\n`
    );
    fs.unlinkSync(abs(rel));
    out.push(`${rel} folded into ${PROJECT_RULES} as "## ${title}"`);
  }
  pruneEmptyTree(abs("project"));

  // v1.0 wrote per-file rule links here for Claude Code. The dir may also hold
  // the project's own path-scoped rules — real files, never touched.
  const rulesDir = path.join(cwd, ".claude", "rules");
  if (fs.existsSync(rulesDir) && fs.lstatSync(rulesDir).isDirectory()) {
    for (const name of fs.readdirSync(rulesDir)) {
      const p = path.join(rulesDir, name);
      if (!isLinkInto(p, agenticDir)) continue;
      fs.unlinkSync(p);
      out.push(`.claude/rules/${name} removed (per-file rule link)`);
    }
    removeIfEmpty(rulesDir);
  }

  if (lock.harness && out.some((l) => l.includes("harness-owned"))) {
    out.push(`then run \`agentic update\` to replace harness-owned files from a protocol-1.1 harness`);
  }
  return out;
}

// --- fs helpers ---

function walk(dir: string, visit: (abs: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(p, visit);
    else if (entry.isFile()) visit(p);
  }
}

/** Remove a directory tree that holds no files any more; leave it if anything remains. */
function pruneEmptyTree(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) pruneEmptyTree(path.join(dir, entry.name));
  }
  removeIfEmpty(dir);
}
