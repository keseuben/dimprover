#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="/root/dimprover"
RELEASE=".next-v123-release-final"
EXPECTED_PREVIOUS=".next-v122-release-final"
EXPECTED_BUILD="Vgc0cCBB8Qp0ZHQmPY8g5"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$ROOT/backups/drop_v123_release_activation_$STAMP"
TIMER_WAS_ACTIVE="$(systemctl is-active dimpro-drop-worker-v050.timer 2>/dev/null || true)"

cd "$ROOT"
[[ -f "$RELEASE/BUILD_ID" && -f "$RELEASE/standalone/server.js" ]] || { echo "Hiányos DROP 1.2.3 release." >&2; exit 2; }
[[ "$(cat "$RELEASE/BUILD_ID")" == "$EXPECTED_BUILD" ]] || { echo "Váratlan DROP 1.2.3 BUILD_ID." >&2; exit 3; }
CURRENT="$(tr -d '\r\n' < .dimprover/active-next-release)"
if [[ "$CURRENT" == "$RELEASE" ]]; then
  echo "DROP 1.2.3 már aktív."
  exit 0
fi
[[ "$CURRENT" == "$EXPECTED_PREVIOUS" ]] || { echo "Váratlan aktív release: $CURRENT" >&2; exit 4; }

PID="$(ss -ltnp 2>/dev/null | sed -n 's/.*127\.0\.0\.1:3120.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)"
if [[ -n "$PID" ]]; then kill "$PID" || true; fi
for _ in $(seq 1 20); do ss -ltn | grep -q ':3120' || break; sleep 1; done

mkdir -p "$BACKUP"
chmod 700 "$BACKUP"
cp -a .dimprover/active-next-release "$BACKUP/active-next-release"
pm2 jlist > "$BACKUP/pm2-before.json"
curl -fsS --max-time 15 https://drop.dimpro.hu/api/drop/health > "$BACKUP/drop-health-before.json"
chmod 600 "$BACKUP/active-next-release" "$BACKUP/pm2-before.json" "$BACKUP/drop-health-before.json"
printf '%s\n' "${BACKUP#$ROOT/}" > .work_drop_v123_release_activation_backup
chmod 600 .work_drop_v123_release_activation_backup

rollback() {
  local code="${1:-1}"
  trap - ERR
  echo "[DROP 1.2.3] Aktiválási hiba, automatikus rollback indul." >&2
  cp -a "$BACKUP/active-next-release" .dimprover/active-next-release.tmp || true
  chmod 600 .dimprover/active-next-release.tmp 2>/dev/null || true
  mv -f .dimprover/active-next-release.tmp .dimprover/active-next-release 2>/dev/null || true
  NEXT_DIST_DIR="$EXPECTED_PREVIOUS" pm2 restart dimprover --update-env >/dev/null 2>&1 || true
  if [[ "$TIMER_WAS_ACTIVE" == "active" ]]; then systemctl start dimpro-drop-worker-v050.timer >/dev/null 2>&1 || true; fi
  exit "$code"
}
trap 'rollback $?' ERR

if [[ "$TIMER_WAS_ACTIVE" == "active" ]]; then systemctl stop dimpro-drop-worker-v050.timer; fi

printf '%s\n' "$RELEASE" > .dimprover/active-next-release.tmp
chmod 600 .dimprover/active-next-release.tmp
mv -f .dimprover/active-next-release.tmp .dimprover/active-next-release

NEXT_DIST_DIR="$RELEASE" pm2 restart dimprover --update-env

READY=0
for _ in $(seq 1 90); do
  if curl -fsS --max-time 8 -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health > /tmp/drop-v123-live-health.json 2>/dev/null \
    && curl -fsS --max-time 8 -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/dimpro-identity/health > /tmp/drop-v123-live-identity.json 2>/dev/null; then
    READY=1
    break
  fi
  sleep 2
done
[[ "$READY" == "1" ]]

node - <<'NODE'
const fs=require('fs');
const h=JSON.parse(fs.readFileSync('/tmp/drop-v123-live-health.json','utf8'));
const i=JSON.parse(fs.readFileSync('/tmp/drop-v123-live-identity.json','utf8'));
if(h.version!=='DROP 1.2.3') throw new Error(`Várt DROP 1.2.3, kapott ${h.version}`);
if(h.readiness?.identityCoreConsumer!==true || h.readiness?.dimproSend!==true) throw new Error('A Drop Identity consumer vagy DIMPRO Send nem READY.');
const checks=i.checks||{};
if(i.ready!==true || i.enabled!==true || Object.keys(checks).length!==12 || !Object.values(checks).every(Boolean)) throw new Error('Identity Core health nem 12/12 READY.');
console.log(JSON.stringify({ok:true,dropVersion:h.version,identityReady:i.ready,identityChecks:Object.keys(checks).length},null,2));
NODE

curl -fsS --max-time 15 https://drop.dimpro.hu/api/drop/health > /tmp/drop-v123-live-https-health.json
node - <<'NODE'
const fs=require('fs');
const h=JSON.parse(fs.readFileSync('/tmp/drop-v123-live-https-health.json','utf8'));
if(h.version!=='DROP 1.2.3' || h.readiness?.identityCoreConsumer!==true || h.readiness?.dimproSend!==true) throw new Error('A HTTPS Drop health nem DROP 1.2.3 READY.');
NODE

pm2 save >/dev/null
if [[ "$TIMER_WAS_ACTIVE" == "active" ]]; then systemctl start dimpro-drop-worker-v050.timer; fi
trap - ERR

echo "DROP 1.2.3 aktiválva. Release: $RELEASE; build: $EXPECTED_BUILD; rollback: $EXPECTED_PREVIOUS"
