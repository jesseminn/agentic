# agentic

A CLI tool that manages a cross-platform `.agentic/` directory as the single source of truth for AI agent configuration. Write rules, skills, MCP config, and subagents once — derive platform-specific configs for Claude Code, Gemini CLI, and Codex CLI.

## Commands

### `agentic init`

Create a bare `.agentic/` in the current workspace:

```
.agentic/
├── AGENTIC.md        # bundled template, updated via `agentic update`
├── RULES.md          # references AGENTIC.md, user adds rules here
├── .mcp.json         # { "mcpServers": {} }
├── skills/           # empty dir
├── agents/           # empty dir
└── .gitignore        # temp/, node_modules/
```

### `agentic install <claude|gemini|codex>`

Derive platform-specific configs from `.agentic/`:

| Source (in `.agentic/`) | Claude Code | Gemini CLI | Codex CLI |
|--------|------------|------------|-----------|
| `RULES.md` | create symlink `CLAUDE.md` | create symlink `GEMINI.md` | create symlink `AGENTS.md` |
| `skills/` | create symlink `.claude/skills` | create symlink `.gemini/skills` | create symlink `.agents/skills` |
| `.mcp.json` | create symlink `.mcp.json` | merge into `.gemini/settings.json#mcpServers` | translate to `.codex/config.toml` |
| `agents/` | create symlink `.claude/agents` | create symlink `.gemini/agents` | translate to `.codex/agents/*.toml` |

Also adds platform entries to root `.gitignore` (grouped under a comment header per platform).

Codex uses `.agents/skills/` (the agent skills standard from agentskills.io). Gemini uses `.gemini/skills/`.

### `agentic mcp add <name> <command> [args...] [--env KEY=VALUE...]`

Add an MCP server to `.agentic/.mcp.json` and propagate to all installed platforms:
- Write to `.agentic/.mcp.json`
- For Claude: symlink handles it automatically
- For Gemini: re-merge into `.gemini/settings.json#mcpServers`
- For Codex: re-translate to `.codex/config.toml`

Examples:
- `agentic mcp add browsermcp npx @browsermcp/mcp@latest`
- `agentic mcp add github npx @anthropic/mcp-github --env GITHUB_TOKEN=xxx`

### `agentic mcp remove <name>`

Remove an MCP server from `.agentic/.mcp.json` and propagate to all installed platforms:
- For Claude: symlink handles it automatically
- For Gemini: re-merge into `.gemini/settings.json#mcpServers` (remove the key)
- For Codex: re-translate to `.codex/config.toml` (remove the section)

### `agentic mcp list`

List configured MCP servers from `.agentic/.mcp.json`.

### `agentic uninstall <platform>`

Remove derived configs for a platform:
- Remove symlinks (not targets)
- Remove generated files (Gemini settings.json MCP keys, Codex config.toml, Codex agents/*.toml)
- Remove platform entries from `.gitignore` (keep entries still needed by other installed platforms)
- Clean up empty parent directories (`.claude/`, `.gemini/`, `.codex/`, `.agents/`)

### `agentic inject <claude|gemini|codex>`

Import existing platform configs into `.agentic/`:

**Claude:** `agentic inject claude`
- `CLAUDE.md` copy to `.agentic/RULES.md`
- `.mcp.json` copy to `.agentic/.mcp.json`
- `.claude/skills/` copy to `.agentic/skills/`
- `.claude/agents/` copy to `.agentic/agents/`

**Gemini:** `agentic inject gemini`
- `GEMINI.md` copy to `.agentic/RULES.md`
- `.gemini/settings.json#mcpServers` copy to `.agentic/.mcp.json`
- `.gemini/skills/` copy to `.agentic/skills/`
- `.gemini/agents/` copy to `.agentic/agents/`

**Codex:** `agentic inject codex`
- `AGENTS.md` copy to `.agentic/RULES.md`
- `.codex/config.toml` MCP sections translate to `.agentic/.mcp.json`
- `.agents/skills/` copy to `.agentic/skills/`
- `.codex/agents/*.toml` translate to `.agentic/agents/` (TOML → MD)

If `.agentic/` already has configs, prompt user to confirm overwrite before proceeding.

After import, prompt user to run `agentic install <platform>` to replace originals with symlinks.

### `agentic eject`

Flatten everything to real files, remove `.agentic/`:
- For each installed platform: replace symlinks with copies of the target files
- For generated files (Codex TOML, Gemini settings.json): keep as-is (already real files)
- Delete `.agentic/` directory
- Remove `.agentic/`-related comments and all platform-derived entries from `.gitignore`
- After eject, workspace has standalone platform configs with no dependency on `.agentic/`

### `agentic update`

Update `.agentic/AGENTIC.md` to match the current package version. Run after upgrading the agentic package.

### `agentic status`

Show current state:
- Which platforms are installed
- Symlink health per platform (intact or broken)
- Number of MCP servers configured
- Number of skills and agents defined

## Error Handling

- All commands except `init` require `.agentic/` to exist. Exit with an error message prompting the user to run `agentic init` first.
- `init` should error if `.agentic/` already exists.
- `install` is idempotent — running `agentic install claude` twice produces the same result (re-derive configs from `.agentic/`).

## Platform Details

### Claude Code
- Rules: `CLAUDE.md` at project root
- Skills: `.claude/skills/` (each skill has `SKILL.md`)
- MCP: `.mcp.json` at project root (JSON, `mcpServers` key)
- Agents: `.claude/agents/*.md` (Markdown with YAML frontmatter)

### Gemini CLI
- Rules: `GEMINI.md` at project root (does NOT auto-load `AGENTS.md`)
- Skills: `.agents/skills/` (shared standard, takes precedence over `.gemini/skills/`)
- MCP: `.gemini/settings.json` → `mcpServers` key (merge-write, preserve other keys)
- Agents: `.gemini/agents/*.md` (Markdown with YAML frontmatter)

### Codex CLI
- Rules: `AGENTS.md` at project root
- Skills: `.agents/skills/` (shared standard, auto-discovered)
- MCP: `.codex/config.toml` → `[mcp_servers.<name>]` section (translate JSON → TOML)
- Agents: `.codex/agents/*.toml` (translate MD frontmatter → TOML: `name`, `description`, `developer_instructions`)

## Translation Details

### MCP: JSON → Codex TOML
```json
{
  "mcpServers": {
    "browsermcp": {
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"],
      "env": { "API_KEY": "xxx" }
    }
  }
}
```
→
```toml
[mcp_servers.browsermcp]
command = "npx"
args = ["@browsermcp/mcp@latest"]

[mcp_servers.browsermcp.env]
API_KEY = "xxx"
```

### MCP: JSON → Gemini settings.json
Merge `.agentic/.mcp.json` contents into `.gemini/settings.json` under the `mcpServers` key. Preserve existing keys in settings.json.

### Agents: MD ↔ Codex TOML

MD → TOML (install):
```markdown
---
name: reviewer
description: Reviews code for quality issues
---
Review the code and flag issues...
```
→
```toml
name = "reviewer"
description = "Reviews code for quality issues"
developer_instructions = """
Review the code and flag issues...
"""
```

TOML → MD (inject):
```toml
name = "reviewer"
description = "Reviews code for quality issues"
developer_instructions = """
Review the code and flag issues...
"""
```
→
```markdown
---
name: reviewer
description: Reviews code for quality issues
---
Review the code and flag issues...
```

### MCP: Codex TOML → JSON (inject)
```toml
[mcp_servers.browsermcp]
command = "npx"
args = ["@browsermcp/mcp@latest"]

[mcp_servers.browsermcp.env]
API_KEY = "xxx"
```
→
```json
{
  "mcpServers": {
    "browsermcp": {
      "command": "npx",
      "args": ["@browsermcp/mcp@latest"],
      "env": { "API_KEY": "xxx" }
    }
  }
}
```

## Gitignore Management

Install adds entries under a comment header:
```gitignore
# Claude Code (derived from .agentic/)
/CLAUDE.md
/.mcp.json
.claude/skills
.claude/agents
.claude/settings.local.json
```

Uninstall removes them.

## Tech Stack

- TypeScript, compiled with `tsc` to JS
- `commander.js` for CLI framework
- `smol-toml` for TOML parsing/generation (Codex config translation)
- `gray-matter` for YAML frontmatter parsing (agent MD files)
- `package.json#bin` points to `dist/cli.js`
- Dev: `tsx src/cli.ts` for fast iteration, `npm run build` before push

## npm Publishing

Use `package.json#files` (whitelist) only. Never use `.npmignore` — it silently replaces `.gitignore` and fails open (forgotten files get published). With `files`, forgotten files simply don't ship.

Note: when users install from a GitHub URL (`npm install github:jesseminn/agentic`), npm may show a cosmetic `gitignore-fallback` warning even with `files` set. This is a known npm false positive — `files` still correctly controls what ships.

```json
{
  "files": ["dist/"]
}
```

## Project Structure

```
agentic/
├── package.json
├── tsconfig.json
├── CLAUDE.md              # this file
├── src/
│   ├── cli.ts             # entry point, commander setup
│   ├── commands/
│   │   ├── init.ts
│   │   ├── install.ts
│   │   ├── uninstall.ts
│   │   ├── inject.ts
│   │   ├── eject.ts
│   │   ├── update.ts
│   │   ├── mcp.ts
│   │   └── status.ts
│   ├── lib/
│   │   ├── platforms.ts   # platform definitions & mappings
│   │   ├── symlink.ts     # safeLink, removeSymlink
│   │   ├── gitignore.ts   # add/remove entries
│   │   ├── templates.ts   # bundled template file helpers
│   │   └── translate.ts   # JSON↔TOML, MD↔TOML
│   └── templates/
│       └── AGENTIC.md     # bundled template, copied to .agentic/ on init/update
```

## Distribution

- Not published to npm registry (for now)
- Lives at github.com/jesseminn/agentic
- Install: `npm i -D github:jesseminn/agentic` (project dev dependency) or `npm i -g github:jesseminn/agentic` (global)
- Quick use: `npx github:jesseminn/agentic init`

## Git

- Remote: `git@github_jesseminn:jesseminn/agentic.git` (SSH alias)
- User: Jesse Chen <jesseminn@gmail.com>
