import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { getAgenticDir, isPlatformId, type PlatformId } from "./platforms.js";

export const LOCK_FILE = "agentic.lock";

export interface HarnessRef {
  name: string;
  version: string;
  /** Git URL or absolute path, as resolved at install time. */
  source: string;
  /** Branch / tag requested, if any. */
  ref: string | null;
  /** Resolved commit, when the source is a git checkout. */
  commit: string | null;
  installedAt: string;
}

export interface Lock {
  harness: HarnessRef | null;
  /** Harness-owned paths relative to .agentic/, with content hash. */
  files: Record<string, string>;
  /** Harness-owned server keys inside .agentic/.mcp.json, with entry hash. */
  mcpServers: Record<string, string>;
  /** Platforms currently linked. */
  platforms: PlatformId[];
}

export function emptyLock(): Lock {
  return { harness: null, files: {}, mcpServers: {}, platforms: [] };
}

export function getLockPath(cwd: string): string {
  return path.join(getAgenticDir(cwd), LOCK_FILE);
}

export function readLock(cwd: string): Lock | null {
  const p = getLockPath(cwd);
  if (!fs.existsSync(p)) return null;
  const raw = JSON.parse(fs.readFileSync(p, "utf-8"));
  const platforms: PlatformId[] = [];
  for (const id of raw.platforms ?? []) {
    if (isPlatformId(id)) platforms.push(id);
    else console.error(`Warning: agentic.lock lists unknown platform "${id}" (removed from this version) — ignored.`);
  }
  return {
    harness: raw.harness ?? null,
    files: raw.files ?? {},
    mcpServers: raw.mcpServers ?? {},
    platforms,
  };
}

/** Read the lock, or start an empty one so `link` can record platforms. */
export function ensureLock(cwd: string): Lock {
  return readLock(cwd) ?? emptyLock();
}

export function writeLock(cwd: string, lock: Lock): void {
  const sorted: Lock = {
    harness: lock.harness,
    files: sortKeys(lock.files),
    mcpServers: sortKeys(lock.mcpServers),
    platforms: [...lock.platforms],
  };
  fs.mkdirSync(getAgenticDir(cwd), { recursive: true });
  fs.writeFileSync(getLockPath(cwd), JSON.stringify(sorted, null, 2) + "\n");
}

export function requireHarness(cwd: string): { lock: Lock; harness: HarnessRef } {
  const lock = readLock(cwd);
  if (!lock || !lock.harness) {
    console.error(
      "Error: no harness installed. Run `agentic install <git-url|path>` first."
    );
    process.exit(1);
  }
  return { lock, harness: lock.harness };
}

export function hashFile(absPath: string): string {
  return hashContent(fs.readFileSync(absPath));
}

export function hashContent(content: string | Buffer): string {
  const h = crypto.createHash("sha256");
  h.update(content);
  return `sha256:${h.digest("hex")}`;
}

/** Deterministic JSON for hashing an MCP server entry. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}

export function hashJson(value: unknown): string {
  return hashContent(stableStringify(value));
}

function sortKeys(obj: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
