import * as fs from "node:fs";
import * as path from "node:path";
import {
  AGENTIC_DIR,
  getAgenticDir,
  requireAgenticDir,
  getInstalledPlatforms,
  PLATFORMS,
  type PlatformId,
} from "../lib/platforms.js";
import { isSymlinkTo } from "../lib/symlink.js";
import { readMcpJson } from "../lib/translate.js";

export function statusCommand(cwd: string): void {
  requireAgenticDir(cwd);

  const agenticDir = getAgenticDir(cwd);
  const installed = getInstalledPlatforms(cwd);

  // Installed platforms
  console.log("Installed platforms:");
  if (installed.length === 0) {
    console.log("  (none)");
  } else {
    for (const id of installed) {
      const health = checkHealth(cwd, id);
      console.log(`  ${id}: ${health}`);
    }
  }

  // MCP servers
  const mcpConfig = readMcpJson(path.join(agenticDir, ".mcp.json"));
  const serverNames = Object.keys(mcpConfig.mcpServers);
  console.log(`\nMCP servers: ${serverNames.length}`);
  for (const name of serverNames) {
    console.log(`  ${name}`);
  }

  // Skills
  const skillsDir = path.join(agenticDir, "skills");
  const skills = listSubdirs(skillsDir);
  console.log(`\nSkills: ${skills.length}`);
  for (const skill of skills) {
    console.log(`  ${skill}`);
  }

  // Agents
  const agentsDir = path.join(agenticDir, "agents");
  const agents = listFiles(agentsDir);
  console.log(`\nAgents: ${agents.length}`);
  for (const agent of agents) {
    console.log(`  ${agent}`);
  }
}

function checkHealth(cwd: string, platform: PlatformId): string {
  const mapping = PLATFORMS[platform];
  const agenticDir = getAgenticDir(cwd);
  const issues: string[] = [];

  // Check rules symlink
  const rulesLink = path.join(cwd, mapping.rules.target);
  const rulesTarget = path.join(agenticDir, "RULES.md");
  if (!isSymlinkTo(rulesLink, rulesTarget)) {
    issues.push(mapping.rules.target);
  }

  // Check skills symlink
  const skillsLink = path.join(cwd, mapping.skills.target);
  const skillsTarget = path.join(agenticDir, "skills");
  if (!isSymlinkTo(skillsLink, skillsTarget)) {
    issues.push(mapping.skills.target);
  }

  // Check agents (only symlink types)
  if (mapping.agents.type === "symlink") {
    const agentsLink = path.join(cwd, mapping.agents.target);
    const agentsTarget = path.join(agenticDir, "agents");
    if (!isSymlinkTo(agentsLink, agentsTarget)) {
      issues.push(mapping.agents.target);
    }
  }

  // Check MCP (only symlink type)
  if (mapping.mcp.type === "symlink") {
    const mcpLink = path.join(cwd, mapping.mcp.target);
    const mcpTarget = path.join(agenticDir, ".mcp.json");
    if (!isSymlinkTo(mcpLink, mcpTarget)) {
      issues.push(mapping.mcp.target);
    }
  }

  if (issues.length === 0) return "ok";
  return `broken symlinks: ${issues.join(", ")}`;
}

function listSubdirs(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
}

function listFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => d.name);
}
