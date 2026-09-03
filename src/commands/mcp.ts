import * as path from "node:path";
import { getAgenticDir, requireAgenticDir } from "../lib/platforms.js";
import { readMcpJson, writeMcpJson } from "../lib/translate.js";
import { readLock } from "../lib/lock.js";
import { findLiteralSecrets } from "../lib/harness.js";
import { linkMcp } from "../lib/linker.js";

export function mcpAddCommand(
  cwd: string,
  name: string,
  command: string,
  args: string[],
  env: Record<string, string>
): void {
  requireAgenticDir(cwd);
  const lock = readLock(cwd);

  const entry = {
    command,
    ...(args.length > 0 ? { args } : {}),
    ...(Object.keys(env).length > 0 ? { env } : {}),
  };

  const secrets = findLiteralSecrets({ mcpServers: { [name]: entry } });
  if (secrets.length > 0) {
    console.error("Error: .agentic/.mcp.json is committed — env values must be ${NAME} references, not literals:");
    for (const s of secrets) console.error(`  - ${s}`);
    console.error("Example: --env 'GITHUB_TOKEN=${GITHUB_TOKEN}'");
    process.exit(1);
  }

  if (lock?.mcpServers[name] !== undefined) {
    console.error(
      `Warning: "${name}" is harness-owned. The next \`agentic update\` will report this edit as a conflict.`
    );
  }

  const mcpPath = path.join(getAgenticDir(cwd), ".mcp.json");
  const config = readMcpJson(mcpPath);
  config.mcpServers[name] = entry;
  writeMcpJson(mcpPath, config);
  console.log(`Added MCP server: ${name}`);

  propagate(cwd);
}

export function mcpRemoveCommand(cwd: string, name: string): void {
  requireAgenticDir(cwd);
  const lock = readLock(cwd);

  const mcpPath = path.join(getAgenticDir(cwd), ".mcp.json");
  const config = readMcpJson(mcpPath);
  if (!(name in config.mcpServers)) {
    console.error(`Error: MCP server "${name}" not found.`);
    process.exit(1);
  }
  if (lock?.mcpServers[name] !== undefined) {
    console.error(
      `Warning: "${name}" is harness-owned. The next \`agentic update\` will report this as a conflict.`
    );
  }

  delete config.mcpServers[name];
  writeMcpJson(mcpPath, config);
  console.log(`Removed MCP server: ${name}`);

  propagate(cwd);
}

export function mcpListCommand(cwd: string): void {
  requireAgenticDir(cwd);
  const lock = readLock(cwd);
  const config = readMcpJson(path.join(getAgenticDir(cwd), ".mcp.json"));
  const servers = Object.entries(config.mcpServers);

  if (servers.length === 0) {
    console.log("No MCP servers configured.");
    return;
  }
  for (const [name, entry] of servers) {
    const cmd = [entry.command, ...(entry.args ?? [])].join(" ");
    const owner = lock?.mcpServers[name] !== undefined ? "harness" : "project";
    console.log(`  ${name}: ${cmd}  [${owner}]`);
  }
}

/** Re-derive the MCP part for every linked platform. */
function propagate(cwd: string): void {
  const lock = readLock(cwd);
  for (const platform of lock?.platforms ?? []) {
    const r = linkMcp(cwd, platform);
    for (const a of [...r.added, ...r.updated]) console.log(`  → ${a}`);
    for (const c of r.conflicts) console.log(`  ! ${c}`);
  }
}
