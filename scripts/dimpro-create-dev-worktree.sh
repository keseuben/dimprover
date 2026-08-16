#!/usr/bin/env bash
set -Eeuo pipefail
OPERATOR_ROOT="${DIMPRO_OPERATOR_ROOT:-/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2}"
WORKTREES_ROOT="${DIMPRO_WORKTREES_ROOT:-/srv/dimpro-dev/worktrees}"
if [[ $# -lt 2 ]]; then
  echo "Használat: $0 <branch> <worktree-name> [base-ref]" >&2
  exit 64
fi
BRANCH="$1"
NAME="$2"
BASE_REF="${3:-HEAD}"
TARGET="$WORKTREES_ROOT/$NAME"
if [[ "$TARGET" == "$OPERATOR_ROOT" || "$TARGET" != "$WORKTREES_ROOT/"* ]]; then
  echo "Nem biztonságos worktree cél: $TARGET" >&2
  exit 1
fi
if [[ -e "$TARGET" ]]; then
  echo "A worktree már létezik: $TARGET" >&2
  exit 1
fi
cd "$OPERATOR_ROOT"
if git show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git worktree add "$TARGET" "$BRANCH"
else
  git worktree add -b "$BRANCH" "$TARGET" "$BASE_REF"
fi

# Dependency retention szabály: azonos lockfile esetén NEM másolunk 1.3–1.5 GB node_modules-t.
# A worktree az operator dependency fáját használja symlinken keresztül.
if [[ -d "$OPERATOR_ROOT/node_modules" && -f "$OPERATOR_ROOT/package-lock.json" && -f "$TARGET/package-lock.json" ]]; then
  OP_HASH="$(sha256sum "$OPERATOR_ROOT/package-lock.json" | awk {print })"
  WT_HASH="$(sha256sum "$TARGET/package-lock.json" | awk {print })"
  if [[ "$OP_HASH" == "$WT_HASH" ]]; then
    ln -s "$OPERATOR_ROOT/node_modules" "$TARGET/node_modules"
    echo "[DIMPRO worktree] node_modules -> operator symlink létrehozva."
  else
    echo "[DIMPRO worktree] package-lock eltér; node_modules nincs automatikusan létrehozva." >&2
  fi
fi
printf "[DIMPRO worktree] kész: %s · branch: %s\n" "$TARGET" "$BRANCH"
