#!/usr/bin/env bash
set -euo pipefail

cd /root/dimprover

MONITOR_DIR="/root/dimprover/.dimprover/monitor"
ADMIN_KEY_FILE="/root/dimprover/.dimprover/license/admin-key.txt"
LOG_FILE="$MONITOR_DIR/cron.log"
mkdir -p "$MONITOR_DIR"

if [ ! -f "$ADMIN_KEY_FILE" ]; then
  printf '[%s] ERROR admin key file missing: %s\n' "$(date -Is)" "$ADMIN_KEY_FILE" >> "$LOG_FILE"
  exit 1
fi

ADMIN_KEY="$(tr -d '\r\n' < "$ADMIN_KEY_FILE")"
if [ -z "$ADMIN_KEY" ]; then
  printf '[%s] ERROR admin key empty\n' "$(date -Is)" >> "$LOG_FILE"
  exit 1
fi

printf '[%s] START server monitor\n' "$(date -Is)" >> "$LOG_FILE"
HTTP_CODE="$({
  curl -sS -X POST 'http://127.0.0.1:3000/api/license/server-monitor' \
    -H "x-dimpro-license-admin-key: $ADMIN_KEY" \
    -H 'content-type: application/json' \
    --data '{"source":"cron"}' \
    -o "$MONITOR_DIR/last-cron-response.json" \
    -w '%{http_code}'
} 2>> "$LOG_FILE")"
printf '[%s] END server monitor HTTP=%s\n' "$(date -Is)" "$HTTP_CODE" >> "$LOG_FILE"

tail -n 300 "$LOG_FILE" > "$LOG_FILE.tmp" && mv "$LOG_FILE.tmp" "$LOG_FILE"

if [ "$HTTP_CODE" -lt 200 ] || [ "$HTTP_CODE" -ge 300 ]; then
  exit 1
fi
