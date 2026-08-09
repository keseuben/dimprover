#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
REF="$ROOT/.work_drop_v098_release_activation_backup"
[[ -f "$REF" ]] || { echo "Hiányzó DROP 0.9.8 aktiválási mentéshivatkozás." >&2; exit 2; }
BACKUP="$(cat "$REF")"
case "$BACKUP" in backups/*) BACKUP="$ROOT/$BACKUP" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen mentési útvonal." >&2; exit 3 ;; esac
[[ -f "$BACKUP/active-next-release" && -f "$BACKUP/.env.local" ]] || { echo "Hiányos DROP 0.9.8 aktiválási mentés." >&2; exit 4; }
PREVIOUS="$(tr -d '\r\n' < "$BACKUP/active-next-release")"
[[ "$PREVIOUS" == ".next-v097-release-final" ]] || { echo "A mentett rollback cél nem DROP 0.9.7: $PREVIOUS" >&2; exit 5; }
[[ -f "$ROOT/$PREVIOUS/BUILD_ID" && -f "$ROOT/$PREVIOUS/standalone/server.js" ]] || { echo "A korábbi release nem található: $PREVIOUS" >&2; exit 6; }
STAMP="$(date +%Y%m%d_%H%M%S)"
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v098-rollback-$STAMP"
cp -a "$BACKUP/.env.local" "$ROOT/.env.local"
printf '%s\n' "$PREVIOUS" > "$ROOT/.dimprover/active-next-release.tmp"
chmod 600 "$ROOT/.dimprover/active-next-release.tmp"
mv -f "$ROOT/.dimprover/active-next-release.tmp" "$ROOT/.dimprover/active-next-release"
cp -a "$BACKUP/etc/nginx/drop.dimpro.hu" /etc/nginx/sites-available/drop.dimpro.hu
cp -a "$BACKUP/etc/nginx/dimpro-drop-rate-limit.conf" /etc/nginx/conf.d/dimpro-drop-rate-limit.conf
nginx -t
systemctl reload nginx
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
for _ in $(seq 1 60); do
  if curl -fsS -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health >/tmp/drop-v098-rollback-health.json 2>/dev/null; then break; fi
  sleep 2
done
node - <<'NODE'
const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/drop-v098-rollback-health.json','utf8'));if(j.version!=='DROP 0.9.7')throw new Error(`Várt DROP 0.9.7, kapott ${j.version}`);if(j.worker?.scannerPing!=='PONG')throw new Error('A ClamAV scanner nem kész a rollback után.');console.log(JSON.stringify({ok:true,version:j.version,scanner:j.worker.scannerPing},null,2));
NODE
echo "DROP 0.9.8 rollback kész. Aktív release: $PREVIOUS; build: $(cat "$ROOT/$PREVIOUS/BUILD_ID")"
