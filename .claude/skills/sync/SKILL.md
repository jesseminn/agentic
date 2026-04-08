---
name: sync
description: Use when the user wants to sync with the remote, says "sync", "pull", or needs to push changes.
---

# /sync

Sync the local repo with the remote. Fetch, summarize, rebase, push — with confirmation at each step.

## Gotchas
- Working tree must be clean before rebase — offer commit or stash if dirty
- After pulling changes to `CLAUDE.md` or `.mcp.json`, remind user to restart Claude Code

## Prerequisites

- Working tree must be clean before rebase. If there are uncommitted changes, ask the user: **commit or stash?**
  - **commit** → run `/commit` flow, then continue sync
  - **stash** → run `git stash push -u -m "sync: auto-stash before rebase"` (`-u` includes untracked files), then continue sync. After sync completes, run `git stash pop` to restore changes. If pop has conflicts, show them and help resolve.

## Steps

### 1. Fetch

```bash
git fetch origin
```

### 2. Assess the situation

Compare local and remote:

```bash
git log HEAD..origin/main --oneline   # remote commits not yet local
git log origin/main..HEAD --oneline   # local commits not yet pushed
```

There are four possible states:

- **Both sides have commits** → summarize both, confirm rebase, then push
- **Only remote has commits** → summarize remote changes, fast-forward, done (no push needed)
- **Only local has commits** → nothing to fetch, just push
- **Already in sync** → say so and stop

### 3. Summarize

For remote commits: read the commit messages and briefly explain what changed (who changed what, which files/areas were affected). If helpful, show the diffstat.

For local commits: summarize what the current session changed (you already know this from the conversation context).

Show both summaries side by side so the user understands the full picture.

### 4. Rebase (if both sides have commits)

Ask the user to confirm, then:

```bash
git rebase origin/main
```

If there are conflicts:
- Show the conflicting files
- Help the user resolve them
- Continue the rebase after resolution

### 5. Suggested Actions

After pulling remote changes, scan the diff for things that may need attention. Present them as a checklist so the user can decide what to act on.

Look for:
- **CLAUDE.md changes**: new rules or convention changes
- **MCP config changes** (`.mcp.json`): remind user to **restart Claude Code**
- **New skills** (`.claude/skills/*/SKILL.md`): mention them so the user knows they're available
- **Dependency changes** (`package.json`, `tsconfig.json`): may need `npm install` or rebuild

Skip this step if there are no remote changes or if nothing needs attention.

### 6. Push

```bash
git push origin main
```

Use SSH remote — never use `gh` for pushing.

## Identity

This repo uses a local git identity to keep personal commits separate from work:
- `user.name`: Jesse Chen
- `user.email`: jesseminn@gmail.com

If these are ever missing or wrong, set them with `git config --local` before committing.

## Rules
- If working tree is dirty, ask user to commit or stash — don't refuse outright
- Never force-push
- Never use `gh` for push/pull — always use `git` with SSH remote
- Always summarize changes before rebasing — the whole point is informed decisions
- If already in sync, just say so — don't do unnecessary operations
