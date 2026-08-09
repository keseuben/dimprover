#!/usr/bin/env bash
set -euo pipefail
cd /root/dimprover
ADMIN_KEY_FILE="/root/dimprover/.dimprover/license/admin-key.txt"
if [ ! -f "$ADMIN_KEY_FILE" ]; then
  echo "ADMIN_KEY_FILE_MISSING"
  exit 1
fi
ADMIN_KEY="$(tr -d '\r\n' < "$ADMIN_KEY_FILE")"
RESPONSE_FILE="/tmp/dimpro_dev_notes_api_response.json"
curl -sS \
  -H "x-dimpro-license-admin-key: ${ADMIN_KEY}" \
  -H "accept: application/json" \
  "http://127.0.0.1:3000/api/license/dev-notes" > "$RESPONSE_FILE"
python3 - <<'PY'
import json
from pathlib import Path
p=Path('/tmp/dimpro_dev_notes_api_response.json')
data=json.loads(p.read_text())
notes=data.get('store',{}).get('notes',[])
print('API_OK=', data.get('ok'))
print('NOTES=', len(notes))
print('FIRST=', notes[0].get('title') if notes else '-')
print('STORAGE=', data.get('storage',{}).get('file'))
PY
