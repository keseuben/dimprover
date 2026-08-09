#!/usr/bin/env bash
set -euo pipefail
cd /root/dimprover
ADMIN_KEY_FILE="/root/dimprover/.dimprover/license/admin-key.txt"
if [ ! -f "$ADMIN_KEY_FILE" ]; then
  echo "ADMIN_KEY_FILE_MISSING"
  exit 1
fi
ADMIN_KEY="$(tr -d '\r\n' < "$ADMIN_KEY_FILE")"
GET_RESPONSE_FILE="/tmp/dimpro_server_monitor_email_get.json"
TEST_RESPONSE_FILE="/tmp/dimpro_server_monitor_email_test.json"
curl -sS \
  -H "x-dimpro-license-admin-key: ${ADMIN_KEY}" \
  -H "accept: application/json" \
  "http://127.0.0.1:3000/api/license/server-monitor?limit=20" > "$GET_RESPONSE_FILE"
curl -sS \
  -X POST \
  -H "x-dimpro-license-admin-key: ${ADMIN_KEY}" \
  -H "accept: application/json" \
  -H "content-type: application/json" \
  -d '{"action":"testEmail"}' \
  "http://127.0.0.1:3000/api/license/server-monitor?limit=20" > "$TEST_RESPONSE_FILE"
python3 - <<'PY'
import json
from pathlib import Path
get_data=json.loads(Path('/tmp/dimpro_server_monitor_email_get.json').read_text())
test_data=json.loads(Path('/tmp/dimpro_server_monitor_email_test.json').read_text())
config=get_data.get('config',{})
email_test=test_data.get('emailTest',{})
print('MONITOR_API_OK=', get_data.get('ok'))
print('SMTP_CONFIGURED=', config.get('smtpConfigured'))
print('EMAIL_ENABLED=', config.get('emailEnabled'))
print('RECIPIENTS=', len(config.get('emailRecipients') or []))
print('EMAIL_TEST_SENT=', email_test.get('sent'))
print('EMAIL_TEST_REASON=', email_test.get('reason'))
print('EMAIL_TEST_LOGS=', len(test_data.get('emailTests') or []))
print('EMAIL_TEST_LOG_FILE=', config.get('emailTestLogFile'))
PY
