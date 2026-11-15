---
name: auto-git-push
description: Vérifie le typage et le build, contrôle l'absence de secrets ou de fichiers SQLite, puis exécute git add, commit et push vers origin main après chaque modification validée.
---

# Auto Git Push

Use this skill at the end of a repository task when the requested changes have been implemented and validated. It checks the whole worktree, creates one Conventional Commit for the validated changes, and pushes it to `origin main`.

## 1. Required validation

Run these commands from the repository root, in order:

1. `pnpm exec tsc --noEmit`
2. `pnpm build`

Stop if either command fails. Do not stage, commit, or push a change that has not passed both checks.

## 2. Public-repository safety checks

Before staging, inspect `.gitignore` and confirm it excludes:

- `.env*`, except `!.env.example`
- `data/*.db`, `data/*.db-wal`, and `data/*.db-shm`
- `node_modules/` and `.next/`

Run `git status --short` and inspect the changed-file list. Stop if `.env.local`, any other actual environment file, or any `.db`, `.db-wal`, or `.db-shm` file is tracked or appears among changes. Never print or copy secret values into reports.

Review the changes being committed for credentials, tokens, private keys, or other sensitive values. If uncertain whether a changed file contains a secret, stop and ask rather than pushing it.

## 3. Stage, inspect, commit, and push

Only after both validation and safety checks pass:

1. Run `git add .`.
2. Run `git diff --cached --name-only` and verify the complete staged set. Do not commit `.env.local`, `data/english.db`, any other database file, or any secret.
3. If an unsafe file is staged, stop; do not commit or push.
4. Create a concise Conventional Commit whose type and scope describe the validated changes.
5. Push with `git push -u origin main`. If the current branch is not `main`, or the push is rejected, stop and report the blocker instead of force-pushing or changing branches.

Do not amend existing commits or use force-push.

## 4. Final report

Report whether type-check and build passed, the short commit hash from `git rev-parse --short HEAD`, whether `git push -u origin main` succeeded, and confirm no environment secrets or SQLite files were included. Mention only changes relevant to the task.
