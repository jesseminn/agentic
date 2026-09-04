import * as fs from "node:fs";
import * as path from "node:path";
import { getAgenticDir, requireAgenticDir } from "../lib/platforms.js";
import { readLock, hashFile, hashJson } from "../lib/lock.js";
import { readMcpJson } from "../lib/translate.js";
import { linkPlatform, rulesLineCount, RULES_LINE_BUDGET } from "../lib/linker.js";
import { COMMON_RULES, PROJECT_RULES } from "../lib/harness.js";
import { requireCurrentProtocol } from "../lib/migrate.js";

/**
 * Report harness, linked platforms, and drift. Exits non-zero on any drift
 * so it can gate CI.
 */
export function statusCommand(cwd: string): void {
  requireAgenticDir(cwd);
  requireCurrentProtocol(cwd);
  const agenticDir = getAgenticDir(cwd);
  const lock = readLock(cwd);
  let dirty = false;

  // --- harness ---
  if (!lock) {
    console.log("Harness: (no agentic.lock — run `agentic install <harness>` or `link <platform>`)");
  } else if (!lock.harness) {
    console.log("Harness: (none)");
  } else {
    const h = lock.harness;
    console.log(`Harness: ${h.name}@${h.version}${h.commit ? ` (${h.commit.slice(0, 7)})` : ""}`);
    console.log(`  source: ${h.source}${h.ref ? `#${h.ref}` : ""}`);
    console.log(`  installed: ${h.installedAt}`);
  }
  if (lock) console.log(`Protocol: ${lock.protocol}`);

  // --- lock drift: harness files hand-edited or deleted ---
  const mcp = readMcpJson(path.join(agenticDir, ".mcp.json"));
  if (lock) {
    const drift: string[] = [];
    for (const [rel, hash] of Object.entries(lock.files)) {
      const p = path.join(agenticDir, rel);
      if (!fs.existsSync(p)) drift.push(`${rel}: deleted locally`);
      else if (hashFile(p) !== hash) drift.push(`${rel}: modified locally`);
    }
    for (const [key, hash] of Object.entries(lock.mcpServers)) {
      const entry = mcp.mcpServers[key];
      if (entry === undefined) drift.push(`.mcp.json#${key}: deleted locally`);
      else if (hashJson(entry) !== hash) drift.push(`.mcp.json#${key}: modified locally`);
    }
    if (drift.length) {
      dirty = true;
      console.log(`\nHarness drift (${drift.length}) — harness-owned content edited locally; \`update\` will report conflicts:`);
      for (const d of drift) console.log(`  ! ${d}`);
    }
  }

  // --- content summary ---
  const owned = Object.keys(lock?.files ?? {});
  const ownedSet = new Set(owned);
  const ownedMcp = new Set(Object.keys(lock?.mcpServers ?? {}));
  const rules = [COMMON_RULES, PROJECT_RULES].filter((r) => fs.existsSync(path.join(agenticDir, r)));
  const skills = listDirs(path.join(agenticDir, "skills"));
  const agents = listFiles(path.join(agenticDir, "agents"), ".md");
  const mcpKeys = Object.keys(mcp.mcpServers);

  const split = (items: string[], isOwned: (i: string) => boolean) => {
    const h = items.filter(isOwned).length;
    return `${items.length} (${h} harness, ${items.length - h} project)`;
  };
  console.log(`\nContent:`);
  console.log(`  rules/     ${split(rules, (r) => ownedSet.has(r))}`);
  console.log(`  skills/    ${split(skills, (n) => owned.some((f) => f.startsWith(`skills/${n}/`)))}`);
  console.log(`  agents/    ${split(agents, (n) => ownedSet.has(`agents/${n}`))}`);
  console.log(`  MCP        ${split(mcpKeys, (k) => ownedMcp.has(k))}`);

  // Advice, not drift: every client loads both files into every session.
  const lines = rulesLineCount(cwd);
  if (lines > RULES_LINE_BUDGET) {
    console.log(
      `\nWarning: ${COMMON_RULES} + ${PROJECT_RULES} total ${lines} lines — over ${RULES_LINE_BUDGET}. Every platform loads both into every session, and adherence drops past this size. Move procedure into skills; they load on demand.`
    );
  }

  // --- platforms: dry-run link to find derived drift ---
  const platforms = lock?.platforms ?? [];
  console.log(`\nLinked platforms: ${platforms.length ? platforms.join(", ") : "(none)"}`);
  for (const platform of platforms) {
    const r = linkPlatform(cwd, platform, { apply: false });
    const stale = [
      ...r.added.map((a) => `+ ${a}`),
      ...r.updated.map((u) => `~ ${u}`),
      ...r.removed.map((d) => `- ${d}`),
    ];
    if (stale.length === 0 && r.conflicts.length === 0) {
      console.log(`  ${platform}: ok`);
      continue;
    }
    dirty = true;
    console.log(`  ${platform}: stale — run \`agentic link ${platform}\``);
    for (const s of stale) console.log(`    ${s}`);
    for (const c of r.conflicts) console.log(`    ! ${c}`);
  }

  if (dirty) process.exit(1);
}

function listFiles(dir: string, ext: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile() && d.name.endsWith(ext))
    .map((d) => d.name);
}

function listDirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}
