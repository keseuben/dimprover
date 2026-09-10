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
# A megadott operator root symlinkes dependency-fája ezért nem használható forrásként;
# ilyenkor a canonical Operator UI valódi node_modules könyvtára a biztonságos fallback.
DEPENDENCY_SOURCE_ROOT=""
for CANDIDATE_ROOT in "$OPERATOR_ROOT" "/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2"; do
  [[ -n "$DEPENDENCY_SOURCE_ROOT" ]] && break
  [[ -f "$CANDIDATE_ROOT/package-lock.json" ]] || continue
  [[ -d "$CANDIDATE_ROOT/node_modules" ]] || continue
  [[ ! -L "$CANDIDATE_ROOT/node_modules" ]] || continue
  [[ -f "$TARGET/package-lock.json" ]] || continue
  SOURCE_HASH="$(sha256sum "$CANDIDATE_ROOT/package-lock.json" | cut -d' ' -f1)"
  WT_HASH="$(sha256sum "$TARGET/package-lock.json" | cut -d' ' -f1)"
  [[ "$SOURCE_HASH" == "$WT_HASH" ]] || continue
  DEPENDENCY_SOURCE_ROOT="$CANDIDATE_ROOT"
done

if [[ -n "$DEPENDENCY_SOURCE_ROOT" ]]; then
  if [[ ! -e "$TARGET/node_modules" && ! -L "$TARGET/node_modules" ]]; then
    cp -al "$DEPENDENCY_SOURCE_ROOT/node_modules" "$TARGET/node_modules"
    if [[ -L "$TARGET/node_modules" || ! -d "$TARGET/node_modules" ]]; then
      echo "[DIMPRO worktree] A létrejött node_modules nem valódi könyvtár; worktree dependency setup megszakítva." >&2
      exit 1
    fi
    echo "[DIMPRO worktree] node_modules hardlinkelt dependency-fa létrehozva: $DEPENDENCY_SOURCE_ROOT"
  else
    echo "[DIMPRO worktree] node_modules már létezik; nem módosítom." >&2
  fi
else
  echo "[DIMPRO worktree] Nincs Turbopack-safe, lockfile-azonos valódi node_modules forrás; dependency-fa nincs automatikusan létrehozva." >&2
fi

printf "[DIMPRO worktree] kész: %s · branch: %s\n" "$TARGET" "$BRANCH"
