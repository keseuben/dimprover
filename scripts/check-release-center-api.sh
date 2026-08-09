#!/usr/bin/env bash
set -euo pipefail
cd /root/dimprover
ADMIN_KEY_FILE="/root/dimprover/.dimprover/license/admin-key.txt"
if [ ! -f "$ADMIN_KEY_FILE" ]; then
  echo "ADMIN_KEY_FILE_MISSING"
  exit 1
fi
ADMIN_KEY="$(tr -d '\r\n' < "$ADMIN_KEY_FILE")"
RESPONSE_FILE="/tmp/dimpro_release_center_api_response.json"
curl -sS \
  -H "x-dimpro-license-admin-key: ${ADMIN_KEY}" \
  -H "accept: application/json" \
  "http://127.0.0.1:3000/api/license/release-center" > "$RESPONSE_FILE"
python3 - <<'PY'
import json
from pathlib import Path
p=Path('/tmp/dimpro_release_center_api_response.json')
data=json.loads(p.read_text())
releases=data.get('store',{}).get('releases',[])
stages=data.get('stages',[])
print('RELEASE_API_OK=', data.get('ok'))
print('RELEASES=', len(releases))
print('FIRST=', releases[0].get('title') if releases else '-')
print('STAGES=', ', '.join(f"{s.get('id')}:{s.get('status')}" for s in stages))
print('STORAGE=', data.get('storage',{}).get('file') or data.get('config',{}).get('storageFile'))
PY
