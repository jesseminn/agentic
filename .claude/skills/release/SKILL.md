---
name: release
description: Use when the user wants to cut a new release of agentic, says "release", "publish", "ship a version", or asks to tag a new version.
---

# /release

Cut a new release of `agentic`. The agent handles everything that doesn't require GitHub auth (version bump, push, draft notes, prefill URL); the user clicks "Publish release" in the GitHub web UI.

**Why no `gh`:** this repo may be cut from any machine, and `gh` isn't guaranteed to be installed or authenticated as `jesseminn` everywhere (e.g., a work laptop where `gh` is signed into a different account). The web UI works on any device with a browser, and anonymous GitHub API calls (`curl`) cover verification because `jesseminn/agentic` is public — no auth setup required.

## Prerequisites

- Working tree must be clean (no uncommitted changes)
- On `main`, up to date with `origin/main`
- SSH push to `git@github_jesseminn:jesseminn/agentic.git` works (this skill never uses `gh`)

If any prerequisite fails, stop and tell the user what to fix. Do not auto-stash, do not auto-rebase.

## Steps

### 1. Decide the version

Ask the user what version to cut. They may give:
- A bump type: `patch` / `minor` / `major` — pass directly to `npm version`
- An explicit version string: `0.2.0` / `1.0.0-beta.1` — pass directly

Bump semantics:
- patch (`0.1.0` → `0.1.1`) — bug fixes only
- minor (`0.1.0` → `0.2.0`) — new features, backward compatible
- major (`0.1.0` → `1.0.0`) — breaking changes

Confirm the resolved version string before proceeding.

### 2. Pre-flight checks

```bash
git fetch origin
git status                                # must be clean
git rev-parse --abbrev-ref HEAD           # must be "main"
git log origin/main..HEAD --oneline       # must be empty (no unpushed local commits)
git log HEAD..origin/main --oneline       # must be empty (no unpulled remote commits)
```

If anything is off, stop.

### 3. Bump, commit, and tag in one step

```bash
npm version <patch|minor|major|X.Y.Z> -m "chore: release v%s"
```

`npm version` does three things atomically:
- Updates `version` in `package.json` AND `package-lock.json` (both occurrences)
- Creates a commit (`%s` expands to the new version)
- Creates an annotated git tag `vX.Y.Z`

It refuses to run on a dirty working tree, which is a built-in safety net for step 2.

### 4. Push

```bash
git push origin main --tags
```

Uses the `github_jesseminn` SSH alias — no `gh` involved.

### 5. Draft release notes

Summarize commits since the previous tag (excluding the bump commit just made):

```bash
git log $(git describe --tags --abbrev=0 HEAD^)..HEAD^ --oneline
```

Draft release notes from that log. Present to the user. Confirm before printing the publish-ready output in step 6.

### 6. Print publish-ready output

Print three things in a clearly-formatted block:

1. **Prefill URL** — the user opens this in their browser to land on the GitHub release creation form with the tag already selected:
   ```
   https://github.com/jesseminn/agentic/releases/new?tag=vX.Y.Z
   ```

2. **Title:**
   ```
   vX.Y.Z
   ```
   (Or something more descriptive if the release has a theme — e.g., `v0.2.0 — Sentinel-managed RULES.md`.)

3. **Notes:** the markdown body the user pastes into the form. Wrap it in a fenced code block so it's easy to copy.

Then tell the user: *"Open the URL, paste title and notes, click 'Publish release'. Let me know when it's published."*

Wait for the user to confirm. Do **not** proceed to verification until they say it's published.

### 7. Verify the build workflow fired

After the user confirms the release is published, wait ~10 seconds, then check the GitHub API anonymously:

```bash
curl -s "https://api.github.com/repos/jesseminn/agentic/actions/runs?event=release&per_page=3" | \
  jq '.workflow_runs[] | {name, status, conclusion, created_at, head_branch}'
```

You should see a recent run for `release.yml` triggered by the `release` event. If `status` is `in_progress` / `queued`, wait and re-check. If `conclusion` becomes `success`, proceed.

**If no run appeared within 30s** — known gotcha: `release.published` sometimes doesn't fire. The user can manually trigger it through the Actions tab:
- Open `https://github.com/jesseminn/agentic/actions/workflows/release.yml`
- Click "Run workflow" → fill the `tag` input with `vX.Y.Z` → "Run workflow"
- Then re-run the curl above.

### 8. Verify the tarball is attached

```bash
curl -s "https://api.github.com/repos/jesseminn/agentic/releases/tags/vX.Y.Z" | \
  jq '.assets[] | {name, size}'
```

Expected: `agentic-X.Y.Z.tgz` is listed. Without it, consumers can't install — the release is broken.

If the workflow run from step 7 completed but the asset isn't there yet, the upload may still be in flight — wait ~10s and re-check. If still missing after the workflow shows `success`, investigate the run logs via the Actions tab.

## Identity

This repo uses a local git identity (configured in `.git/config`):
- `user.name`: Jesse Chen
- `user.email`: jesseminn@gmail.com

If these are ever missing or wrong, set them with `git config --local` before committing.

## Rules

- Never tag a commit that isn't HEAD of `main`
- Never force-push a tag, or move an existing tag to a new commit
- Never skip the verification step — a release without a tarball asset is silently broken
- If pre-flight fails, stop. Don't try to clean up a dirty tree automatically
- Always use `npm version` for the bump — don't hand-edit version fields (the lockfile has two occurrences; manual edits drift)
- Don't reach for `gh` in this skill — it isn't guaranteed to be installed or authenticated as `jesseminn` everywhere this repo gets cut from. The web UI plus anonymous `curl` is the universal path that works on any device.
