#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
if [[ -n "${DIMPRO_COORDINATION_ROOT:-}" ]]; then
  COORDINATION_ROOT="$DIMPRO_COORDINATION_ROOT"
elif [[ "$ROOT" == /srv/dimpro-dev/* ]]; then
  COORDINATION_ROOT="/srv/dimpro-dev/coordination"
else
  COORDINATION_ROOT="$ROOT/.dimprover"
fi
LOCK_DIR="$COORDINATION_ROOT/locks"
LOCK_FILE="$LOCK_DIR/exclusive-operation.lock"
STATE_FILE="$COORDINATION_ROOT/active-development.json"
HISTORY_FILE="$COORDINATION_ROOT/development-operations.jsonl"

OPERATION="${1:-}"
if [[ -z "$OPERATION" ]]; then
  echo "Használat: $0 <build|release|migration|restart|maintenance> [--] <parancs> [argumentumok...]" >&2
  exit 64
fi
shift
if [[ "${1:-}" == "--" ]]; then shift; fi
if [[ "$#" -eq 0 ]]; then
  echo "A végrehajtandó parancs hiányzik." >&2
  exit 64
fi

case "$OPERATION" in
  build|release|migration|restart|maintenance) ;;
  *)
    echo "Nem támogatott kizárólagos művelet: $OPERATION" >&2
    exit 64
    ;;
esac

mkdir -p "$COORDINATION_ROOT" "$LOCK_DIR"
chmod 700 "$COORDINATION_ROOT" "$LOCK_DIR" 2>/dev/null || true
touch "$LOCK_FILE" "$HISTORY_FILE"
chmod 600 "$LOCK_FILE" "$HISTORY_FILE" 2>/dev/null || true

OWNER="${DIMPRO_OPERATION_OWNER:-${DIMPRO_BUILD_OWNER:-${USER:-unknown}}}"
TASK="${DIMPRO_OPERATION_TASK:-$OPERATION}"
TARGET="${NEXT_DIST_DIR:-}"
WORKER_CODE="${DIMPRO_WORKER_CODE:-}"
if [[ -z "$WORKER_CODE" ]]; then
  OWNER_HINT="$(printf "%s %s" "$OWNER" "$TASK" | tr "[:upper:]" "[:lower:]")"
  case "$OWNER_HINT" in
    *armin*) WORKER_CODE="ARMINAI" ;;
    *jazmin*|drop-*|*\ drop-*|field-capture-*|*\ field-capture-*|terep-*|*\ terep-*|terepi-*|*\ terepi-*) WORKER_CODE="JAZMINAI" ;;
    *outmin*) WORKER_CODE="OUTMINAI" ;;
    *mforge*|*m-forge*) WORKER_CODE="MFORGE" ;;
    *vguard*|*v-guard*) WORKER_CODE="VGUARD" ;;
  esac
fi
WAIT_SECONDS="${DIMPRO_OPERATION_WAIT_SECONDS:-7200}"
HOST="$(hostname)"
BOOT_ID="$(cat /proc/sys/kernel/random/boot_id 2>/dev/null || true)"
COMMAND_DISPLAY="$(printf '%q ' "$@")"
COORDINATOR_PID="$$"

exec 9>"$LOCK_FILE"
echo "[DIMPRO koordinátor] Várakozás a központi műveleti zárra: $OPERATION · $OWNER"
if ! flock -w "$WAIT_SECONDS" 9; then
  echo "[DIMPRO koordinátor] A műveleti zár $WAIT_SECONDS másodpercen belül nem szabadult fel." >&2
  [[ -f "$STATE_FILE" ]] && cat "$STATE_FILE" >&2 || true
  exit 75
fi

# A fájlzár kernel által kezelt, ezért újraindításkor automatikusan felszabadul.
# Az állapotfájl viszont megmaradhat; ezt a következő művelet megszerzésekor
# megszakítottként naplózzuk, majd eltávolítjuk.
export STATE_FILE HISTORY_FILE BOOT_ID
node <<'NODE'
const fs = require('node:fs');
if (!fs.existsSync(process.env.STATE_FILE)) process.exit(0);
let state = null;
try { state = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8')); } catch {}
const interrupted = {
  ...(state || {}),
  status: 'interrupted',
  event: 'interrupted',
  detectedAt: new Date().toISOString(),
  detectedBootId: process.env.BOOT_ID || null,
  reason: state?.bootId && state.bootId !== process.env.BOOT_ID
    ? 'server_restarted'
    : 'stale_state_without_active_lock',
};
fs.appendFileSync(process.env.HISTORY_FILE, `${JSON.stringify(interrupted)}\n`, { mode: 0o600 });
try { fs.unlinkSync(process.env.STATE_FILE); } catch {}
NODE

STARTED_AT="$(date --iso-8601=seconds)"
export STATE_FILE HISTORY_FILE OPERATION OWNER TASK TARGET WORKER_CODE HOST BOOT_ID COMMAND_DISPLAY STARTED_AT COORDINATOR_PID
node <<'NODE'
const fs = require('node:fs');
const state = {
  schemaVersion: 1,
  status: 'running',
  operation: process.env.OPERATION,
  owner: process.env.OWNER,
  task: process.env.TASK,
  target: process.env.TARGET || null,
  workerCode: process.env.WORKER_CODE || null,
  host: process.env.HOST,
  bootId: process.env.BOOT_ID || null,
  pid: Number(process.env.COORDINATOR_PID),
  command: process.env.COMMAND_DISPLAY.trim(),
  startedAt: process.env.STARTED_AT,
};
fs.writeFileSync(process.env.STATE_FILE, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
fs.appendFileSync(process.env.HISTORY_FILE, `${JSON.stringify({ ...state, event: 'started' })}\n`, { mode: 0o600 });
NODE
chmod 600 "$STATE_FILE" 2>/dev/null || true

echo "[DIMPRO koordinátor] Zár megszerezve: $OPERATION · $OWNER · cél: ${TARGET:-nincs}"
EXIT_CODE=0
set +e
(
  cd "$ROOT"
  "$@"
)
EXIT_CODE=$?
set -e

FINISHED_AT="$(date --iso-8601=seconds)"
export FINISHED_AT EXIT_CODE
node <<'NODE'
const fs = require('node:fs');
let current = {};
try { current = JSON.parse(fs.readFileSync(process.env.STATE_FILE, 'utf8')); } catch {}
const finished = {
  ...current,
  status: Number(process.env.EXIT_CODE) === 0 ? 'completed' : 'failed',
  finishedAt: process.env.FINISHED_AT,
  exitCode: Number(process.env.EXIT_CODE),
  event: 'finished',
};
fs.appendFileSync(process.env.HISTORY_FILE, `${JSON.stringify(finished)}\n`, { mode: 0o600 });
try { fs.unlinkSync(process.env.STATE_FILE); } catch {}
NODE

if [[ "$EXIT_CODE" -eq 0 ]]; then
  echo "[DIMPRO koordinátor] Művelet sikeresen befejeződött: $OPERATION · $OWNER"
else
  echo "[DIMPRO koordinátor] Művelet hibával állt le: $OPERATION · $OWNER · exit=$EXIT_CODE" >&2
fi
exit "$EXIT_CODE"
