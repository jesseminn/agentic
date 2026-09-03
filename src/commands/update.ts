import * as fs from "node:fs";
import * as path from "node:path";
import { getAgenticDir } from "../lib/platforms.js";
import { listOwnedFiles, readHarnessMcp, OWNED_DIRS } from "../lib/harness.js";
import { requireHarness, writeLock, hashFile, hashJson } from "../lib/lock.js";
import { readMcpJson, writeMcpJson } from "../lib/translate.js";
import { linkPlatform, removeIfEmpty } from "../lib/linker.js";
import { printLinkReport } from "./link.js";
import { tryResolve } from "./install.js";

interface Plan {
  overwrite: string[];
  add: string[];
  delete: string[];
  adopt: string[];
  conflicts: { path: string; reason: string; forced: string }[];
}

const MCP_PREFIX = ".mcp.json#";

/**
 * Pull the harness and reconcile against the lock. See docs/design-v1.md §6.
 *
 *   upstream | lock | local          → action
 *   yes      | yes  | equals lock    → overwrite
 *   yes      | yes  | differs        → conflict (hand-edited)
 *   yes      | no   | exists         → conflict (project file at new path)
 *   yes      | no   | absent         → add
 *   no       | yes  | equals lock    → delete
 *   no       | yes  | differs        → conflict (hand-edited, removed upstream)
 */
export function updateCommand(
  cwd: string,
  spec: string | undefined,
  opts: { force: boolean }
): void {
  const { lock, harness } = requireHarness(cwd);
  const resolvedSpec = spec ?? (harness.ref ? `${harness.source}#${harness.ref}` : harness.source);
  const resolved = tryResolve(resolvedSpec, cwd);

  try {
    const agenticDir = getAgenticDir(cwd);
    const plan: Plan = { overwrite: [], add: [], delete: [], adopt: [], conflicts: [] };
    const nextFiles: Record<string, string> = {};

    // --- files ---
    const upstream = new Map<string, string>();
    for (const rel of listOwnedFiles(resolved.dir)) {
      upstream.set(rel, hashFile(path.join(resolved.dir, rel)));
    }

    for (const [rel, upHash] of upstream) {
      const local = path.join(agenticDir, rel);
      const lockHash = lock.files[rel];
      const exists = fs.existsSync(local);
      const localHash = exists ? hashFile(local) : null;

      if (lockHash !== undefined) {
        if (localHash === lockHash || localHash === upHash) {
          if (localHash !== upHash) plan.overwrite.push(rel);
          nextFiles[rel] = upHash;
        } else {
          plan.conflicts.push({
            path: rel,
            reason: exists ? "modified locally" : "deleted locally",
            forced: "overwrite",
          });
          nextFiles[rel] = opts.force ? upHash : lockHash;
        }
      } else if (exists) {
        if (localHash === upHash) {
          plan.adopt.push(rel);
          nextFiles[rel] = upHash;
        } else {
          plan.conflicts.push({
            path: rel,
            reason: "project file at a path the harness now owns",
            forced: "overwrite",
          });
          if (opts.force) nextFiles[rel] = upHash;
        }
      } else {
        plan.add.push(rel);
        nextFiles[rel] = upHash;
      }
    }

    for (const [rel, lockHash] of Object.entries(lock.files)) {
      if (upstream.has(rel)) continue;
      const local = path.join(agenticDir, rel);
      if (!fs.existsSync(local)) continue; // already gone; drop from lock
      if (hashFile(local) === lockHash) {
        plan.delete.push(rel);
      } else {
        plan.conflicts.push({
          path: rel,
          reason: "modified locally, removed upstream",
          forced: "delete",
        });
        if (!opts.force) nextFiles[rel] = lockHash;
      }
    }

    // --- MCP keys (same table, per server entry) ---
    const mcpPath = path.join(agenticDir, ".mcp.json");
    const localMcp = readMcpJson(mcpPath);
    const upMcp = readHarnessMcp(resolved.dir).mcpServers;
    const nextMcp: Record<string, string> = {};
    const mcpWrites: Array<() => void> = [];

    for (const [key, entry] of Object.entries(upMcp)) {
      const upHash = hashJson(entry);
      const lockHash = lock.mcpServers[key];
      const local = localMcp.mcpServers[key];
      const localHash = local === undefined ? null : hashJson(local);
      const label = `${MCP_PREFIX}${key}`;
      const take = () => mcpWrites.push(() => (localMcp.mcpServers[key] = entry));

      if (lockHash !== undefined) {
        if (localHash === lockHash || localHash === upHash) {
          if (localHash !== upHash) {
            plan.overwrite.push(label);
            take();
          }
          nextMcp[key] = upHash;
        } else {
          plan.conflicts.push({
            path: label,
            reason: local === undefined ? "deleted locally" : "modified locally",
            forced: "overwrite",
          });
          if (opts.force) {
            take();
            nextMcp[key] = upHash;
          } else {
            nextMcp[key] = lockHash;
          }
        }
      } else if (local !== undefined) {
        if (localHash === upHash) {
          plan.adopt.push(label);
          nextMcp[key] = upHash;
        } else {
          plan.conflicts.push({
            path: label,
            reason: "project entry at a key the harness now owns",
            forced: "overwrite",
          });
          if (opts.force) {
            take();
            nextMcp[key] = upHash;
          }
        }
      } else {
        plan.add.push(label);
        take();
        nextMcp[key] = upHash;
      }
    }

    for (const [key, lockHash] of Object.entries(lock.mcpServers)) {
      if (key in upMcp) continue;
      const local = localMcp.mcpServers[key];
      if (local === undefined) continue;
      const label = `${MCP_PREFIX}${key}`;
      if (hashJson(local) === lockHash) {
        plan.delete.push(label);
        mcpWrites.push(() => delete localMcp.mcpServers[key]);
      } else {
        plan.conflicts.push({ path: label, reason: "modified locally, removed upstream", forced: "delete" });
        if (opts.force) mcpWrites.push(() => delete localMcp.mcpServers[key]);
        else nextMcp[key] = lockHash;
      }
    }

    // --- apply ---
    const isMcp = (p: string) => p.startsWith(MCP_PREFIX);
    const copy = (rel: string) => {
      const dest = path.join(agenticDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(resolved.dir, rel), dest);
    };
    const remove = (rel: string) => {
      const p = path.join(agenticDir, rel);
      if (fs.existsSync(p)) fs.unlinkSync(p);
      pruneEmptyDirs(agenticDir, path.dirname(rel));
    };
    for (const rel of [...plan.overwrite, ...plan.add]) if (!isMcp(rel)) copy(rel);
    for (const rel of plan.delete) if (!isMcp(rel)) remove(rel);
    if (opts.force) {
      for (const c of plan.conflicts) {
        if (isMcp(c.path)) continue;
        if (c.forced === "overwrite") copy(c.path);
        else remove(c.path);
      }
    }
    for (const w of mcpWrites) w();
    writeMcpJson(mcpPath, localMcp);

    lock.harness = {
      name: resolved.meta.name,
      version: resolved.meta.version,
      source: resolved.source,
      ref: resolved.ref,
      commit: resolved.commit,
      installedAt: harness.installedAt,
    };
    lock.files = nextFiles;
    lock.mcpServers = nextMcp;
    writeLock(cwd, lock);

    // --- report ---
    const label = (name: string, version: string, commit: string | null) =>
      `${name}@${version}${commit ? ` (${commit.slice(0, 7)})` : ""}`;
    console.log(
      `Updated ${label(harness.name, harness.version, harness.commit)} → ${label(resolved.meta.name, resolved.meta.version, resolved.commit)}`
    );
    printList("  added", plan.add);
    printList("  updated", plan.overwrite);
    printList("  removed", plan.delete);
    printList("  adopted (identical content already present)", plan.adopt);
    const quiet = plan.add.length + plan.overwrite.length + plan.delete.length + plan.adopt.length === 0;
    if (quiet && plan.conflicts.length === 0) console.log("  already up to date");

    for (const platform of lock.platforms) {
      printLinkReport(linkPlatform(cwd, platform));
    }

    if (plan.conflicts.length > 0) {
      const n = plan.conflicts.length;
      console.log(
        opts.force ? `\nForced ${n} conflict${n === 1 ? "" : "s"}:` : `\n${n} conflict${n === 1 ? "" : "s"} skipped:`
      );
      for (const c of plan.conflicts) {
        console.log(`  - ${c.path}: ${c.reason}${opts.force ? ` → ${c.forced}d` : ""}`);
      }
      if (!opts.force) {
        console.log(
          "\nResolve each one — keep the local edit (move it to PROJECT.md/project/ or an unprefixed skill), revert it, or open a PR against the harness — then re-run. `--force` takes the upstream side."
        );
        process.exit(1);
      }
    }
  } finally {
    resolved.cleanup();
  }
}

function printList(label: string, items: string[]): void {
  if (items.length === 0) return;
  console.log(`${label}: ${items.length}`);
  for (const i of items) console.log(`    ${i}`);
}

/** Remove now-empty directories below .agentic/, stopping at a standard top-level dir. */
export function pruneEmptyDirs(agenticDir: string, rel: string): void {
  let cur = rel;
  while (cur && cur !== ".") {
    if ((OWNED_DIRS as readonly string[]).includes(cur)) break;
    removeIfEmpty(path.join(agenticDir, cur));
    cur = path.dirname(cur);
  }
}
