#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED_ROOT="${BENJADMIN_DEV_CANONICAL_ROOT:-/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905}"
EXPECTED_HOST="dimpro-dev"
EXPECTED_BRANCH="${BENJADMIN_DEV_CANONICAL_BRANCH:-feature/benjadmin-developer-grid-v013-outminai-20260905}"
EXPECTED_COMMON="${BENJADMIN_DEV_CANONICAL_GIT:-/srv/dimpro-dev/repositories/dimprover.git}"

[[ "$EXPECTED_ROOT" == /srv/dimpro-dev/worktrees/* ]] || { echo "CANONICAL_DEV_WORKTREE_ENV_DENIED" >&2; exit 40; }
[[ "$EXPECTED_COMMON" == "/srv/dimpro-dev/repositories/dimprover.git" ]] || { echo "CANONICAL_DEV_REPOSITORY_ENV_DENIED" >&2; exit 40; }
git check-ref-format --branch "$EXPECTED_BRANCH" >/dev/null 2>&1 || { echo "CANONICAL_DEV_BRANCH_ENV_INVALID" >&2; exit 40; }
[[ "$(hostname)" == "$EXPECTED_HOST" ]] || { echo "RELEASE_HOST_MISMATCH" >&2; exit 41; }
[[ "$ROOT" == "$EXPECTED_ROOT" ]] || { echo "SOURCE_BASELINE_MISMATCH · worktree" >&2; exit 42; }
[[ "$(git -C "$ROOT" branch --show-current)" == "$EXPECTED_BRANCH" ]] || { echo "SOURCE_BASELINE_MISMATCH · branch" >&2; exit 43; }
COMMON="$(readlink -f "$(git -C "$ROOT" rev-parse --git-common-dir)")"
[[ "$COMMON" == "$EXPECTED_COMMON" ]] || { echo "SOURCE_BASELINE_MISMATCH · repository" >&2; exit 43; }
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || { echo "SOURCE_WORKTREE_DIRTY" >&2; exit 44; }
[[ "${DIMPRO_PRODUCTION_ACCESS:-DENY}" != "ALLOW" ]] || { echo "PROD_DENY" >&2; exit 45; }

export DIMPRO_RELEASE_COORDINATED=1
export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-OutminAI}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-Developer Grid DEV artifact release}"
export DIMPRO_WORKER_CODE="${DIMPRO_WORKER_CODE:-OUTMINAI}"

exec "$ROOT/scripts/dimpro-coordinated-operation.sh" release -- \
  env DIMPRO_RELEASE_COORDINATED=1 node "$ROOT/scripts/developer-grid/release-artifact-engine.mjs" "$@"
