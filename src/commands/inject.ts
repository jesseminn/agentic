import * as fs from "node:fs";
import * as path from "node:path";
import * as readline from "node:readline";
import {
  requireAgenticDir,
  getAgenticDir,
  type PlatformId,
} from "../lib/platforms.js";
import {
  mcpTomlToJson,
  extractGeminiMcp,
  writeMcpJson,
  agentTomlToMd,
} from "../lib/translate.js";

export async function injectCommand(
  cwd: string,
  platform: PlatformId
): Promise<void> {
  requireAgenticDir(cwd);

  const agenticDir = getAgenticDir(cwd);

  // Check for existing configs and confirm overwrite
  if (hasExistingConfigs(agenticDir)) {
    const confirmed = await confirm(
      "Existing configs found in .agentic/. Overwrite?"
    );
    if (!confirmed) {
      console.log("Aborted.");
      return;
    }
  }

  switch (platform) {
    case "claude":
      injectClaude(cwd, agenticDir);
      break;
    case "gemini":
      injectGemini(cwd, agenticDir);
      break;
    case "codex":
      injectCodex(cwd, agenticDir);
      break;
  }

  console.log(
    `\nImported ${platform} configs into .agentic/. Run \`agentic install ${platform}\` to replace originals with symlinks.`
  );
}

function injectClaude(cwd: string, agenticDir: string): void {
  copyIfExists(
    path.join(cwd, "CLAUDE.md"),
    path.join(agenticDir, "RULES.md")
  );
  copyIfExists(
    path.join(cwd, ".mcp.json"),
    path.join(agenticDir, ".mcp.json")
  );
  copyDirIfExists(
    path.join(cwd, ".claude/skills"),
    path.join(agenticDir, "skills")
  );
  copyDirIfExists(
    path.join(cwd, ".claude/agents"),
    path.join(agenticDir, "agents")
  );
}

function injectGemini(cwd: string, agenticDir: string): void {
  copyIfExists(
    path.join(cwd, "GEMINI.md"),
    path.join(agenticDir, "RULES.md")
  );
  // Extract MCP from settings.json
  const settingsPath = path.join(cwd, ".gemini/settings.json");
  const mcpConfig = extractGeminiMcp(settingsPath);
  if (Object.keys(mcpConfig.mcpServers).length > 0) {
    writeMcpJson(path.join(agenticDir, ".mcp.json"), mcpConfig);
    console.log(`  .gemini/settings.json#mcpServers → .agentic/.mcp.json`);
  }
  copyDirIfExists(
    path.join(cwd, ".gemini/skills"),
    path.join(agenticDir, "skills")
  );
  copyDirIfExists(
    path.join(cwd, ".gemini/agents"),
    path.join(agenticDir, "agents")
  );
}

function injectCodex(cwd: string, agenticDir: string): void {
  copyIfExists(
    path.join(cwd, "AGENTS.md"),
    path.join(agenticDir, "RULES.md")
  );
  // Translate MCP from config.toml
  const tomlPath = path.join(cwd, ".codex/config.toml");
  if (fs.existsSync(tomlPath)) {
    const mcpConfig = mcpTomlToJson(fs.readFileSync(tomlPath, "utf-8"));
    if (Object.keys(mcpConfig.mcpServers).length > 0) {
      writeMcpJson(path.join(agenticDir, ".mcp.json"), mcpConfig);
      console.log(`  .codex/config.toml → .agentic/.mcp.json`);
    }
  }
  copyDirIfExists(
    path.join(cwd, ".agents/skills"),
    path.join(agenticDir, "skills")
  );
  // Translate agent .toml files to .md
  const codexAgentsDir = path.join(cwd, ".codex/agents");
  if (fs.existsSync(codexAgentsDir)) {
    const agenticAgentsDir = path.join(agenticDir, "agents");
    fs.mkdirSync(agenticAgentsDir, { recursive: true });
    for (const file of fs.readdirSync(codexAgentsDir)) {
      if (!file.endsWith(".toml")) continue;
      const tomlContent = fs.readFileSync(
        path.join(codexAgentsDir, file),
        "utf-8"
      );
      const mdName = file.replace(/\.toml$/, ".md");
      fs.writeFileSync(
        path.join(agenticAgentsDir, mdName),
        agentTomlToMd(tomlContent)
      );
      console.log(`  .codex/agents/${file} → .agentic/agents/${mdName}`);
    }
  }
}

function hasExistingConfigs(agenticDir: string): boolean {
  const rulesPath = path.join(agenticDir, "RULES.md");
  if (fs.existsSync(rulesPath)) {
    const content = fs.readFileSync(rulesPath, "utf-8").trim();
    if (content.length > 0) return true;
  }
  const mcpPath = path.join(agenticDir, ".mcp.json");
  if (fs.existsSync(mcpPath)) {
    const config = JSON.parse(fs.readFileSync(mcpPath, "utf-8"));
    if (Object.keys(config.mcpServers ?? {}).length > 0) return true;
  }
  const skillsDir = path.join(agenticDir, "skills");
  if (fs.existsSync(skillsDir) && fs.readdirSync(skillsDir).length > 0)
    return true;
  const agentsDir = path.join(agenticDir, "agents");
  if (fs.existsSync(agentsDir) && fs.readdirSync(agentsDir).length > 0)
    return true;
  return false;
}

function copyIfExists(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.copyFileSync(src, dest);
  console.log(`  ${path.basename(src)} → ${path.relative(process.cwd(), dest)}`);
}

function copyDirIfExists(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  fs.cpSync(src, dest, { recursive: true });
  console.log(`  ${path.relative(process.cwd(), src)} → ${path.relative(process.cwd(), dest)}`);
}

function confirm(message: string): Promise<boolean> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(`${message} (y/N) `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y");
    });
  });
}
