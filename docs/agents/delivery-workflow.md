# Delivery workflow

This repository uses GitHub as the durable source of truth. A chat is the working session, not the project record.

## One requirement, one delivery lane

For each requirement:

1. Create or identify one GitHub Issue and add it to the delivery Project.
2. Use one Codex conversation and one isolated worktree/branch for that Issue.
3. Keep the Issue, branch, commits, and pull request linked. A feature PR targets `dev` and contains `Refs #<issue>`; do not use `Closes` because acceptance and production happen later.
4. Independent requirements may run in parallel. Requirements that touch the same area or depend on one another must be ordered explicitly.
5. The original requirement conversation owns implementation, CI failures, review feedback, merge conflicts, and preview verification until the requirement reaches `待验收`.

Project statuses are: `待澄清`, `可开发`, `开发中`, `PR 审查中`, `待验收`, `已验收`, `已发布`, and `受阻`.

## Natural-language commands

### 发布测试

When the user says `发布测试`, treat it as a completion contract, not merely a request to open a PR:

1. Start or continue a Goal whose completion condition is a verified preview deployment.
2. Run the relevant local checks.
3. Push the requirement branch and open a PR to `dev` with `Refs #<issue>`.
4. Request/observe Codex review. Do not enable auto-merge while the current PR head has unresolved P0/P1 findings.
5. Keep fixing and pushing until all required CI checks pass, review conversations are resolved, and auto-merge merges the PR.
6. Wait for the Pages deployment, then smoke-test the fixed preview URL at `https://reinerlau.github.io/phraseweave/preview/`.
7. Record the merged SHA and preview URL on the Issue, move it to `待验收`, and only then complete the Goal.

Feature PRs use squash merge. Never merge a failing PR or bypass branch protection.

### 验收通过

Only the user may issue `验收通过`, and it must be handled in the original requirement conversation. On that command:

1. Resolve the Issue and preview SHA being accepted.
2. Add the `accepted` label.
3. Add an Issue comment in this exact shape. `预览 SHA` is the full 40-character squash-merge SHA deployed to `dev`:

   ```text
   <!-- phraseweave-acceptance -->
   验收人: @github-user
   验收时间: 2026-09-21T12:00:00+08:00
   预览 SHA: 0123456789abcdef0123456789abcdef01234567
   预览地址: https://reinerlau.github.io/phraseweave/preview/
   ```

   The comment must be posted by the same GitHub user named in `验收人`, and that user must be listed in the repository variable `ACCEPTANCE_ACTORS`.

4. Move the Project item to `已验收`.

Do not close the Issue yet. Acceptance authorizes inclusion in the next production release; it is not production deployment.

### 正式发布

Treat `正式发布` as a separate release Goal:

1. Compare `main..dev` and enumerate every feature/fix PR and linked Issue in the unreleased range.
2. Block the entire release if any change lacks a linked Issue or any linked Issue lacks the `accepted` label and acceptance record.
3. Create a release branch from the exact accepted `dev` SHA. Do not let later `dev` commits enter this snapshot.
4. Open a release PR to `main`. Wait for the release-readiness guard, all required CI checks, review, and auto-merge.
5. Release PRs use a merge commit so the production boundary remains visible.
6. Wait for the production Pages deployment, smoke-test `https://reinerlau.github.io/phraseweave/`, record the production SHA, close the released Issues, and move them to `已发布`.
7. Only then complete the release Goal.

## Review and automation rules

- Built-in Codex Automatic Review is the semantic review gate. It follows repository instructions but is not a required GitHub status check.
- Auto-merge may be enabled only after the current PR head has no unresolved P0/P1 Codex findings. Unresolved GitHub review conversations block merging.
- Required CI checks are `format`, `typecheck`, `unit-tests`, `static-build`, and `smoke-test`.
- A `dev` push produces a tested preview artifact without deployment credentials. Only the Pages workflow stored on `main` may assemble production plus preview and deploy GitHub Pages.
- PRs to `main` additionally require `release-readiness`, which verifies that every included `dev` PR references accepted Issue(s).
- A merged PR updates the remote branch. Follow the synchronization rules in the root `AGENTS.md` before using a local checkout as the deployed source.

## Recovery

If CI, review, merge, or deployment fails, the owning conversation stays active: diagnose, fix, push, and wait again. Do not create a second PR unless the existing PR cannot safely represent the same requirement. If an already merged preview is broken, create a follow-up Issue/PR linked to the original rather than rewriting history.
