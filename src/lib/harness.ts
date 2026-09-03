import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { readMcpJson, type McpConfig } from "./translate.js";

/**
 * The standard shape of an agentic harness. See docs/design-v1.md §3.
 *
 *   harness.json            name, version
 *   RULES.md                harness-owned
 *   rules/<name>.md         harness-owned
 *   references/<name>.md    harness-owned
 *   skills/<name>/SKILL.md  harness-owned
 *   agents/<name>.md        harness-owned
 *   mcps.json               harness-owned entries (merged by key)
 *   PROJECT.md              seed-once
 *   project/<name>.md       seed-once
 */
export const HARNESS_META = "harness.json";
export const HARNESS_MCP = "mcps.json";
export const OWNED_FILES = ["RULES.md"] as const;
export const OWNED_DIRS = ["rules", "references", "skills", "agents"] as const;
export const SEED_FILES = ["PROJECT.md"] as const;
export const SEED_DIRS = ["project"] as const;

export interface HarnessMeta {
  name: string;
  version: string;
}

export interface ResolvedHarness {
  /** Local directory holding the harness content. */
  dir: string;
  /** Source as it should be recorded in the lock. */
  source: string;
  ref: string | null;
  commit: string | null;
  meta: HarnessMeta;
  /** Remove any temp checkout. Safe to call more than once. */
  cleanup: () => void;
}

const GIT_URL_RE = /^(git@|https?:\/\/|ssh:\/\/|git:\/\/|file:\/\/|github:)/;

export function isGitSpec(spec: string): boolean {
  return GIT_URL_RE.test(spec);
}

/** Split `source#ref` into its parts. */
export function parseSpec(spec: string): { source: string; ref: string | null } {
  const hash = spec.lastIndexOf("#");
  if (hash <= 0) return { source: spec, ref: null };
  return { source: spec.slice(0, hash), ref: spec.slice(hash + 1) || null };
}

/**
 * Fetch a harness from a git URL (temp clone) or a local path, validate its
 * shape, and return where to read it from.
 */
export function resolveHarness(spec: string, cwd: string): ResolvedHarness {
  const { source, ref } = parseSpec(spec);

  if (isGitSpec(source)) {
    const url = source.startsWith("github:")
      ? `https://github.com/${source.slice("github:".length)}.git`
      : source;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "agentic-"));
    const dir = path.join(tmp, "harness");
    cloneInto(url, ref, dir);
    const meta = validateHarness(dir);
    return {
      dir,
      source: url,
      ref,
      commit: gitHead(dir),
      meta,
      cleanup: () => fs.rmSync(tmp, { recursive: true, force: true }),
    };
  }

  const dir = path.resolve(cwd, source);
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    throw new Error(`Harness path not found: ${dir}`);
  }
  const meta = validateHarness(dir);
  return {
    dir,
    source: dir,
    ref,
    commit: gitHead(dir),
    meta,
    cleanup: () => {},
  };
}

function cloneInto(url: string, ref: string | null, dir: string): void {
  const base = ["clone", "--quiet", "--depth", "1"];
  try {
    execFileSync("git", [...base, ...(ref ? ["--branch", ref] : []), url, dir], {
      stdio: "pipe",
    });
    return;
  } catch (e) {
    if (!ref) throw new Error(`git clone failed for ${url}: ${(e as Error).message}`);
  }
  // `--branch` rejects a commit sha; fall back to a full clone + checkout.
  fs.rmSync(dir, { recursive: true, force: true });
  execFileSync("git", ["clone", "--quiet", url, dir], { stdio: "pipe" });
  execFileSync("git", ["-C", dir, "checkout", "--quiet", ref!], { stdio: "pipe" });
}

function gitHead(dir: string): string | null {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "HEAD"], {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

/** Validate the standard shape. Throws with every problem listed. */
export function validateHarness(dir: string): HarnessMeta {
  const problems: string[] = [];

  const metaPath = path.join(dir, HARNESS_META);
  let meta: HarnessMeta | null = null;
  if (!fs.existsSync(metaPath)) {
    problems.push(`missing ${HARNESS_META}`);
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(metaPath, "utf-8"));
      if (typeof raw.name !== "string" || !raw.name) problems.push(`${HARNESS_META}: "name" required`);
      if (typeof raw.version !== "string" || !raw.version) problems.push(`${HARNESS_META}: "version" required`);
      meta = { name: raw.name, version: raw.version };
    } catch (e) {
      problems.push(`${HARNESS_META}: ${(e as Error).message}`);
    }
  }

  if (!fs.existsSync(path.join(dir, "RULES.md"))) problems.push("missing RULES.md");

  const skillsDir = path.join(dir, "skills");
  if (fs.existsSync(skillsDir)) {
    for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      if (!fs.existsSync(path.join(skillsDir, entry.name, "SKILL.md"))) {
        problems.push(`skills/${entry.name}/ has no SKILL.md`);
      }
    }
  }

  const mcp = readHarnessMcp(dir);
  for (const offender of findLiteralSecrets(mcp)) {
    problems.push(`${HARNESS_MCP}: ${offender} — env values must be \${NAME} references, never literals`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid harness at ${dir}:\n  - ${problems.join("\n  - ")}`);
  }
  return meta!;
}

/** Harness-owned files, as paths relative to the harness root. */
export function listOwnedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of OWNED_FILES) {
    if (fs.existsSync(path.join(dir, f))) out.push(f);
  }
  for (const d of OWNED_DIRS) {
    walk(path.join(dir, d), (abs) => out.push(path.relative(dir, abs)));
  }
  return out.sort();
}

/** Seed-once files, as paths relative to the harness root. */
export function listSeedFiles(dir: string): string[] {
  const out: string[] = [];
  for (const f of SEED_FILES) {
    if (fs.existsSync(path.join(dir, f))) out.push(f);
  }
  for (const d of SEED_DIRS) {
    walk(path.join(dir, d), (abs) => out.push(path.relative(dir, abs)));
  }
  return out.sort();
}

export function readHarnessMcp(dir: string): McpConfig {
  const primary = path.join(dir, HARNESS_MCP);
  if (fs.existsSync(primary)) return readMcpJson(primary);
  return readMcpJson(path.join(dir, ".mcp.json"));
}

const ENV_REF_RE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$|^\$[A-Za-z_][A-Za-z0-9_]*$/;

/**
 * Env values in a committed MCP config must be `${NAME}` references.
 * Returns `server.KEY` for every literal value.
 */
export function findLiteralSecrets(config: McpConfig): string[] {
  const out: string[] = [];
  for (const [server, entry] of Object.entries(config.mcpServers ?? {})) {
    for (const [key, value] of Object.entries(entry.env ?? {})) {
      if (!ENV_REF_RE.test(String(value))) out.push(`${server}.env.${key}`);
    }
  }
  return out;
}

function walk(dir: string, visit: (abs: string) => void): void {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(abs, visit);
    else if (entry.isFile()) visit(abs);
  }
}
