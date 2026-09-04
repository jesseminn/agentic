import * as fs from "node:fs";
import * as path from "node:path";

export type PlatformId = "claude" | "antigravity" | "codex";
export const PLATFORM_IDS: readonly PlatformId[] = ["claude", "antigravity", "codex"];

export function isPlatformId(s: string): s is PlatformId {
  return (PLATFORM_IDS as readonly string[]).includes(s);
}

export interface PlatformMapping {
  /** Platform config directory, e.g. `.claude`. */
  configDir: string;
  /** Root rules file at the project root, e.g. `CLAUDE.md`. Always generated. */
  rulesRoot: string;
  /** `import` — root file holds `@path` lines; `concat` — root file inlines content. */
  rulesRootMode: "import" | "concat";
  /** Prefix for an import line. */
  importPrefix: string;
  /**
   * Where v1.0 linked rules/ and project/ files one by one. Rules now load
   * through the root file only; `link` and `unlink` prune any link into
   * .agentic/ still found here and leave real files alone.
   */
  legacyRulesDir?: string;
  /** Per-directory skill links go here. */
  skillsDir: string;
  /**
   * `link` — `<dir>/<name>.md` symlinks; `link-dir` — `<dir>/<name>/agent.md`
   * symlinks; `translate` — generated TOML.
   */
  agentsDir: string;
  agentsMode: "link" | "link-dir" | "translate";
  /**
   * `symlink` — link the file; `merge` — write the `mcpServers` key into a
   * JSON file, preserving other keys; `translate` — generated TOML.
   */
  mcp: {
    type: "symlink" | "merge" | "translate";
    target: string;
    /** Key dialect for remote servers; Antigravity wants `serverUrl`, not `type`+`url`. */
    dialect?: "antigravity";
  };
  gitignoreHeader: string;
  gitignoreEntries: string[];
}

export const PLATFORMS: Record<PlatformId, PlatformMapping> = {
  claude: {
    configDir: ".claude",
    rulesRoot: "CLAUDE.md",
    rulesRootMode: "import",
    importPrefix: "@",
    legacyRulesDir: ".claude/rules",
    skillsDir: ".claude/skills",
    agentsDir: ".claude/agents",
    agentsMode: "link",
    mcp: { type: "symlink", target: ".mcp.json" },
    gitignoreHeader: "# Claude Code (derived from .agentic/)",
    gitignoreEntries: [".claude/settings.local.json", ".claude/worktrees/"],
  },
  // Antigravity CLI (`agy`, successor to Gemini CLI). Reads AGENTS.md and
  // .agents/skills like Codex, so the two platforms share those files. It
  // follows no `@` import from AGENTS.md and does not load .agents/rules/
  // (tested 2026-09-03, print mode), so the rules are inlined.
  antigravity: {
    configDir: ".agents",
    rulesRoot: "AGENTS.md",
    rulesRootMode: "concat",
    importPrefix: "@",
    skillsDir: ".agents/skills",
    agentsDir: ".agents/agents",
    agentsMode: "link-dir",
    mcp: { type: "merge", target: ".agents/mcp_config.json", dialect: "antigravity" },
    gitignoreHeader: "# Antigravity CLI (derived from .agentic/)",
    gitignoreEntries: [],
  },
  codex: {
    configDir: ".codex",
    rulesRoot: "AGENTS.md",
    rulesRootMode: "concat",
    importPrefix: "@",
    skillsDir: ".agents/skills",
    agentsDir: ".codex/agents",
    agentsMode: "translate",
    mcp: { type: "translate", target: ".codex/config.toml" },
    gitignoreHeader: "# Codex CLI (derived from .agentic/)",
    gitignoreEntries: [],
  },
};

export const AGENTIC_DIR = ".agentic";

export function getAgenticDir(cwd: string): string {
  return path.join(cwd, AGENTIC_DIR);
}

export function requireAgenticDir(cwd: string): void {
  if (!fs.existsSync(getAgenticDir(cwd))) {
    console.error(
      `Error: ${AGENTIC_DIR}/ not found. Run \`agentic install <harness>\` or \`agentic init\` first.`
    );
    process.exit(1);
  }
}

/**
 * Paths under `cwd` that `link` would create for a platform — used so
 * `unlink` never removes a file another linked platform still needs.
 */
export function platformPaths(platform: PlatformId): string[] {
  const m = PLATFORMS[platform];
  return [m.rulesRoot, m.skillsDir, m.agentsDir, m.mcp.target];
}
