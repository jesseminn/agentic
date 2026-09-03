# agentic v1 — Design

Status: implemented · 2026-09-02
Supersedes: the v0.2 model (whole-directory symlinks, gitignored derived files, harness content bundled in the tool).

Naming: the repo is `jesseminn/agentic`. The package and the command are `agentic`.

Platforms: Claude Code, Antigravity CLI (`agy`), Codex CLI. Gemini CLI was dropped: since 2026-06-18 it no longer serves individual, AI Pro, or AI Ultra accounts, and Google names Antigravity CLI as its successor. It still works under an enterprise Code Assist license or a paid API key, so the mapping can come back if it is ever needed. Antigravity reads `AGENTS.md`, `.agents/skills/`, `.agents/agents/`, and `.agents/mcp_config.json`.

## 1. Problem

v0.2 creates symlinks (`CLAUDE.md → .agentic/RULES.md`, `.claude/skills → .agentic/skills`, …) and then gitignores them. The derived layer is untracked. A `git worktree add`, a fresh clone, or a CI checkout materializes `.agentic/` but none of the symlinks, so an agent session started there has no rules, no skills, and no MCP config.

Two further limits surfaced while diagnosing this:

- A whole-directory symlink for `skills/` means a project cannot add a platform-specific skill. The directory *is* the shared one.
- Ownership inside `.agentic/` is inferred: a naming prefix marks harness skills, and a sync skill decides case by case what an update may overwrite. A deterministic tool cannot run a judgment step.

## 2. What agentic is

A CLI with two jobs. It contains no harness content of its own.

1. **Seed** an *agentic harness* into a project: `install`, `uninstall`, `update`.
2. **Link** the seeded harness into a platform client's config: `link`, `unlink`.

An *agentic harness* is a git repo or directory with the standard shape in §3. Teams own their harness; agentic only moves it and derives platform config from it.

## 3. Agentic harness — standard shape

```
harness.json            name, version
RULES.md                behavior rules (short map file)
rules/<name>.md         topic rules, loaded alongside RULES.md
PROJECT.md              project-context seed (template)
project/<name>.md       project topic-rule seeds (templates)
references/<name>.md    workflow docs that skills cite
skills/<name>/SKILL.md  Agent Skills format; a namespace prefix keeps harness skills clear of platform built-ins
agents/<name>.md        subagents, markdown + frontmatter (lowest-common-denominator fields: name, description, body)
mcps.json               MCP servers; env vars by ${NAME} reference only, never literal secrets
```

Two ownership tiers inside the shape:

| tier | paths | after install |
|---|---|---|
| harness-owned | `RULES.md`, `rules/`, `references/`, `skills/`, `agents/`, `mcps.json` entries | recorded in the lock; overwritten by `update` |
| seed-once | `PROJECT.md`, `project/` | copied if absent; never recorded; never touched again |

If the harness ships no `PROJECT.md`, `install` creates an empty stub. The slot always exists because `link` always imports it.

**Not part of a harness:**

- Hooks — every client has its own hook model.
- Platform-specific mechanisms (Claude plugins, output styles, statuslines, Antigravity workflows).
- Project-specific content beyond the seed templates. A harness is project-agnostic.

**Cross-reference rule.** Skills and rules cite other harness files root-relative: `.agentic/references/foo.md`, never `../../references/foo.md`. Relative paths break under per-entry symlinks (§6); root-relative paths resolve the same from any link location.

## 4. Project layout after `install` + `link claude`

```
project/
├── .agentic/
│   ├── agentic.lock              ownership + provenance (§5)
│   ├── RULES.md                  harness
│   ├── rules/                    mixed — lock decides per file
│   ├── PROJECT.md                project (seeded once)
│   ├── project/                  project (seeded once)
│   ├── references/               mixed
│   ├── skills/
│   │   ├── commit/               harness
│   │   └── my-skill/             project, cross-platform
│   ├── agents/                   mixed
│   └── .mcp.json                 mixed — lock decides per server key
├── CLAUDE.md                     generated:  @.agentic/RULES.md  @.agentic/PROJECT.md
├── .mcp.json → .agentic/.mcp.json
└── .claude/
    ├── rules/
    │   ├── foo.md → ../../.agentic/rules/foo.md
    │   └── bar.md → ../../.agentic/project/bar.md
    ├── skills/
    │   ├── commit → ../../.agentic/skills/commit
    │   ├── my-skill → ../../.agentic/skills/my-skill
    │   └── claude-only-skill/    real dir — project's platform-specific skill
    ├── agents/
    │   └── reviewer.md → ../../.agentic/agents/reviewer.md
    ├── settings.json             project-owned, tracked
    ├── settings.local.json       ignored
    └── worktrees/                ignored
```

**Everything derived is tracked.** Symlinks are relative, so they resolve in any worktree, clone, or CI checkout. The only gitignored entries are files that a device or the platform itself writes: `.claude/settings.local.json`, `.claude/worktrees/`. Antigravity and Codex have nothing to ignore.

## 5. The lock — `.agentic/agentic.lock`

Ownership is recorded, not inferred. `install` writes the lock; `update` reads and rewrites it; `init` writes an empty one.

```json
{
  "harness": {
    "name": "my-harness",
    "version": "1.4.0",
    "source": "https://github.com/you/your-harness",
    "ref": "main",
    "commit": "3f2a9c1…",
    "installedAt": "2026-09-02"
  },
  "files": {
    "RULES.md": "sha256:…",
    "rules/testing.md": "sha256:…",
    "references/release-and-rollback.md": "sha256:…",
    "skills/commit/SKILL.md": "sha256:…",
    "agents/reviewer.md": "sha256:…"
  },
  "mcpServers": {
    "language-server": "sha256:…",
    "browsermcp": "sha256:…"
  },
  "platforms": ["claude"]
}
```

- `files` — every harness-owned path, hashed per file. A path not listed is project-owned and invisible to the tool.
- `mcpServers` — harness-owned keys inside `.agentic/.mcp.json`, each with the hash of its entry (deterministic JSON). Ownership is per key because the file is shared with project entries; the hash lets `update` tell a hand-edit from an upstream change, same as for files.
- `platforms` — currently linked platforms, so `update` can re-link after content changes, `status` can report drift, and `unlink` knows which paths another platform still shares. An id the current version does not know (e.g. `gemini`) is dropped with a warning on read and removed on the next write.

The lock is committed. A test pull from a local checkout is just uncommitted working-tree changes; `git checkout -- .agentic/` reverts it, lock included. No special test-pull mode is needed.

## 6. Commands

### `agentic install <git-url | path>[#ref]`

`file://`, `git@`, `https://`, `ssh://`, `git://`, and `github:owner/repo` are cloned (`--depth 1 --branch <ref>`; a commit sha falls back to a full clone + checkout). Anything else is a path.

1. Fetch the harness. Validate `harness.json` and the shape.
2. Compare every harness-owned path with the local tree. A path that already exists with **different** content is a conflict: report all of them and abort with nothing written. Identical content is adopted — this is how a v0.2 project migrates.
3. Copy harness-owned files. Copy seed-once files only where absent; create an empty `PROJECT.md` if the harness has none.
4. Merge `mcps.json` entries into `.agentic/.mcp.json` (same conflict rule per key).
5. Write the lock. Re-run `link` for any platform already recorded.

### `agentic update [git-url | path] [--force]`

Source defaults to the lock. A path argument pulls from a local checkout for testing.

For each path, compare the new harness, the lock, and the working tree:

| new harness has it | lock has it | local hash | action |
|---|---|---|---|
| yes | yes | equals lock (or already equals upstream) | overwrite |
| yes | yes | differs | **conflict** — hand-edited harness file; skip |
| yes | no | exists, equals upstream | adopt |
| yes | no | exists, differs | **conflict** — project file at a new upstream path; skip |
| yes | no | absent | add |
| no | yes | equals lock | delete (removed upstream) |
| no | yes | differs | **conflict** — hand-edited, removed upstream; skip |

MCP keys follow the same table against `mcpServers`. Seed-once paths are never visited.

A skipped conflict keeps its old lock entry, so it surfaces again on every `update` and in `status` until resolved.

Then rewrite the lock, and re-run `link` for every platform in `platforms` so new skills get links and removed ones get pruned.

Conflicts print as a list and the command exits non-zero, so a CI job notices. `--force` takes the upstream side for every conflict. Resolving a conflict any other way is the user's job: keep the local edit (move it to `PROJECT.md`/`project/` or a project skill), revert it, or open a PR against the harness. No tool or skill is needed for that.

### `agentic uninstall`

Delete every lock-listed path and MCP key whose content still matches the lock. A harness file that was modified locally is **kept** and reported — it is now project-owned; deleting user work silently is not acceptable. Project-owned files and seeds are not touched. Empty directories below a standard top-level dir are pruned; the standard dirs stay.

The lock stays, with `harness: null` and empty `files`/`mcpServers`, so `platforms` survives and a later `install` re-links automatically. Linked platforms are re-run so dangling links are pruned.

### `agentic link <claude | antigravity | codex>`

Idempotent. Derives from both tiers of `.agentic/`, reconciles against what is already in the platform directory, and records the platform in the lock.

| harness part | Claude Code | Antigravity CLI | Codex CLI |
|---|---|---|---|
| rules root | `CLAUDE.md`, generated: `@.agentic/RULES.md` + `@.agentic/PROJECT.md` | `AGENTS.md`, generated, concatenated | `AGENTS.md` — the same file |
| `rules/`, `project/` | per-file links in `.claude/rules/` | concatenated into `AGENTS.md` | concatenated into `AGENTS.md` |
| `skills/` | per-directory links in `.claude/skills/` | per-directory links in `.agents/skills/` | the same directory |
| `agents/` | per-file links `.claude/agents/<name>.md` | per-file links `.agents/agents/<name>/agent.md` | generated `.codex/agents/<name>.toml` |
| `.mcp.json` | symlink `.mcp.json` | `mcpServers` key written into `.agents/mcp_config.json` | generated `.codex/config.toml` |

Antigravity and Codex both read `AGENTS.md` and `.agents/skills/`. Linking both produces one identical copy of each; `link` reports them unchanged for the second platform. `unlink` skips any path that another platform in `lock.platforms` still owns.

Reconciliation rules for every linked directory:

1. Add a link for each source entry that has none.
2. Remove a symlink that points into `.agentic/` and dangles or is no longer desired.
3. Never touch an entry that is not a symlink into `.agentic/`. That is the project's platform-specific content.
4. A source entry whose target name is taken by a real file or directory is a conflict. Report; do not clobber.

A v0.2 whole-directory symlink (`.claude/skills → ../.agentic/skills`) or whole-file symlink (`CLAUDE.md → .agentic/RULES.md`) is recognized by its target and replaced.

Generated files (`CLAUDE.md`, `AGENTS.md`, `.codex/*`) carry a first-line header marking them as generated by agentic. `link` only overwrites a file that carries the header; a real file at that path is a conflict. `.agents/mcp_config.json` is JSON and cannot carry a header, so it is treated as a merge target: agentic owns only its `mcpServers` key.

Gitignore is limited to `.claude/settings.local.json` and `.claude/worktrees/`. A platform with nothing to ignore gets no block, and no `.gitignore` is created for it. A v0.2 block under the same header is replaced.

`link` exits non-zero if any conflict was reported; everything else was still applied.

### `agentic unlink <platform>`

Remove the links, generated files, and merged keys that `link` created — except paths another linked platform still uses. Nothing else in the platform directory is touched. Remove the platform from the lock.

### `agentic status`

Report: harness name, version, commit, source; harness drift (lock-listed files or MCP keys that were edited or deleted locally); a content summary with harness/project counts; per linked platform, a dry-run `link` showing what is stale or conflicting. Exits non-zero on any drift, so it gates CI.

### `agentic init`

Create a bare `.agentic/` (stub `RULES.md`, stub `PROJECT.md`, the standard dirs, empty `.mcp.json`, empty lock) for a project that links without a harness. Note that its `RULES.md` stub will conflict with a later `install` — that is intended: move those rules into `PROJECT.md` first.

### Kept from v0.2

`mcp add|remove|list` (refuses a literal secret in `--env`, labels each server harness/project, warns when editing a harness-owned key), `inject` (only while no harness is installed; skips symlinks and generated files), `eject` (inlines the root imports, flattens each per-entry link, strips generated headers, removes `.agentic/`).

## 7. Ownership guarantee

The tool touches only:

- inside `.agentic/`: paths listed in the lock and MCP keys listed in the lock;
- inside platform directories: symlinks that point into `.agentic/`, files carrying the generated header, and the `mcpServers` key of a merge target.

Everything else in the project belongs to the user. `install`, `update`, `uninstall`, `link`, and `unlink` all enforce this by construction, not by convention.

## 8. Decisions and rationale

**Track derived files.** The whole bug class in §1 is untracked state that a checkout does not reproduce. Symlinks with relative targets are ~20-byte blobs that resolve everywhere. Cost: `link` changes from a per-developer choice to a committed project decision. A Codex-only developer gets a stray `CLAUDE.md`. Accepted — `.agentic/` was already shared, so the rules were never per-developer.

**Vendor the harness; never a submodule or a cache.** A submodule is not initialized in a worktree — the same bug again. A cache directory is untracked state — the same bug again. A vendored copy plus a lock makes every harness update a reviewable diff in a normal PR.

**Ownership by lock, not by prefix.** A namespace prefix on harness skills is still worth having for collision-proofing against platform built-ins (Claude Code ships its own `/code-review`), but it is no longer how the tool decides what it may overwrite. Renaming at link time is not an option: the slash-command name comes from SKILL.md frontmatter, not the directory.

**Per-entry links.** The only way a project can hold a platform-specific skill next to shared ones. Cost: reconciliation logic in `link` (§6). Worth it.

**Generated rules root, not symlink + import.** With `PROJECT.md` a second source, the root file needs two imports. Putting `@PROJECT.md` inside `RULES.md` and keeping the symlink was rejected: whether the client resolves a relative `@path` against the symlink's location or the real file's location was not tested, and a wrong guess silently drops project rules.

**Antigravity uses the concatenated `AGENTS.md`, not `.agents/rules/`.** Antigravity does auto-load plain markdown from `.agents/rules/` (verified in its docs), but it shares `AGENTS.md` with Codex, and Codex has no rules directory, so the rules must be inlined in `AGENTS.md` anyway. Linking them into `.agents/rules/` as well would load every rule twice. One concatenated file for both platforms is simpler and identical for both. Cost: Antigravity's per-file 12,000-character limit applies to the whole `AGENTS.md`, if it applies to that file at all — unverified.

**Antigravity agents at `<name>/agent.md`.** The official CLI docs give `{workspace}/.agents/agents/{agent_name}/agent.md`; a flat `<name>.md` is reported by secondary sources only. The documented form is used. The harness agent format (frontmatter `name`, `description`, body prompt) matches Antigravity's documented minimal example; Antigravity's extra fields (`subagent`, `mainAgent`, `tools`, …) are optional and not part of the harness shape.

**Seed-once tier.** Keeps the harness project-agnostic while still letting it ship a `PROJECT.md` template. Because seeds are never in the lock, `update` cannot regress a project's own context.

**Hash MCP keys too.** The first draft listed harness MCP keys without hashes. Without one, `update` cannot tell a hand-edited entry from an upstream change and would silently overwrite user edits — inconsistent with the file rule. Entries are hashed as deterministic JSON.

**No push / contribute skill.** Contributions to a harness are ordinary PRs against the harness repo. The `update` conflict list tells a developer what diverged; what to do about it is a human decision.

**Update is a script, not a skill.** Diff, the table, apply, bump lock — none of it needs a model. A script can also run in CI on a schedule and open a "harness update" PR, which a skill never could. A v0.2-era sync skill is retired: its pull half becomes `agentic update`, its push half is dropped per the decision above.

**Secrets.** `mcps.json` in a harness and `.agentic/.mcp.json` in a project are both committed. `${NAME}` references only. A literal is a validation error at `install` and at `mcp add`.

**Keep locally modified files on `uninstall`.** Deleting a file the user edited, on a command that says "remove the harness", is data loss with no undo. The file is reported and becomes project-owned; the user deletes it if that is what they meant.

**Drop Gemini CLI rather than keep it as legacy.** Individual accounts can no longer run it, so a Gemini mapping would be untested code. The open-source project is still releasing and enterprise licenses still work; if that becomes relevant, the v0.2 mapping is one commit back in history and shares no paths with Antigravity. Old locks that list `gemini` still load; the id is dropped with a warning.

## 9. Migration from v0.2 projects

Because `install` adopts identical content and `link` recognizes v0.2 symlinks, migration is mostly running the tool:

1. Add `harness.json` to the harness repo and move `references/` cross-references to root-relative paths.
2. In the project, `agentic install <harness>`. Any file the project hand-edited shows up as a conflict — move that content to `PROJECT.md`/`project/` or a project skill, then retry.
3. `agentic link claude`. The whole-directory symlinks and the old gitignore block are replaced.
4. `git add -A` — the per-entry symlinks and generated `CLAUDE.md` are now tracked. Commit.
5. Delete any manifest file or sync skill the v0.2 harness carried.
6. A project that had `gemini` linked: delete `GEMINI.md`, `.gemini/`, and the Gemini block in `.gitignore` by hand; `link antigravity` if wanted.

## 10. Unverified

- Whether the Antigravity **CLI** (as opposed to the IDE) auto-loads `.agents/rules/`, and whether the 12,000-character rules-file limit applies to `AGENTS.md`. Neither matters while rules are concatenated into `AGENTS.md`.
- Whether Antigravity accepts `.agents/agents/<name>.md` as well as `<name>/agent.md`. The documented `<name>/agent.md` form is used.
- Whether a harness agent with only `name`/`description` frontmatter is offered as a subagent by Antigravity without `subagent: true`.
- `${NAME}` expansion in Codex `config.toml` MCP `env` tables and in Antigravity `mcp_config.json`.
- The bare bin name `agentic` may collide with another globally installed package on a developer's PATH. The package is installed from GitHub, so the npm registry name is not at stake.

Sources consulted for Antigravity: the official CLI migration guide (`.agents/mcp_config.json`, `.agents/skills/`, `AGENTS.md` + `GEMINI.md` both read), the official `/agents` command docs (`.agents/agents/{name}/agent.md`, frontmatter `name`/`description`), the official rules docs (`.agents/rules`, plain markdown, 12,000-character cap), and the `antigravity-cli` changelog (1.1.6 markdown agents; 1.1.16 user-level `mcp_config.json`).
