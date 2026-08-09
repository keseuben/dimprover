#!/usr/bin/env bash
set -euo pipefail
cd /root/dimprover
KEY="$(node -r ./scripts/load-next-env.cjs -e 'process.stdout.write(String(process.env.MEETING_TRANSCRIPT_WATCH_KEY || process.env.DIMPRO_SERVER_MONITOR_KEY || ""))')"
if [ -z "$KEY" ]; then
  echo "Meeting artifact watch key is not configured." >&2
  exit 1
fi
curl -fsS -X POST 'http://127.0.0.1:3000/api/meeting-assistant/artifact-watch' \
  -H "x-dimpro-meeting-watch-key: $KEY" \
  -H 'content-type: application/json'
