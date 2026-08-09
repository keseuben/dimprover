#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
RELEASE=".next-v110-release-final"
EXPECTED_PREVIOUS=".next-v100-release-final"
EXPECTED_BUILD="2vjwsByoXD2z3L-36-8mm"
IDENTITY_ENV="/root/.dimpro-secrets/dimpro-identity-core.env"
STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP="$ROOT/backups/drop_v110_release_activation_$STAMP"
SECRET_BACKUP_DIR="/root/.dimpro-secrets/backups"
SECRET_BACKUP="$SECRET_BACKUP_DIR/dimpro-identity-core.env.before-drop-v110-$STAMP"
TIMER_WAS_ACTIVE="$(systemctl is-active dimpro-drop-worker-v050.timer 2>/dev/null || true)"

cd "$ROOT"
[[ -f "$RELEASE/BUILD_ID" && -f "$RELEASE/standalone/server.js" ]] || { echo "Hiányos DROP 1.1.0 release." >&2; exit 2; }
[[ "$(cat "$RELEASE/BUILD_ID")" == "$EXPECTED_BUILD" ]] || { echo "Váratlan DROP 1.1.0 BUILD_ID." >&2; exit 3; }
CURRENT="$(tr -d '\r\n' < .dimprover/active-next-release)"
if [[ "$CURRENT" == "$RELEASE" ]] && grep -qx 'DIMPRO_IDENTITY_CORE_ENABLED=true' "$IDENTITY_ENV"; then
  echo "DROP 1.1.0 már aktív."
  exit 0
fi
[[ "$CURRENT" == "$EXPECTED_PREVIOUS" ]] || { echo "Váratlan aktív release: $CURRENT" >&2; exit 4; }
[[ -f "$IDENTITY_ENV" ]] || { echo "Hiányzik az Identity Core secretfájl." >&2; exit 5; }

# A külön release-candidate szerver ne maradjon futva az aktiválás alatt.
PID="$(ss -ltnp 2>/dev/null | sed -n 's/.*127\.0\.0\.1:3120.*pid=\([0-9][0-9]*\).*/\1/p' | head -1)"
if [[ -n "$PID" ]]; then kill "$PID" || true; fi
for _ in $(seq 1 20); do ss -ltn | grep -q ':3120' || break; sleep 1; done

mkdir -p "$BACKUP" "$SECRET_BACKUP_DIR"
chmod 700 "$BACKUP" "$SECRET_BACKUP_DIR"
cp -a .dimprover/active-next-release "$BACKUP/active-next-release"
cp -a "$IDENTITY_ENV" "$SECRET_BACKUP"
chmod 600 "$BACKUP/active-next-release" "$SECRET_BACKUP"
printf '%s\n' "${BACKUP#$ROOT/}" > .work_drop_v110_release_activation_backup
printf '%s\n' "$SECRET_BACKUP" > .work_drop_v110_identity_env_backup_path
chmod 600 .work_drop_v110_release_activation_backup .work_drop_v110_identity_env_backup_path

rollback() {
  local code="${1:-1}"
  trap - ERR
  echo "[DROP 1.1.0] Aktiválási hiba, automatikus rollback indul." >&2
  cp -a "$SECRET_BACKUP" "$IDENTITY_ENV" || true
  chmod 600 "$IDENTITY_ENV" || true
  cp -a "$BACKUP/active-next-release" .dimprover/active-next-release.tmp || true
  chmod 600 .dimprover/active-next-release.tmp 2>/dev/null || true
  mv -f .dimprover/active-next-release.tmp .dimprover/active-next-release 2>/dev/null || true
  pm2 restart dimprover --update-env >/dev/null 2>&1 || true
  if [[ "$TIMER_WAS_ACTIVE" == "active" ]]; then systemctl start dimpro-drop-worker-v050.timer >/dev/null 2>&1 || true; fi
  exit "$code"
}
trap 'rollback $?' ERR

if [[ "$TIMER_WAS_ACTIVE" == "active" ]]; then systemctl stop dimpro-drop-worker-v050.timer; fi

python3 - "$IDENTITY_ENV" <<'PY'
from pathlib import Path
import os,sys,tempfile
p=Path(sys.argv[1])
lines=p.read_text().splitlines()
found=False
out=[]
for line in lines:
    if line.startswith('DIMPRO_IDENTITY_CORE_ENABLED='):
        out.append('DIMPRO_IDENTITY_CORE_ENABLED=true'); found=True
    else:
        out.append(line)
if not found: out.append('DIMPRO_IDENTITY_CORE_ENABLED=true')
tmp=p.with_name(p.name+'.tmp')
tmp.write_text('\n'.join(out)+'\n')
os.chmod(tmp,0o600)
os.replace(tmp,p)
PY

grep -qx 'DIMPRO_IDENTITY_CORE_ENABLED=true' "$IDENTITY_ENV"
printf '%s\n' "$RELEASE" > .dimprover/active-next-release.tmp
chmod 600 .dimprover/active-next-release.tmp
mv -f .dimprover/active-next-release.tmp .dimprover/active-next-release

pm2 restart dimprover --update-env

READY=0
for _ in $(seq 1 90); do
  if curl -fsS --max-time 8 -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health > /tmp/drop-v110-live-health.json 2>/dev/null \
    && curl -fsS --max-time 8 -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/dimpro-identity/health > /tmp/drop-v110-live-identity.json 2>/dev/null; then
    READY=1; break
  fi
  sleep 2
done
[[ "$READY" == "1" ]]
node - <<'NODE'
const fs=require('fs');
const h=JSON.parse(fs.readFileSync('/tmp/drop-v110-live-health.json','utf8'));
const i=JSON.parse(fs.readFileSync('/tmp/drop-v110-live-identity.json','utf8'));
if(h.version!=='DROP 1.1.0') throw new Error(`Várt DROP 1.1.0, kapott ${h.version}`);
if(h.identityCore?.consumerReady!==true || h.readiness?.dimproSend!==true) throw new Error('A Drop Identity consumer nem READY.');
const checks=i.checks||{}; if(i.ready!==true || Object.keys(checks).length!==12 || !Object.values(checks).every(Boolean)) throw new Error('Identity Core health nem 12/12 READY.');
console.log(JSON.stringify({ok:true,dropVersion:h.version,identityReady:i.ready,identityChecks:Object.keys(checks).length},null,2));
NODE

curl -fsS --max-time 15 https://drop.dimpro.hu/api/drop/health > /tmp/drop-v110-live-https-health.json
node - <<'NODE'
const fs=require('fs');const h=JSON.parse(fs.readFileSync('/tmp/drop-v110-live-https-health.json','utf8'));
if(h.version!=='DROP 1.1.0'||h.identityCore?.consumerReady!==true) throw new Error('A HTTPS Drop health nem DROP 1.1.0 Identity READY.');
NODE

pm2 save >/dev/null
if [[ "$TIMER_WAS_ACTIVE" == "active" ]]; then systemctl start dimpro-drop-worker-v050.timer; fi
trap - ERR

echo "DROP 1.1.0 aktiválva. Release: $RELEASE; build: $EXPECTED_BUILD; rollback: $EXPECTED_PREVIOUS"
