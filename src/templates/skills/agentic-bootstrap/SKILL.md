---
name: agentic-bootstrap
description: Use when the user wants to fill in PROJECT.md and project/<topic>.md for a fresh `.agentic/` setup, or says "investigate this project", "set up project rules", "study the codebase".
---

# /agentic-bootstrap

Investigate the workspace and draft project-specific context files: `PROJECT.md` as an index, and `project/<topic>.md` files for deep dives. Stops short of writing team rules or skills — those are inherited or hand-authored.

## Prerequisites

- `.agentic/` exists (run `agentic init` first)
- Working tree state doesn't matter — this skill only writes new files in `.agentic/`

If `PROJECT.md` already exists with substantive content, ask the user whether to: extend it, regenerate, or abort. Never silently overwrite.

## Steps

### 1. Survey the workspace

Read enough to form a real picture — don't guess:

- `package.json` — name, scripts, runtime deps (top ~10 by relevance), engines, workspaces
- `tsconfig.json` / `jsconfig.json` — path aliases, module setup
- Root config files — `vite.config.*`, `next.config.*`, `.eslintrc.*`, `babel.config.*`, framework-specific configs
- Top-level directory tree (one level deep) — `src/`, `app/`, `apps/`, `packages/`, `scripts/`, etc.
- `README.md` — pull anything load-bearing about purpose/setup
- A pass through `src/` (or equivalent) — feature folders, shared modules, submodule signals
- `git log --oneline -30` — what kind of changes does this repo actually see

Build a mental model. Don't write anything yet.

### 2. Ask the user 2–3 targeted questions

Based on what the survey couldn't tell you:

- **Domain** — what does this project do for users / the business?
- **Stakeholders** — who works on it, who consumes it
- **Underdocumented surprises** — what would a new engineer be confused by that isn't obvious from the code?

Skip questions you can confidently answer from the survey. Don't pad.

### 3. Draft `PROJECT.md`

Slim index, not a content dump:

- Project name + one-paragraph what-it-does
- `## Layout` — annotated tree of top-level dirs (only what's worth pointing at)
- `## Topic index` — bullet list pointing to `project/<topic>.md` files (initially empty; populated in step 5)
- `## Lessons` — empty section, populated over time by `/commit`'s knowledge-capture step

Show the draft to the user. Confirm before writing.

### 4. Propose topic files

Based on the survey, suggest 3–7 candidates. Common ones:

- `stack.md` — libraries and versions, only the ones that constrain decisions
- `domain.md` — vocab, feature areas, business model
- `build.md` — variants, env files, deploy targets
- `workflow.md` — branch model, commit format, CI/CD bot
- `conventions.md` — wrappers, hooks, lint rules, aliases, codegen
- `<submodule>.md` — if there's a shared submodule worth its own page

Don't propose more than the project actually needs. A 10-line PR-template repo doesn't need 7 topic files.

User picks which to draft.

### 5. Draft each topic file, one at a time

For each chosen topic:
- Read deeper into the relevant files
- Draft ~30–60 lines, focused
- Show to user, accept edits, then write

Never bulk-write. One file, one confirmation.

### 6. Wrap up

Show what was created. Suggest:
- Run `/agentic-bootstrap` again later as the project evolves and gaps appear
- Land the new files via `/commit` if appropriate
- If a team-level rules source exists (e.g., a parent shared-rules workspace), the user may want to wire that up separately — out of scope for this skill

## Rules

- Don't claim things you didn't verify in the survey. If you didn't find evidence, don't write it.
- `PROJECT.md` is an index. Detail belongs in `project/<topic>.md`.
- Never overdraft. 3–4 well-chosen topic files beat 7 sparse ones.
- Don't write `RULES.md` content — team rules come from upstream, project-specific rules are usually empty
- Don't auto-create `skills/<name>/SKILL.md` — skills are too project-specific to template
- Confirm before every file write. No silent bulk-writes.
- If the user gets bored mid-investigation, stop. Half-done `PROJECT.md` is fine; you can resume later.
