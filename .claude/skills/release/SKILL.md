---
name: release
description: Use when the user wants to cut a new release of agentic, says "release", "publish", "ship a version", or asks to tag a new version.
---

# /release

Cut a new release of `agentic`: bump version, commit, tag, push, create the GitHub release, and verify the build workflow attached the tarball.

## Prerequisites

- Working tree must be clean (no uncommitted changes)
- On `main`, up to date with `origin/main`
- `gh` CLI authenticated against an account with push to `jesseminn/agentic` (`gh auth status`)

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

### 5. Draft release notes

Summarize commits since the previous tag (excluding the bump commit just made):

```bash
git log $(git describe --tags --abbrev=0 HEAD^)..HEAD^ --oneline
```

Present a draft to the user. Confirm before publishing.

### 6. Create the GitHub release

```bash
gh release create vX.Y.Z \
  --repo jesseminn/agentic \
  --title "vX.Y.Z" \
  --notes "$(cat <<'EOF'
<release notes here>
EOF
)"
```

### 7. Verify the build workflow fired

Wait ~30 seconds, then check:

```bash
gh run list --workflow=release.yml --repo jesseminn/agentic --limit 3
```

You should see a new run for `vX.Y.Z` from the `release` event. If you do, wait for it to complete (`gh run watch <id> --exit-status`).

**If no new run appeared** — known gotcha: releases created via `gh release create` sometimes don't fire `release.published`. Fall back to manual dispatch:

```bash
gh workflow run release.yml -f tag=vX.Y.Z --repo jesseminn/agentic
```

### 8. Verify the tarball is attached

```bash
gh release view vX.Y.Z --repo jesseminn/agentic --json assets --jq '.assets[] | {name, size}'
```

Expected: `agentic-X.Y.Z.tgz` is listed. Without it, consumers can't install — the release is broken.

## Identity

This repo uses a local git identity to keep personal commits separate from work:
- `user.name`: Jesse Chen
- `user.email`: jesseminn@gmail.com

If these are ever missing or wrong, set them with `git config --local` before committing.

## Rules

- Never tag a commit that isn't HEAD of `main`
- Never force-push a tag, or move an existing tag to a new commit
- Never skip the verification step — a release without a tarball asset is silently broken
- If pre-flight fails, stop. Don't try to clean up a dirty tree automatically
- Always use `npm version` for the bump — don't hand-edit version fields (the lockfile has two occurrences; manual edits drift)
