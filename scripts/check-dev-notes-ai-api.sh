#!/usr/bin/env bash
set -euo pipefail
cd /root/dimprover
ADMIN_KEY_FILE="/root/dimprover/.dimprover/license/admin-key.txt"
if [ ! -f "$ADMIN_KEY_FILE" ]; then
  echo "ADMIN_KEY_FILE_MISSING"
  exit 1
fi
ADMIN_KEY="$(tr -d '\r\n' < "$ADMIN_KEY_FILE")"
RESPONSE_FILE="/tmp/dimpro_dev_notes_ai_api_response.json"
curl -sS \
  -H "x-dimpro-license-admin-key: ${ADMIN_KEY}" \
  -H "accept: application/json" \
  "http://127.0.0.1:3000/api/license/dev-notes-ai" > "$RESPONSE_FILE"
python3 - <<'PY'
import json
from pathlib import Path
p=Path('/tmp/dimpro_dev_notes_ai_api_response.json')
data=json.loads(p.read_text())
print('AI_API_OK=', data.get('ok'))
print('AI_CONFIGURED=', data.get('configured'))
print('AI_ENABLED=', data.get('enabled'))
print('ACTIONS=', len(data.get('actions', [])))
print('MODEL=', data.get('model'))
print('USAGE_TODAY=', data.get('usage', {}).get('dailyEstimatedUsd'))
print('NOTE=', data.get('note'))
PY
