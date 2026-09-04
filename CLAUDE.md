# agentic

CLI that seeds a shared *agentic harness* into a project's `.agentic/` and links it into Claude Code, Antigravity CLI, and Codex CLI config. The tool ships no harness content. Full design: `docs/design-v1.md` — read it before changing ownership, lock, or link semantics.

## Two jobs

- **Seed**: `install <git-url|path>[#ref]`, `update [source] [--force]`, `uninstall`. Copies harness files into `.agentic/` and records them in `.agentic/agentic.lock` with content hashes.
- **Link**: `link <platform>`, `unlink <platform>`. Derives platform config via per-entry symlinks and generated files. Everything derived is committed.

## Ownership — the one invariant

The tool touches only:

- inside `.agentic/`: paths listed in the lock (`files`) and MCP keys listed in the lock (`mcpServers`);
- inside platform dirs: symlinks that point into `.agentic/`, files carrying the generated header (`lib/generated.ts`), and the `mcpServers` key of a merge target.

Everything else belongs to the user. Never add a code path that writes outside this set. `rules/PROJECT.md` is seeded once and never recorded, so `update` cannot see it.

## Harness shape (`lib/harness.ts`)

```
harness.json  rules/COMMON.md  references/  skills/*/SKILL.md  agents/  mcps.json   ← harness-owned
rules/PROJECT.md                                                                     ← seed-once
```

`harness.json` carries `protocol` — the shape version — beside the harness's own `version`. See Protocol below.

`rules/` holds exactly those two files; ownership is per file, not per directory. A rule loads into every session on every platform, so anything procedural is a skill. `validateHarness` rejects a missing `harness.json`/`rules/COMMON.md`, the v1.0 paths (`RULES.md`, `PROJECT.md`, `project/`), any other file in `rules/`, a skill dir without `SKILL.md`, and any literal MCP env value (must be `${NAME}`).

## Protocol (`lib/protocol.ts`, `lib/migrate.ts`)

`CURRENT_PROTOCOL` is the one shape this build reads and writes; a `harness.json` or lock without `protocol` is `1.0`. Three rules, one each:

- A harness must be on the current protocol — `validateHarness` throws otherwise, naming both versions, before any shape check.
- A project behind it is migrated, not refused: `migrate` applies each `STEPS` entry from the lock's protocol up to current, stamps the lock, re-links recorded platforms. `install` and `update` run it first (`autoMigrate`); `link`/`unlink`/`status`/`uninstall`/`eject`/`inject`/`mcp` stop with `requireCurrentProtocol` and say to run it.
- A step touches only project-owned content and derived files. A harness-owned path (in the lock) is reported and left for `update`.

A lock-less `.agentic/` that still has a 1.0 path (`RULES.md`, `PROJECT.md`, `project/`) counts as 1.0, so v0.2 and lock-less projects migrate on `install`. Tool history lives in `STEPS`, never in `lib/platforms.ts`: a platform mapping describes the platform.

## Update algorithm (`commands/update.ts`)

Per path, comparing upstream hash / lock hash / local hash:

| upstream | lock | local | action |
|---|---|---|---|
| yes | yes | = lock or = upstream | overwrite |
| yes | yes | differs | conflict (modified locally) |
| yes | no | exists, = upstream | adopt |
| yes | no | exists, differs | conflict (project file at new path) |
| yes | no | absent | add |
| no | yes | = lock | delete |
| no | yes | differs | conflict (modified, removed upstream) |

MCP keys use the same table with `hashJson` on the entry. Conflicts are skipped, keep their old lock entry so they resurface, print, and exit 1. `--force` takes upstream. After applying, `update` re-runs `link` for every platform in `lock.platforms`.

## Link algorithm (`lib/linker.ts`)

Per platform (`lib/platforms.ts` mapping):

| | Claude Code | Antigravity CLI | Codex CLI |
|---|---|---|---|
| root | `CLAUDE.md`, `import` mode (`@` lines) | `AGENTS.md`, `concat` | `AGENTS.md`, `concat` (same file) |
| rules/ | both `@`-imported by the root | both inlined, COMMON then PROJECT | same file |
| skills/ | `.claude/skills/<name>` links | `.agents/skills/<name>` links | same dir |
| agents/ | `.claude/agents/<name>.md` links (`link`) | `.agents/agents/<name>/agent.md` links (`link-dir`) | `.codex/agents/*.toml` (`translate`) |
| MCP | symlink `.mcp.json` | merge `mcpServers` into `.agents/mcp_config.json` | translate to `.codex/config.toml` |
| gitignore | `settings.local.json`, `worktrees/` | none | none |

- Root file is always generated with the header. A v0.2 symlink into `.agentic/` is replaced; a real non-generated file is a conflict.
- `.claude/rules/` is not written. The 1.0 → 1.1 step removes v1.0 per-file links found there; a real file there is the project's own and is left alone.
- `status` warns, exit 0, when `rules/COMMON.md` + `rules/PROJECT.md` exceed `RULES_LINE_BUDGET` (200 lines).
- `reconcileLinks` / `reconcileLinkDirs` rules: add missing; remove dangling or undesired links into `.agentic/`; never touch anything else; a real entry in the way is a conflict.
- **Shared paths**: Antigravity and Codex both own `AGENTS.md` and `.agents/skills/`. `unlinkPlatform` skips any path in `platformPaths()` of another platform still in `lock.platforms`.
- `linkPlatform(cwd, p, { apply: false })` is the dry run `status` uses. `linkMcp` re-derives only MCP (used by `mcp add/remove`).
- Gemini CLI was removed (no longer serves individual accounts; Antigravity is the successor). `readLock` drops unknown platform ids with a warning so old locks still load.

## Lock (`lib/lock.ts`)

```json
{ "protocol": "1.1",
  "harness": { "name", "version", "source", "ref", "commit", "installedAt" },
  "files": { "<rel>": "sha256:…" },
  "mcpServers": { "<key>": "sha256:…" },
  "platforms": ["claude"] }
```

`uninstall` sets `harness: null` and empties `files`/`mcpServers` but keeps the lock so `platforms` survives. `init` writes an empty lock.

## Commands

| command | file |
|---|---|
| `init` | `commands/init.ts` — bare `.agentic/` with stubs + empty lock |
| `install <spec>` | `commands/install.ts` — refuses differing local content; identical content is adopted (v0.2 migration) |
| `update [spec] [--force]` | `commands/update.ts` |
| `uninstall` | `commands/uninstall.ts` — keeps locally modified harness files, reports them |
| `link` / `unlink <platform>` | `commands/link.ts` |
| `status` | `commands/status.ts` — exit 1 on any drift |
| `migrate` | `commands/migrate.ts` — apply pending protocol steps; `autoMigrate` for install/update |
| `mcp add/remove/list` | `commands/mcp.ts` — rejects literal secrets, warns on harness-owned keys |
| `inject <platform>` | `commands/inject.ts` — only without a harness installed; skips symlinks and generated files |
| `eject` | `commands/eject.ts` — inlines root imports, flattens links, strips headers, removes `.agentic/` |

Exit codes: 0 clean, 1 on conflicts or drift. All commands except `init`/`install` require `.agentic/`.

## Tests

`npm test` builds and runs `test/e2e.test.mjs` against `dist/cli.js` (node:test, real git, real worktree). Add a test for any change to ownership or reconciliation behavior.

## Tech stack

TypeScript → `tsc` → `dist/`. `commander`, `smol-toml`, `gray-matter`. Node ≥ 24. `npm run dev` = `tsx src/cli.ts`. Publish via `package.json#files` (whitelist) — never `.npmignore`. Bin is `agentic`; package name is `agentic`; repo is `jesseminn/agentic`.

## Git

- Remote: `git@github_jesseminn:jesseminn/agentic.git` (SSH alias)
- User: Jesse Chen <jesseminn@gmail.com> (local git identity, keeps personal commits separate from work)
