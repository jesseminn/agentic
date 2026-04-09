# agentic

Write your AI agent config once — use it everywhere.

## What is it

`agentic` is a CLI tool that manages a single `.agentic/` directory as the source of truth for AI agent configuration. It derives platform-specific configs for **Claude Code**, **Gemini CLI**, and **Codex CLI** from that one directory.

```
.agentic/
├── AGENTIC.md    # bundled template (updated via `agentic update`)
├── RULES.md      → CLAUDE.md, GEMINI.md, AGENTS.md
├── .mcp.json     → .mcp.json, .gemini/settings.json, .codex/config.toml
├── skills/       → .claude/skills, .gemini/skills, .agents/skills
└── agents/       → .claude/agents, .gemini/agents, .codex/agents/*.toml
```

## Why

Each AI coding agent has its own config format: Claude Code reads `CLAUDE.md` and `.mcp.json`, Gemini CLI reads `GEMINI.md` and `.gemini/settings.json`, Codex CLI reads `AGENTS.md` and `.codex/config.toml`. If you use more than one, you're maintaining the same rules, MCP servers, skills, and agents in multiple places.

`agentic` solves this. Write once in `.agentic/`, run `agentic install <platform>` for each tool you use. When you update `.agentic/`, symlinked configs stay in sync automatically. For platforms that need different formats (Codex uses TOML, Gemini merges into settings.json), `agentic` handles the translation.

## How it's designed

- **Symlinks** for configs that share the same format (rules, skills, agents for Claude/Gemini). No copying, no drift.
- **Translation** where formats differ: JSON → TOML for Codex MCP config, Markdown → TOML for Codex agents.
- **Merge** for Gemini's `settings.json` — writes only the `mcpServers` key, preserves everything else.
- **Gitignore management** — derived files are auto-added to `.gitignore` under platform-specific comment headers, cleaned up on uninstall.
- **Reversible** — `inject` imports existing configs into `.agentic/`, `eject` flattens everything back to standalone files.

## How to use it

### Install

```bash
# as a project dev dependency
npm i -D github:jesseminn/agentic

# or globally
npm i -g github:jesseminn/agentic

# or one-off
npx github:jesseminn/agentic <command>
```

### Set up

```bash
# create .agentic/ directory
agentic init

# write your rules
vim .agentic/RULES.md

# add MCP servers
agentic mcp add browsermcp npx @browsermcp/mcp@latest
agentic mcp add github npx @anthropic/mcp-github --env GITHUB_TOKEN=xxx

# install for the platforms you use
agentic install claude
agentic install gemini
agentic install codex
```

### Already have configs?

```bash
# import existing Claude Code config into .agentic/
agentic inject claude

# then install for other platforms
agentic install gemini
agentic install codex
```

### Day-to-day

```bash
# check what's installed
agentic status

# manage MCP servers (auto-propagates to all installed platforms)
agentic mcp add <name> <command> [args...] [--env KEY=VALUE...]
agentic mcp remove <name>
agentic mcp list

# after upgrading the agentic package, update template files
agentic update

# remove a platform
agentic uninstall gemini

# stop using agentic entirely (flatten to standalone files)
agentic eject
```

## Platform support

| | Claude Code | Gemini CLI | Codex CLI |
|---|---|---|---|
| Rules | `CLAUDE.md` (symlink) | `GEMINI.md` (symlink) | `AGENTS.md` (symlink) |
| Skills | `.claude/skills` (symlink) | `.gemini/skills` (symlink) | `.agents/skills` (symlink) |
| MCP | `.mcp.json` (symlink) | `.gemini/settings.json` (merge) | `.codex/config.toml` (translate) |
| Agents | `.claude/agents` (symlink) | `.gemini/agents` (symlink) | `.codex/agents/*.toml` (translate) |

## Related

- [AGENTS.md](https://agents.md/) — an open standard for the `AGENTS.md` file format that guides AI coding agents. Supported by 60,000+ projects and tools like Claude Code, Copilot, Cursor. `agentic` symlinks `.agentic/RULES.md` to each platform's rules file (`CLAUDE.md`, `GEMINI.md`, `AGENTS.md`).
- [.agents protocol](https://dotagentsprotocol.com/) — an open directory standard that consolidates AI agent config (MCP, AGENTS.md, skills, sub-agents) into a single `.agents/` directory. It aims for platforms to adopt the standard natively. `agentic` takes a different approach: work with each platform's existing config format today, using `.agentic/` as a source of truth with symlinks and translation.
