#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-DIMPRO Storage Retention}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-DEV storage retention}"
exec "$ROOT/scripts/dimpro-coordinated-operation.sh" maintenance -- \
  node "$ROOT/scripts/dimpro-dev-storage-retention.mjs" --apply-builds "$@"
