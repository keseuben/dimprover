#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
REF="$ROOT/.work_drop_v096_release_activation_backup"
[[ -f "$REF" ]] || { echo "Hiányzó DROP 0.9.6 aktiválási mentéshivatkozás." >&2; exit 2; }
BACKUP="$(cat "$REF")"
case "$BACKUP" in backups/*) BACKUP="$ROOT/$BACKUP" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen mentési útvonal." >&2; exit 3 ;; esac
[[ -f "$BACKUP/active-next-release" && -f "$BACKUP/.env.local" ]] || { echo "Hiányos DROP 0.9.6 aktiválási mentés." >&2; exit 4; }
PREVIOUS="$(tr -d '\r\n' < "$BACKUP/active-next-release")"
[[ -f "$ROOT/$PREVIOUS/BUILD_ID" && -f "$ROOT/$PREVIOUS/standalone/server.js" ]] || { echo "A korábbi release nem található: $PREVIOUS" >&2; exit 5; }
STAMP="$(date +%Y%m%d_%H%M%S)"
systemctl disable --now dimpro-drop-scan-trigger-v096.path >/dev/null 2>&1 || true
systemctl stop dimpro-drop-scan-trigger-v096.service >/dev/null 2>&1 || true
for unit in dimpro-drop-scan-trigger-v096.service dimpro-drop-scan-trigger-v096.path; do
  if [[ -f "$BACKUP/etc/systemd/${unit}.existed" && -f "$BACKUP/etc/systemd/$unit" ]]; then
    cp -a "$BACKUP/etc/systemd/$unit" "/etc/systemd/system/$unit"
  else
    rm -f "/etc/systemd/system/$unit"
  fi
done
systemctl daemon-reload
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v096-rollback-$STAMP"
cp -a "$BACKUP/.env.local" "$ROOT/.env.local"
printf '%s\n' "$PREVIOUS" > "$ROOT/.dimprover/active-next-release"
cp -a "$BACKUP/etc/nginx/drop.dimpro.hu" /etc/nginx/sites-available/drop.dimpro.hu
cp -a "$BACKUP/etc/nginx/dimpro-drop-rate-limit.conf" /etc/nginx/conf.d/dimpro-drop-rate-limit.conf
nginx -t
systemctl reload nginx
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
for _ in $(seq 1 45); do
  if curl -fsS -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health >/tmp/drop-v096-rollback-health.json 2>/dev/null; then break; fi
  sleep 2
done
node - <<'NODE'
const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/drop-v096-rollback-health.json','utf8'));if(j.version!=='DROP 0.9.5')throw new Error(`Várt DROP 0.9.5, kapott ${j.version}`);console.log(JSON.stringify({ok:true,version:j.version},null,2));
NODE
echo "DROP 0.9.6 rollback kész. Aktív release: $PREVIOUS; build: $(cat "$ROOT/$PREVIOUS/BUILD_ID")"
