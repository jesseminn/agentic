import * as fs from "node:fs";
import * as path from "node:path";
import { AGENTIC_DIR, PLATFORM_IDS, getAgenticDir } from "../lib/platforms.js";
import {
  resolveHarness,
  listOwnedFiles,
  listSeedFiles,
  readHarnessMcp,
} from "../lib/harness.js";
import { readLock, writeLock, emptyLock, hashFile, hashJson } from "../lib/lock.js";
import { readMcpJson, writeMcpJson } from "../lib/translate.js";
import { linkPlatform } from "../lib/linker.js";
import { printLinkReport } from "./link.js";
import { PROJECT_STUB } from "./init.js";

/**
 * Seed a harness into .agentic/. Nothing is overwritten: a local path that
 * already exists with different content is a conflict and aborts the install.
 * Identical content is adopted silently (v0.2 migration).
 */
export function installCommand(cwd: string, spec: string): void {
  const existing = readLock(cwd);
  if (existing?.harness) {
    console.error(
      `Error: harness ${existing.harness.name}@${existing.harness.version} is already installed. Use \`agentic update\`.`
    );
    process.exit(1);
  }

  const resolved = tryResolve(spec, cwd);
  try {
    const agenticDir = getAgenticDir(cwd);
    fs.mkdirSync(agenticDir, { recursive: true });

    // --- plan ---
    const owned = listOwnedFiles(resolved.dir);
    const conflicts: string[] = [];
    const adopted: string[] = [];
    const files: Record<string, string> = {};

    for (const rel of owned) {
      const src = path.join(resolved.dir, rel);
      const local = path.join(agenticDir, rel);
      const upHash = hashFile(src);
      files[rel] = upHash;
      if (!fs.existsSync(local)) continue;
      if (hashFile(local) === upHash) adopted.push(rel);
      else conflicts.push(rel);
    }

    const mcpPath = path.join(agenticDir, ".mcp.json");
    const localMcp = readMcpJson(mcpPath);
    const harnessMcp = readHarnessMcp(resolved.dir);
    const mcpServers: Record<string, string> = {};
    for (const [key, entry] of Object.entries(harnessMcp.mcpServers)) {
      const upHash = hashJson(entry);
      mcpServers[key] = upHash;
      const local = localMcp.mcpServers[key];
      if (local === undefined) continue;
      if (hashJson(local) === upHash) adopted.push(`.mcp.json#${key}`);
      else conflicts.push(`.mcp.json#${key}`);
    }

    if (conflicts.length > 0) {
      console.error(`Error: ${AGENTIC_DIR}/ already has content that differs from the harness:`);
      for (const c of conflicts) console.error(`  - ${c}`);
      console.error(
        "\nNothing was written. Move project-specific content into PROJECT.md / project/ (or unprefixed skills), remove the rest, and retry."
      );
      process.exit(1);
    }

    // --- apply ---
    for (const rel of owned) {
      const dest = path.join(agenticDir, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(resolved.dir, rel), dest);
    }

    const seeded: string[] = [];
    for (const rel of listSeedFiles(resolved.dir)) {
      const dest = path.join(agenticDir, rel);
      if (fs.existsSync(dest)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(path.join(resolved.dir, rel), dest);
      seeded.push(rel);
    }
    if (!fs.existsSync(path.join(agenticDir, "PROJECT.md"))) {
      fs.writeFileSync(path.join(agenticDir, "PROJECT.md"), PROJECT_STUB);
      seeded.push("PROJECT.md (empty stub)");
    }

    for (const [key, entry] of Object.entries(harnessMcp.mcpServers)) {
      localMcp.mcpServers[key] = entry;
    }
    writeMcpJson(mcpPath, localMcp);

    const lock = existing ?? emptyLock();
    lock.harness = {
      name: resolved.meta.name,
      version: resolved.meta.version,
      source: resolved.source,
      ref: resolved.ref,
      commit: resolved.commit,
      installedAt: today(),
    };
    lock.files = files;
    lock.mcpServers = mcpServers;
    writeLock(cwd, lock);

    // --- report ---
    console.log(
      `Installed ${resolved.meta.name}@${resolved.meta.version}${resolved.commit ? ` (${resolved.commit.slice(0, 7)})` : ""} into ${AGENTIC_DIR}/`
    );
    console.log(`  ${owned.length} harness files${adopted.length ? ` (${adopted.length} already present, adopted)` : ""}`);
    if (Object.keys(mcpServers).length) console.log(`  ${Object.keys(mcpServers).length} MCP servers`);
    if (seeded.length) console.log(`  seeded: ${seeded.join(", ")}`);

    for (const platform of lock.platforms) {
      printLinkReport(linkPlatform(cwd, platform));
    }
    if (lock.platforms.length === 0) {
      console.log(`\nNext: \`agentic link <${PLATFORM_IDS.join("|")}>\``);
    }
  } finally {
    resolved.cleanup();
  }
}

export function tryResolve(spec: string, cwd: string) {
  try {
    return resolveHarness(spec, cwd);
  } catch (e) {
    console.error(`Error: ${(e as Error).message}`);
    process.exit(1);
  }
}

export function today(): string {
  return new Date().toISOString().slice(0, 10);
}
