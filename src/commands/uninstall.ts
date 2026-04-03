import * as fs from "node:fs";
import * as path from "node:path";
import {
  requireAgenticDir,
  PLATFORMS,
  type PlatformId,
} from "../lib/platforms.js";
import { removeSymlink } from "../lib/symlink.js";
import { removePlatformEntries } from "../lib/gitignore.js";

export function uninstallCommand(cwd: string, platform: PlatformId): void {
  requireAgenticDir(cwd);

  const mapping = PLATFORMS[platform];

  // Rules: remove symlink
  removeSymlink(path.join(cwd, mapping.rules.target));
  console.log(`  Removed ${mapping.rules.target}`);

  // Skills: remove symlink
  removeSymlink(path.join(cwd, mapping.skills.target));
  console.log(`  Removed ${mapping.skills.target}`);

  // MCP
  const mcpTarget = path.join(cwd, mapping.mcp.target);
  switch (mapping.mcp.type) {
    case "symlink":
      removeSymlink(mcpTarget);
      console.log(`  Removed ${mapping.mcp.target}`);
      break;
    case "merge":
      // Remove mcpServers key from settings.json
      if (fs.existsSync(mcpTarget)) {
        const settings = JSON.parse(fs.readFileSync(mcpTarget, "utf-8"));
        delete settings.mcpServers;
        if (Object.keys(settings).length === 0) {
          fs.unlinkSync(mcpTarget);
        } else {
          fs.writeFileSync(mcpTarget, JSON.stringify(settings, null, 2) + "\n");
        }
        console.log(`  Removed MCP from ${mapping.mcp.target}`);
      }
      break;
    case "translate":
      if (fs.existsSync(mcpTarget)) {
        fs.unlinkSync(mcpTarget);
        console.log(`  Removed ${mapping.mcp.target}`);
      }
      break;
  }

  // Agents
  const agentsTarget = path.join(cwd, mapping.agents.target);
  switch (mapping.agents.type) {
    case "symlink":
      removeSymlink(agentsTarget);
      console.log(`  Removed ${mapping.agents.target}`);
      break;
    case "translate":
      // Remove generated .toml files
      if (fs.existsSync(agentsTarget)) {
        for (const file of fs.readdirSync(agentsTarget)) {
          if (file.endsWith(".toml")) {
            fs.unlinkSync(path.join(agentsTarget, file));
          }
        }
        removeIfEmpty(agentsTarget);
        console.log(`  Removed ${mapping.agents.target}`);
      }
      break;
  }

  // Gitignore
  removePlatformEntries(cwd, platform);

  // Clean up empty parent directories
  for (const dir of [".claude", ".gemini", ".codex", ".agents"]) {
    removeIfEmpty(path.join(cwd, dir));
  }

  console.log(`\nUninstalled ${platform}.`);
}

function removeIfEmpty(dir: string): void {
  try {
    const entries = fs.readdirSync(dir);
    if (entries.length === 0) {
      fs.rmdirSync(dir);
    }
  } catch {
    // directory doesn't exist, fine
  }
}
