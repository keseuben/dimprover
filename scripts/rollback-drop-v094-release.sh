#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
ACTIVATION_REF="$ROOT/.work_drop_v094_release_activation_backup"
[[ -f "$ACTIVATION_REF" ]] || { echo "Hiányzó DROP 0.9.4 aktiválási mentéshivatkozás." >&2; exit 2; }
ACTIVATION_DIR="$(cat "$ACTIVATION_REF")"
case "$ACTIVATION_DIR" in backups/*) ACTIVATION_DIR="$ROOT/$ACTIVATION_DIR" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen aktiválási mentés." >&2; exit 3 ;; esac
[[ -f "$ACTIVATION_DIR/.env.local.pre-v094" && -f "$ACTIVATION_DIR/active-next-release" ]] || { echo "Hiányos aktiválási mentés." >&2; exit 4; }
PREVIOUS_RELEASE="$(tr -d '\r\n' < "$ACTIVATION_DIR/active-next-release")"
[[ -f "$ROOT/$PREVIOUS_RELEASE/BUILD_ID" ]] || { echo "A korábbi release nem található: $PREVIOUS_RELEASE" >&2; exit 5; }
STAMP="$(date +%Y%m%d_%H%M%S)"
if [[ -d "$ROOT/.data/dimpro-drop-public-v094" ]]; then
  mv "$ROOT/.data/dimpro-drop-public-v094" "$ROOT/backups/drop_v094_public_state_rollback_$STAMP"
fi
if [[ -f "$ACTIVATION_DIR/public-state/existed" && -d "$ACTIVATION_DIR/public-state/preexisting" ]]; then
  cp -a "$ACTIVATION_DIR/public-state/preexisting" "$ROOT/.data/dimpro-drop-public-v094"
fi
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v094-rollback-$STAMP"
cp -a "$ACTIVATION_DIR/.env.local.pre-v094" "$ROOT/.env.local"
printf '%s\n' "$PREVIOUS_RELEASE" > "$ROOT/.dimprover/active-next-release"
cp -a "$ACTIVATION_DIR/etc/nginx/drop.dimpro.hu.pre-v094" /etc/nginx/sites-available/drop.dimpro.hu
cp -a "$ACTIVATION_DIR/etc/nginx/dimpro-drop-rate-limit.conf.pre-v094" /etc/nginx/conf.d/dimpro-drop-rate-limit.conf
nginx -t
systemctl reload nginx
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
for _ in $(seq 1 30); do
  curl -fsS -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health >/tmp/drop-v094-rollback-health.json 2>/dev/null && break
  sleep 2
done
node - <<'NODE'
const fs=require('fs');const j=JSON.parse(fs.readFileSync('/tmp/drop-v094-rollback-health.json','utf8'));if(j.version!=='DROP 0.9.3')throw new Error(`Várt DROP 0.9.3, kapott ${j.version}`);console.log(JSON.stringify({ok:true,version:j.version},null,2));
NODE
echo "DROP 0.9.4 rollback kész. Aktív release: $PREVIOUS_RELEASE; build: $(cat "$ROOT/$PREVIOUS_RELEASE/BUILD_ID")"
