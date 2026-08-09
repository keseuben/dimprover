#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
REF="$ROOT/.work_drop_v095_release_activation_backup"
[[ -f "$REF" ]] || { echo "Hiányzó DROP 0.9.5 aktiválási mentéshivatkozás." >&2; exit 2; }
BACKUP="$(cat "$REF")"
case "$BACKUP" in backups/*) BACKUP="$ROOT/$BACKUP" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen mentési útvonal." >&2; exit 3 ;; esac
[[ -f "$BACKUP/active-next-release" && -f "$BACKUP/.env.local" ]] || { echo "Hiányos DROP 0.9.5 aktiválási mentés." >&2; exit 4; }
PREVIOUS="$(tr -d '\r\n' < "$BACKUP/active-next-release")"
[[ -f "$ROOT/$PREVIOUS/BUILD_ID" ]] || { echo "A korábbi release nem található: $PREVIOUS" >&2; exit 5; }
STAMP="$(date +%Y%m%d_%H%M%S)"
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v095-rollback-$STAMP"
cp -a "$BACKUP/.env.local" "$ROOT/.env.local"
if [[ -d "$ROOT/.data/dimpro-drop-public-v095" ]]; then mv "$ROOT/.data/dimpro-drop-public-v095" "$ROOT/backups/drop_v095_marker_rollback_$STAMP"; fi
if [[ -f "$BACKUP/store-marker/existed" && -d "$BACKUP/store-marker/v095" ]]; then cp -a "$BACKUP/store-marker/v095" "$ROOT/.data/dimpro-drop-public-v095"; fi
if [[ -d "$ROOT/.data/dimpro-drop-public-v094" ]]; then mv "$ROOT/.data/dimpro-drop-public-v094" "$ROOT/backups/drop_v095_file_state_rollback_$STAMP"; fi
cp -a "$BACKUP/public-state/v094" "$ROOT/.data/dimpro-drop-public-v094"
printf '%s\n' "$PREVIOUS" > "$ROOT/.dimprover/active-next-release"
cp -a "$BACKUP/etc/nginx/drop.dimpro.hu" /etc/nginx/sites-available/drop.dimpro.hu
cp -a "$BACKUP/etc/nginx/dimpro-drop-rate-limit.conf" /etc/nginx/conf.d/dimpro-drop-rate-limit.conf
nginx -t
systemctl reload nginx
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
for _ in $(seq 1 40); do curl -fsS -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health >/tmp/drop-v095-rollback-health.json 2>/dev/null && break; sleep 2; done
node - <<'NODE'
const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/drop-v095-rollback-health.json','utf8'));if(j.version!=='DROP 0.9.4')throw new Error(`Várt DROP 0.9.4, kapott ${j.version}`);console.log(JSON.stringify({ok:true,version:j.version},null,2));
NODE
echo "DROP 0.9.5 rollback kész. Aktív release: $PREVIOUS; build: $(cat "$ROOT/$PREVIOUS/BUILD_ID")"
