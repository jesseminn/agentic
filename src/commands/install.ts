import * as fs from "node:fs";
import * as path from "node:path";
import {
  requireAgenticDir,
  getAgenticDir,
  PLATFORMS,
  type PlatformId,
} from "../lib/platforms.js";
import { safeLink } from "../lib/symlink.js";
import { addPlatformEntries } from "../lib/gitignore.js";
import {
  readMcpJson,
  mcpJsonToToml,
  mergeGeminiSettings,
  agentMdToToml,
} from "../lib/translate.js";

export function installCommand(cwd: string, platform: PlatformId): void {
  requireAgenticDir(cwd);

  const agenticDir = getAgenticDir(cwd);
  const mapping = PLATFORMS[platform];

  // Rules: symlink
  safeLink(
    path.join(agenticDir, "RULES.md"),
    path.join(cwd, mapping.rules.target)
  );
  console.log(`  ${mapping.rules.target} → .agentic/RULES.md`);

  // Skills: symlink
  safeLink(
    path.join(agenticDir, "skills"),
    path.join(cwd, mapping.skills.target)
  );
  console.log(`  ${mapping.skills.target} → .agentic/skills/`);

  // MCP
  const mcpConfig = readMcpJson(path.join(agenticDir, ".mcp.json"));
  const mcpTarget = path.join(cwd, mapping.mcp.target);

  switch (mapping.mcp.type) {
    case "symlink":
      safeLink(path.join(agenticDir, ".mcp.json"), mcpTarget);
      console.log(`  ${mapping.mcp.target} → .agentic/.mcp.json`);
      break;
    case "merge":
      mergeGeminiSettings(mcpTarget, mcpConfig);
      console.log(`  Merged MCP into ${mapping.mcp.target}`);
      break;
    case "translate": {
      fs.mkdirSync(path.dirname(mcpTarget), { recursive: true });
      fs.writeFileSync(mcpTarget, mcpJsonToToml(mcpConfig));
      console.log(`  Translated MCP to ${mapping.mcp.target}`);
      break;
    }
  }

  // Agents
  const agentsTarget = path.join(cwd, mapping.agents.target);

  switch (mapping.agents.type) {
    case "symlink":
      safeLink(path.join(agenticDir, "agents"), agentsTarget);
      console.log(`  ${mapping.agents.target} → .agentic/agents/`);
      break;
    case "translate": {
      // Convert each .md agent to .toml
      const agentsSourceDir = path.join(agenticDir, "agents");
      fs.mkdirSync(agentsTarget, { recursive: true });
      if (fs.existsSync(agentsSourceDir)) {
        for (const file of fs.readdirSync(agentsSourceDir)) {
          if (!file.endsWith(".md")) continue;
          const mdContent = fs.readFileSync(
            path.join(agentsSourceDir, file),
            "utf-8"
          );
          const tomlName = file.replace(/\.md$/, ".toml");
          fs.writeFileSync(path.join(agentsTarget, tomlName), agentMdToToml(mdContent));
          console.log(`  Translated agents/${file} → ${mapping.agents.target}/${tomlName}`);
        }
      }
      break;
    }
  }

  // Gitignore
  addPlatformEntries(cwd, platform);

  console.log(`\nInstalled ${platform}.`);
}
