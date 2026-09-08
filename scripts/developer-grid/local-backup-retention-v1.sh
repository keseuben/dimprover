#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
[[ "$(hostname)" == "dimpro-dev" ]] || exit 41
[[ "$ROOT" == "/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905" ]] || exit 42
[[ "${DIMPRO_PRODUCTION_ACCESS:-DENY}" != "ALLOW" ]] || exit 43
export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-OutminAI}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-DEV verified local backup retention}"
export DIMPRO_WORKER_CODE="OUTMINAI"
export DIMPRO_OPERATION_WAIT_SECONDS="${DIMPRO_OPERATION_WAIT_SECONDS:-300}"
exec "$ROOT/scripts/dimpro-coordinated-operation.sh" maintenance -- env DIMPRO_LOCAL_RETENTION_COORDINATED=1 /usr/bin/python3 "$ROOT/scripts/developer-grid/local-backup-retention-v1.py" "$@"
