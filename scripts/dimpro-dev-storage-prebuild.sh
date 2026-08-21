#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEV_ROOT="${DIMPRO_DEV_ROOT:-/srv/dimpro-dev}"
CONFIG="${DIMPRO_RETENTION_CONFIG:-$ROOT/config/dimpro-dev-storage-retention.json}"

# This guard is intentionally DEV-only. PROD and local developer machines are not storage-cleanup targets.
case "$ROOT" in
  "$DEV_ROOT"/*) ;;
  *) exit 0 ;;
esac

if [[ ! -f "$CONFIG" ]]; then
  echo "[DIMPRO pre-build storage] Hiányzó retention konfiguráció: $CONFIG" >&2
  exit 78
fi

read -r TARGET_GIB HARD_MIN_GIB WARNING_PCT CRITICAL_PCT EMERGENCY_PCT < <(
  node - "$CONFIG" <<'NODE'
const fs=require('fs');
const c=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const vals=[c.targetFreeGiB,c.preBuildHardMinFreeGiB,c.warningUsedPercent,c.criticalUsedPercent,c.emergencyUsedPercent];
if(vals.some(v=>!Number.isFinite(Number(v)))) process.exit(2);
process.stdout.write(vals.map(Number).join(' ')+'\n');
NODE
)
TARGET_BYTES=$((TARGET_GIB * 1024 * 1024 * 1024))
HARD_MIN_BYTES=$((HARD_MIN_GIB * 1024 * 1024 * 1024))

disk_state() {
  df -Pk "$DEV_ROOT" | awk 'END { printf "%s %s\n", $4*1024, substr($5,1,length($5)-1) }'
}

read -r FREE_BYTES USED_PCT < <(disk_state)
printf '[DIMPRO pre-build storage] free=%.2f GiB used=%s%% target=%s GiB hard-min=%s GiB\n' \
  "$(awk -v b="$FREE_BYTES" 'BEGIN{print b/1024/1024/1024}')" "$USED_PCT" "$TARGET_GIB" "$HARD_MIN_GIB"

# Normal cleanup: old build outputs only.
if (( FREE_BYTES < TARGET_BYTES || USED_PCT >= WARNING_PCT )); then
  DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-DIMPRO Build Preflight}" \
  DIMPRO_OPERATION_TASK="Pre-build storage retention" \
    "$ROOT/scripts/dimpro-dev-storage-retention.sh" --config="$CONFIG" --quiet
  read -r FREE_BYTES USED_PCT < <(disk_state)
fi

# Critical fallback: clean+merged+inactive independent dependencies may also be pruned.
if (( FREE_BYTES < HARD_MIN_BYTES || USED_PCT >= CRITICAL_PCT )); then
  DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-DIMPRO Build Preflight}" \
  DIMPRO_OPERATION_TASK="Pre-build critical storage retention" \
    "$ROOT/scripts/dimpro-dev-storage-retention.sh" --config="$CONFIG" --prune-dependencies --quiet
  read -r FREE_BYTES USED_PCT < <(disk_state)
fi

if (( FREE_BYTES < HARD_MIN_BYTES || USED_PCT >= EMERGENCY_PCT )); then
  printf '[DIMPRO pre-build storage] BUILD BLOKKOLVA: free=%.2f GiB used=%s%%; minimum=%s GiB, emergency=%s%%.\n' \
    "$(awk -v b="$FREE_BYTES" 'BEGIN{print b/1024/1024/1024}')" "$USED_PCT" "$HARD_MIN_GIB" "$EMERGENCY_PCT" >&2
  exit 75
fi

printf '[DIMPRO pre-build storage] PASS: free=%.2f GiB used=%s%%.\n' \
  "$(awk -v b="$FREE_BYTES" 'BEGIN{print b/1024/1024/1024}')" "$USED_PCT"
