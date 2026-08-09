#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/dimprover
CANDIDATE=".next-drop-invite-fix-release"
EXIT_FILE=".work_drop_invite_fix_limited.exit"
LOG_FILE=".work_drop_invite_fix_limited.log"
rm -f "$EXIT_FILE"
: > "$LOG_FILE"
restore_services() {
  systemctl start clamav-daemon >/dev/null 2>&1 || true
  systemctl start dimpro-drop-worker-v050.timer >/dev/null 2>&1 || true
}
finish() {
  code=$?
  restore_services
  printf '%s\n' "$code" > "$EXIT_FILE"
  exit "$code"
}
trap finish EXIT INT TERM
systemctl stop dimpro-drop-worker-v050.timer >/dev/null 2>&1 || true
systemctl stop clamav-daemon >/dev/null 2>&1 || true
rm -rf "$CANDIDATE"
export NEXT_DIST_DIR="$CANDIDATE"
export NEXT_TELEMETRY_DISABLED=1
export NODE_OPTIONS="--max-old-space-size=1536"
printf '[%s] Limited DROP invite build started\n' "$(date -Is)" | tee -a "$LOG_FILE"
timeout --signal=TERM --kill-after=30s 840s npm run build 2>&1 | tee -a "$LOG_FILE"
printf '[%s] Limited DROP invite build completed\n' "$(date -Is)" | tee -a "$LOG_FILE"
