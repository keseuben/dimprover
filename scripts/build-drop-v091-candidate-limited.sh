#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/dimprover
TARGET=".next-v091-candidate"
LOG=".work_drop_v091_build.log"
EXIT_FILE=".work_drop_v091_build.exit"
cleanup_services() {
  systemctl start clamav-daemon >/dev/null 2>&1 || true
  systemctl start dimpro-drop-worker-v050.timer >/dev/null 2>&1 || true
}
trap cleanup_services EXIT
rm -f "$EXIT_FILE"
systemctl stop dimpro-drop-worker-v050.timer >/dev/null 2>&1 || true
systemctl stop clamav-daemon >/dev/null 2>&1 || true
sleep 3
rm -rf "$TARGET"
set +e
NEXT_DIST_DIR="$TARGET" NEXT_SAFE_BUILD=1 NEXT_BUILD_CPUS=1 NODE_OPTIONS="--max-old-space-size=2100" ./node_modules/.bin/next build --webpack >"$LOG" 2>&1
CODE=$?
if [[ "$CODE" -eq 0 ]]; then
  NEXT_DIST_DIR="$TARGET" node scripts/ensure-next-standalone-assets.cjs --force >>"$LOG" 2>&1
  CODE=$?
fi
set -e
printf '%s\n' "$CODE" > "$EXIT_FILE"
exit "$CODE"
