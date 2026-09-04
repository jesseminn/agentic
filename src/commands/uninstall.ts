import * as fs from "node:fs";
import * as path from "node:path";
import { getAgenticDir } from "../lib/platforms.js";
import { requireHarness, writeLock, hashFile, hashJson } from "../lib/lock.js";
import { readMcpJson, writeMcpJson } from "../lib/translate.js";
import { linkPlatform } from "../lib/linker.js";
import { printLinkReport } from "./link.js";
import { pruneEmptyDirs } from "./update.js";
import { requireCurrentProtocol } from "../lib/migrate.js";

/**
 * Remove the harness from .agentic/: every lock-listed file and MCP key.
 * A harness file that was modified locally is kept and reported, never
 * deleted. Project-owned files and seeds are not touched. The lock stays,
 * with `harness: null`, so linked platforms remain recorded.
 */
export function uninstallCommand(cwd: string): void {
  requireCurrentProtocol(cwd);
  const { lock, harness } = requireHarness(cwd);
  const agenticDir = getAgenticDir(cwd);
  const removed: string[] = [];
  const kept: string[] = [];

  for (const [rel, lockHash] of Object.entries(lock.files)) {
    const p = path.join(agenticDir, rel);
    if (!fs.existsSync(p)) continue;
    if (hashFile(p) === lockHash) {
      fs.unlinkSync(p);
      pruneEmptyDirs(agenticDir, path.dirname(rel));
      removed.push(rel);
    } else {
      kept.push(`${rel} (modified locally)`);
    }
  }

  const mcpPath = path.join(agenticDir, ".mcp.json");
  const mcp = readMcpJson(mcpPath);
  for (const [key, lockHash] of Object.entries(lock.mcpServers)) {
    const entry = mcp.mcpServers[key];
    if (entry === undefined) continue;
    if (hashJson(entry) === lockHash) {
      delete mcp.mcpServers[key];
      removed.push(`.mcp.json#${key}`);
    } else {
      kept.push(`.mcp.json#${key} (modified locally)`);
    }
  }
  writeMcpJson(mcpPath, mcp);

  lock.harness = null;
  lock.files = {};
  lock.mcpServers = {};
  writeLock(cwd, lock);

  console.log(`Uninstalled ${harness.name}@${harness.version}`);
  console.log(`  removed: ${removed.length}`);
  if (kept.length) {
    console.log(`  kept (now project-owned):`);
    for (const k of kept) console.log(`    ${k}`);
  }

  for (const platform of lock.platforms) {
    printLinkReport(linkPlatform(cwd, platform));
  }
}
