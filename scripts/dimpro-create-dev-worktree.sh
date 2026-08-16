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

if [[ ! "$NAME" =~ ^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$ ]]; then
  echo "Érvénytelen worktree név: $NAME" >&2
  exit 64
fi

WORKTREES_ROOT="$(realpath -m "$WORKTREES_ROOT")"
OPERATOR_ROOT="$(realpath -m "$OPERATOR_ROOT")"
TARGET="$(realpath -m "$WORKTREES_ROOT/$NAME")"

if [[ "$TARGET" == "$OPERATOR_ROOT" || "$(dirname "$TARGET")" != "$WORKTREES_ROOT" ]]; then
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

# Dependency retention szabály:
# azonos package-lock.json esetén Turbopack-kompatibilis hardlinkelt node_modules fa készül.
# Külső node_modules symlink TILOS, mert a Turbopack a projektgyökéren kívüli symlinket elutasítja.
if [[ -d "$OPERATOR_ROOT/node_modules" && -f "$OPERATOR_ROOT/package-lock.json" && -f "$TARGET/package-lock.json" ]]; then
  OP_HASH="$(sha256sum "$OPERATOR_ROOT/package-lock.json" | cut -d' ' -f1)"
  WT_HASH="$(sha256sum "$TARGET/package-lock.json" | cut -d' ' -f1)"
  if [[ "$OP_HASH" == "$WT_HASH" ]]; then
    if [[ ! -e "$TARGET/node_modules" && ! -L "$TARGET/node_modules" ]]; then
      cp -al "$OPERATOR_ROOT/node_modules" "$TARGET/node_modules"
      echo "[DIMPRO worktree] node_modules hardlinkelt dependency-fa létrehozva."
    else
      echo "[DIMPRO worktree] node_modules már létezik; nem módosítom." >&2
    fi
  else
    echo "[DIMPRO worktree] package-lock eltér; node_modules nincs automatikusan létrehozva." >&2
  fi
fi

printf "[DIMPRO worktree] kész: %s · branch: %s\n" "$TARGET" "$BRANCH"
