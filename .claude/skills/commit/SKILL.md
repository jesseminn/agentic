---
name: commit
description: Use when the user wants to commit changes, says "commit", "save changes", or is done with a task and has uncommitted work.
---

# /commit

Commit changes to git, grouping related changes into logical commits.

## Gotchas
- Never use `git add -A` or `git add .` — can accidentally stage `.env`, credentials, or large binaries
- If push fails with "remote has new commits", don't force-push — remind user to run `/sync`
- Always use HEREDOC for commit messages to avoid shell escaping issues with quotes

## Conventional Commits

All commit messages must follow the conventional commit format:

```
type(scope?): subject
```

**Types** (use only these):
- `feat` — new feature or command
- `fix` — bug fix
- `refactor` — code change that neither fixes a bug nor adds a feature
- `docs` — documentation only (CLAUDE.md, README, skill files)
- `chore` — maintenance (deps, config, CI, build)
- `test` — adding or updating tests

**Scope** is optional. Use the command or module name when helpful: `feat(install)`, `fix(gitignore)`, `docs(skills)`.

**Subject**: lowercase, imperative, no period, max ~50 chars.

**Body** (why + how): required for non-trivial changes.

Examples:
```
feat(mcp): add subcommands for add/remove/list

Why: Users need to manage MCP servers without hand-editing JSON.
Propagation to installed platforms should be automatic.

How: Added mcp.ts command with add (including --env flag),
remove, and list subcommands. Each writes to .agentic/.mcp.json
and re-derives platform configs.
```

```
fix(eject): remove platform entries from gitignore
```

```
docs: update CLAUDE.md with inject platform arg
```

## Steps

1. Run `git status` and `git diff` (including untracked files) to understand all pending changes.
2. **Docs consistency checks** (if any non-docs files are changed):
   - **CLAUDE.md** (rules): verify changes don't conflict with documented rules, conventions, or architecture. If they do, flag the conflict — either the code or the rule needs to change. Ask the user which.
   - **README.md** (documentation): verify README still accurately describes the implementation. If the changes make README stale, update README to reflect the new behavior.
3. Analyze the changes and group them into logical commits. Each commit should represent one coherent unit of change. Avoid mixing unrelated changes in a single commit.
4. Before committing, present a summary of each planned commit to the user and ask a question about the change to confirm they understand what is being committed. Do NOT proceed until the user confirms.
5. For each group, write a commit message following the conventional commit format above. Include a why/how body for non-trivial changes.
6. After all commits are done, run `git log --oneline -5` and show the result so the user can confirm.

## After Committing

Ask the user if they want to sync. If yes, run `/sync` — it handles fetch, rebase, and push in one consistent flow.

## Identity

This repo uses a local git identity to keep personal commits separate from work:
- `user.name`: Jesse Chen
- `user.email`: jesseminn@gmail.com

If these are ever missing or wrong, set them with `git config --local` before committing.

## Rules
- Never use `git add -A` or `git add .` — always stage specific files by name
- Never amend existing commits
- Never force-push or use destructive git commands
- Never use `gh` for push/pull — always use `git` with SSH remote
- If nothing to commit, say so
