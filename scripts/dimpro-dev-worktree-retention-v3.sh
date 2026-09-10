#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-DIMPRO Worktree Retention V3}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-DEV automatic worktree retention}"
exec "$ROOT/scripts/dimpro-coordinated-operation.sh" maintenance -- \
  node "$ROOT/scripts/dimpro-dev-worktree-retention-v3.mjs" \
  --apply \
  --operator-root="$ROOT" \
  --config="$ROOT/config/dimpro-dev-storage-retention.json" \
  "$@"
