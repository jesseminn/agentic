# agentic

Seed a shared **agentic harness** into a project, then link it into each AI coding client's config — Claude Code, Antigravity CLI, Codex CLI.

Repo: `jesseminn/agentic`. Package and command: `agentic`.

## What it does

`agentic` has two jobs and contains no harness content of its own.

1. **Seed** a harness into `.agentic/` — `install`, `update`, `uninstall`. The harness is a git repo or directory your team owns. A lockfile records exactly which files came from it, so `update` knows what it may overwrite and never touches project-owned content.
2. **Link** `.agentic/` into a platform's config — `link`, `unlink`. Per-entry symlinks and a few generated files, all committed, so a fresh clone, a CI checkout, or a `git worktree add` carries the whole harness.

```
.agentic/
├── agentic.lock              ownership + provenance
├── rules/
│   ├── COMMON.md             harness — who the agent is; replaced by `update`
│   └── PROJECT.md            project — its own context; seeded once, never updated
├── references/<doc>.md       harness or project
├── skills/<name>/SKILL.md    harness or project
├── agents/<name>.md          harness or project
└── .mcp.json                 harness keys + project keys
```

Design and rationale: [docs/design-v1.md](docs/design-v1.md).

## Install the tool

```bash
npm i -g github:jesseminn/agentic          # or -D in a project
```

Node 24+.

## Use

```bash
# seed a harness (git URL or path, optional #ref)
agentic install https://github.com/you/your-harness
agentic install ../your-harness#main

# link the clients you use — commit the result
agentic link claude
agentic link antigravity
agentic link codex

# later
agentic update              # pull the harness from the lock's source
agentic update ../local     # or from a local checkout, for testing
agentic status              # drift report; exit 1 on drift (CI gate)

# project MCP servers (env values must be ${NAME} references)
agentic mcp add gh npx mcp-github --env 'GITHUB_TOKEN=${GITHUB_TOKEN}'
agentic mcp list

# leaving
agentic unlink codex        # remove what link created, nothing else
agentic uninstall           # remove the harness; project content stays
agentic eject               # flatten everything to standalone files
```

No harness yet? `agentic init` creates a bare `.agentic/` you can link on its own.

## What `link` produces

| harness part | Claude Code | Antigravity CLI (`agy`) | Codex CLI |
|---|---|---|---|
| `rules/` | `CLAUDE.md` — generated, `@.agentic/rules/COMMON.md` + `@.agentic/rules/PROJECT.md` | `AGENTS.md` — generated, both inlined, COMMON first | `AGENTS.md` — same file |
| `skills/` | per-dir links in `.claude/skills/` | per-dir links in `.agents/skills/` | same directory |
| `agents/` | per-file links in `.claude/agents/` | links at `.agents/agents/<name>/agent.md` | `.codex/agents/*.toml` (generated) |
| `.mcp.json` | symlink `.mcp.json` | `mcpServers` written into `.agents/mcp_config.json` | `.codex/config.toml` (generated) |

Antigravity and Codex both read `AGENTS.md` and `.agents/skills/`, so linking both produces one shared copy; unlinking one leaves what the other still needs.

Rules are loaded into every session on every platform, and no client follows an `@` import or a link from `AGENTS.md` — only Claude Code expands `@` at all, at launch, without saving context. So a harness has exactly two rules files, kept short, and puts everything procedural in skills, which every client loads on demand. `status` warns when the two files together pass 200 lines.

Everything derived is tracked. Only files a device or the platform itself writes are gitignored: `.claude/settings.local.json`, `.claude/worktrees/`.

Because links are per entry, a project can drop its own platform-specific skill into `.claude/skills/` next to the linked ones. `link` never touches an entry it didn't create.

Gemini CLI is not supported: it stopped serving individual accounts on 2026-06-18 and Antigravity CLI is its successor. It still works under enterprise Code Assist licenses and API keys; open an issue if you need the mapping back.

## How `update` decides

Every harness file is recorded in `agentic.lock` with a content hash. On `update`:

| upstream has it | lock has it | local | action |
|---|---|---|---|
| yes | yes | equals lock | overwrite |
| yes | yes | differs | **conflict** — hand-edited; skipped |
| yes | no | exists | **conflict** — project file at a new upstream path; skipped |
| yes | no | absent | add |
| no | yes | equals lock | delete |
| no | yes | differs | **conflict** — hand-edited, removed upstream; skipped |

Anything in `.agentic/` not in the lock is project-owned and invisible to `update`. Conflicts print as a list and exit non-zero; `--force` takes the upstream side.

## Writing a harness

A harness is a repo with this shape:

```
harness.json            { "name": "...", "version": "..." }
rules/COMMON.md         who the agent is — role, style, conventions shared across projects; short
references/<doc>.md     workflow docs that skills cite — cite them root-relative: .agentic/references/<doc>.md
skills/<name>/SKILL.md  Agent Skills format; a namespace prefix keeps harness skills clear of platform built-ins
agents/<name>.md        subagents, markdown + frontmatter (name, description, body)
mcps.json               MCP servers; env values as ${NAME}, never literals
rules/PROJECT.md        optional seed for the project's own context — copied once, then the project's
```

Not part of a harness: hooks (every client has its own model), platform-specific mechanisms (plugins, output styles), and project-specific content beyond the seeds.

## Releasing

> For agent-driven releases, see [`.claude/skills/release/SKILL.md`](.claude/skills/release/SKILL.md).

Releases are cut from `main` and shipped as `npm pack` tarballs attached as GitHub release assets.

1. `npm version <patch|minor|major> -m "chore: release v%s"`
2. `git push origin main --tags`
3. `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`
4. The [release workflow](.github/workflows/release.yml) attaches `agentic-X.Y.Z.tgz`. If no run appears within 30s: `gh workflow run release.yml -f tag=vX.Y.Z`.

## Related

- [AGENTS.md](https://agents.md/) — the open `AGENTS.md` standard. `agentic` generates it from `.agentic/` for Antigravity and Codex.
- [.agents protocol](https://dotagentsprotocol.com/) — a proposal to consolidate agent config into one `.agents/` directory natively. `agentic` works with each platform's existing format today instead.
