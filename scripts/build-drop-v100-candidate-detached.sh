#!/usr/bin/env bash
set -Eeuo pipefail
cd /root/dimprover
TARGET=".next-v100-candidate"
SOURCE_CACHE=".next-v099-release-final/cache"
LOG=".work_drop_v100_build_latest.log"
EXIT_FILE=".work_drop_v100_build_latest.exit"
rm -f "$EXIT_FILE"
rm -rf "$TARGET"
mkdir -p "$TARGET"
if [[ -d "$SOURCE_CACHE" ]]; then cp -a "$SOURCE_CACHE" "$TARGET/cache"; fi
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
