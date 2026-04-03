import * as path from "node:path";
import {
  getAgenticDir,
  requireAgenticDir,
  getInstalledPlatforms,
  PLATFORMS,
} from "../lib/platforms.js";
import {
  readMcpJson,
  writeMcpJson,
  mcpJsonToToml,
  mergeGeminiSettings,
  type McpConfig,
} from "../lib/translate.js";
import * as fs from "node:fs";

export function mcpAddCommand(
  cwd: string,
  name: string,
  command: string,
  args: string[],
  env: Record<string, string>
): void {
  requireAgenticDir(cwd);

  const mcpPath = path.join(getAgenticDir(cwd), ".mcp.json");
  const config = readMcpJson(mcpPath);

  config.mcpServers[name] = {
    command,
    ...(args.length > 0 ? { args } : {}),
    ...(Object.keys(env).length > 0 ? { env } : {}),
  };

  writeMcpJson(mcpPath, config);
  console.log(`Added MCP server: ${name}`);

  propagateMcp(cwd, config);
}

export function mcpRemoveCommand(cwd: string, name: string): void {
  requireAgenticDir(cwd);

  const mcpPath = path.join(getAgenticDir(cwd), ".mcp.json");
  const config = readMcpJson(mcpPath);

  if (!(name in config.mcpServers)) {
    console.error(`Error: MCP server "${name}" not found.`);
    process.exit(1);
  }

  delete config.mcpServers[name];
  writeMcpJson(mcpPath, config);
  console.log(`Removed MCP server: ${name}`);

  propagateMcp(cwd, config);
}

export function mcpListCommand(cwd: string): void {
  requireAgenticDir(cwd);

  const mcpPath = path.join(getAgenticDir(cwd), ".mcp.json");
  const config = readMcpJson(mcpPath);
  const servers = Object.entries(config.mcpServers);

  if (servers.length === 0) {
    console.log("No MCP servers configured.");
    return;
  }

  for (const [name, entry] of servers) {
    const cmdStr = [entry.command, ...(entry.args ?? [])].join(" ");
    console.log(`  ${name}: ${cmdStr}`);
  }
}

/**
 * Propagate MCP config to all installed platforms.
 * Claude: no-op (symlinked).
 * Gemini: merge into settings.json.
 * Codex: translate to config.toml.
 */
function propagateMcp(cwd: string, config: McpConfig): void {
  const installed = getInstalledPlatforms(cwd);

  for (const platform of installed) {
    const mapping = PLATFORMS[platform];

    if (mapping.mcp.type === "merge") {
      const settingsPath = path.join(cwd, mapping.mcp.target);
      mergeGeminiSettings(settingsPath, config);
      console.log(`  → Updated ${mapping.mcp.target}`);
    }

    if (mapping.mcp.type === "translate") {
      const tomlPath = path.join(cwd, mapping.mcp.target);
      fs.mkdirSync(path.dirname(tomlPath), { recursive: true });
      fs.writeFileSync(tomlPath, mcpJsonToToml(config));
      console.log(`  → Updated ${mapping.mcp.target}`);
    }
  }
}
