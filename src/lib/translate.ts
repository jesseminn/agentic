import * as fs from "node:fs";
import * as TOML from "smol-toml";
import matter from "gray-matter";

// --- Types ---

export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

export interface McpServerEntry {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  [key: string]: unknown;
}

// --- MCP: JSON → Codex TOML ---

export function mcpJsonToToml(mcpJson: McpConfig): string {
  const tomlObj: Record<string, unknown> = { mcp_servers: {} };
  const servers = tomlObj.mcp_servers as Record<string, unknown>;

  for (const [name, entry] of Object.entries(mcpJson.mcpServers)) {
    const server: Record<string, unknown> = { command: entry.command };
    if (entry.args) server.args = entry.args;
    if (entry.env) server.env = entry.env;
    servers[name] = server;
  }

  return TOML.stringify(tomlObj);
}

// --- MCP: Codex TOML → JSON ---

export function mcpTomlToJson(tomlContent: string): McpConfig {
  const parsed = TOML.parse(tomlContent);
  const mcpServers: Record<string, McpServerEntry> = {};
  const servers = (parsed.mcp_servers ?? {}) as Record<
    string,
    Record<string, unknown>
  >;

  for (const [name, entry] of Object.entries(servers)) {
    mcpServers[name] = {
      command: entry.command as string,
      ...(entry.args ? { args: entry.args as string[] } : {}),
      ...(entry.env ? { env: entry.env as Record<string, string> } : {}),
    };
  }

  return { mcpServers };
}

// --- Agents: MD → Codex TOML ---

export function agentMdToToml(mdContent: string): string {
  const { data, content } = matter(mdContent);
  const tomlObj: Record<string, unknown> = {
    name: data.name ?? "",
    description: data.description ?? "",
    developer_instructions: content.trim(),
  };
  return TOML.stringify(tomlObj);
}

// --- Agents: Codex TOML → MD ---

export function agentTomlToMd(tomlContent: string): string {
  const parsed = TOML.parse(tomlContent);
  const frontmatter: Record<string, string> = {};
  if (parsed.name) frontmatter.name = parsed.name as string;
  if (parsed.description)
    frontmatter.description = parsed.description as string;
  const body = (parsed.developer_instructions as string) ?? "";
  return matter.stringify(body.trim() + "\n", frontmatter);
}

// --- Gemini: merge MCP into settings.json ---

export function mergeGeminiSettings(
  settingsPath: string,
  mcpJson: McpConfig
): void {
  let settings: Record<string, unknown> = {};
  if (fs.existsSync(settingsPath)) {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  }
  settings.mcpServers = mcpJson.mcpServers;
  const dir = settingsPath.substring(0, settingsPath.lastIndexOf("/"));
  if (dir) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + "\n");
}

// --- Gemini: extract MCP from settings.json ---

export function extractGeminiMcp(settingsPath: string): McpConfig {
  if (!fs.existsSync(settingsPath)) {
    return { mcpServers: {} };
  }
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  return {
    mcpServers: (settings.mcpServers as Record<string, McpServerEntry>) ?? {},
  };
}

// --- Helpers for reading/writing MCP JSON ---

export function readMcpJson(mcpJsonPath: string): McpConfig {
  if (!fs.existsSync(mcpJsonPath)) {
    return { mcpServers: {} };
  }
  return JSON.parse(fs.readFileSync(mcpJsonPath, "utf-8"));
}

export function writeMcpJson(mcpJsonPath: string, config: McpConfig): void {
  fs.writeFileSync(mcpJsonPath, JSON.stringify(config, null, 2) + "\n");
}
