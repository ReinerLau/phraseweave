#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
worktree_root="$(cd -- "$script_dir/../.." && pwd)"
cd "$worktree_root"

git fetch --quiet origin main

if [[ -n "$(git status --porcelain)" ]]; then
  printf '%s\n' \
    'Worktree setup stopped because it contains uncommitted changes.' \
    'Refusing to reset the worktree to origin/main.' >&2
  exit 1
fi

git reset --hard --quiet origin/main

printf 'Worktree synchronized to %s.\n' "$(git rev-parse --short origin/main)"
