#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
ID="${1:-}"
[[ "$ID" =~ ^dev-delivery-[0-9a-f]{32}$ ]] || exit 64
[[ "$(hostname)" == dimpro-dev ]] || exit 64
DIR=/srv/dimpro-dev/coordination/developer-grid/dev-deliveries
mkdir -p "$DIR"
chmod 700 "$DIR"
# A single watcher per delivery; kernel lock is released after process death.
exec 8>"$DIR/$ID.job.lock"
flock -n 8 || exit 0
export DIMPRO_OPERATION_OWNER=BENJADMIN_CENTRAL_CORE
export DIMPRO_OPERATION_TASK="$ID"
export DIMPRO_OPERATION_WAIT_SECONDS=30
export DIMPRO_PRODUCTION_ACCESS=DENY
for ((attempt=0; attempt<65; attempt++)); do
  # The global release lock is released between checks; builds and other DEV operations can run.
  bash "$ROOT/scripts/dimpro-coordinated-operation.sh" release -- node "$ROOT/scripts/developer-grid/dev-delivery-engine.mjs" "$ID" >>"$DIR/$ID.job.log" 2>&1 || true
  STATUS="$(node -e 'const fs=require("fs");const x=JSON.parse(fs.readFileSync(process.argv[1]));process.stdout.write(x.status)' "$DIR/$ID.json")"
  [[ "$STATUS" == PUBLIC_PENDING_BROWSER ]] || exit 0
  sleep 30
done
exit 1
