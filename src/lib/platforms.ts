import * as fs from "node:fs";
import * as path from "node:path";

export type PlatformId = "claude" | "gemini" | "codex";

export interface PlatformMapping {
  rules: { target: string };
  skills: { target: string };
  mcp: { type: "symlink" | "merge" | "translate"; target: string };
  agents: { type: "symlink" | "translate"; target: string };
  gitignoreHeader: string;
  gitignoreEntries: string[];
}

export const PLATFORMS: Record<PlatformId, PlatformMapping> = {
  claude: {
    rules: { target: "CLAUDE.md" },
    skills: { target: ".claude/skills" },
    mcp: { type: "symlink", target: ".mcp.json" },
    agents: { type: "symlink", target: ".claude/agents" },
    gitignoreHeader: "# Claude Code (derived from .agentic/)",
    gitignoreEntries: ["/CLAUDE.md", "/.mcp.json", ".claude/skills", ".claude/agents", ".claude/settings.local.json"],
  },
  gemini: {
    rules: { target: "GEMINI.md" },
    skills: { target: ".gemini/skills" },
    mcp: { type: "merge", target: ".gemini/settings.json" },
    agents: { type: "symlink", target: ".gemini/agents" },
    gitignoreHeader: "# Gemini CLI (derived from .agentic/)",
    gitignoreEntries: ["/GEMINI.md", ".gemini/skills", ".gemini/agents", ".gemini/settings.json"],
  },
  codex: {
    rules: { target: "AGENTS.md" },
    skills: { target: ".agents/skills" },
    mcp: { type: "translate", target: ".codex/config.toml" },
    agents: { type: "translate", target: ".codex/agents" },
    gitignoreHeader: "# Codex CLI (derived from .agentic/)",
    gitignoreEntries: ["/AGENTS.md", ".codex/config.toml", ".codex/agents/", ".agents/skills"],
  },
};

export const AGENTIC_DIR = ".agentic";

export function getAgenticDir(cwd: string): string {
  return path.join(cwd, AGENTIC_DIR);
}

export function requireAgenticDir(cwd: string): void {
  const dir = getAgenticDir(cwd);
  if (!fs.existsSync(dir)) {
    console.error(
      `Error: ${AGENTIC_DIR}/ not found. Run \`agentic init\` first.`
    );
    process.exit(1);
  }
}

export function getInstalledPlatforms(cwd: string): PlatformId[] {
  const installed: PlatformId[] = [];
  for (const [id, mapping] of Object.entries(PLATFORMS)) {
    const rulesPath = path.join(cwd, mapping.rules.target);
    if (fs.existsSync(rulesPath)) {
      installed.push(id as PlatformId);
    }
  }
  return installed;
}
