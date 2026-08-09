#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
SOURCE_BACKUP="$ROOT/backups/drop_v093_robot_guard_20260805_070950"
ACTIVATION_REF="$ROOT/.work_drop_v093_release_activation_backup"
[[ -f "$ACTIVATION_REF" ]] || { echo "Hiányzó DROP 0.9.3 aktiválási mentéshivatkozás." >&2; exit 2; }
ACTIVATION_DIR="$(cat "$ACTIVATION_REF")"
case "$ACTIVATION_DIR" in backups/*) ACTIVATION_DIR="$ROOT/$ACTIVATION_DIR" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen aktiválási mentés." >&2; exit 3 ;; esac
[[ -f "$ACTIVATION_DIR/.env.local" && -f "$ACTIVATION_DIR/active-next-release" ]] || { echo "Hiányos aktiválási mentés." >&2; exit 4; }
PREVIOUS_RELEASE="$(tr -d '\r\n' < "$ACTIVATION_DIR/active-next-release")"
[[ -f "$ROOT/$PREVIOUS_RELEASE/BUILD_ID" ]] || { echo "A korábbi release nem található: $PREVIOUS_RELEASE" >&2; exit 5; }
[[ -f "$SOURCE_BACKUP/etc/nginx/drop.dimpro.hu" ]] || { echo "Hiányzó 0.9.2 Nginx mentés." >&2; exit 6; }
if [[ -d "$ROOT/.data/dimpro-drop-guard" ]]; then
  mv "$ROOT/.data/dimpro-drop-guard" "$ROOT/backups/drop_v093_guard_rollback_$(date +%Y%m%d_%H%M%S)"
fi
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v093-rollback-$(date +%Y%m%d_%H%M%S)"
cp -a "$ACTIVATION_DIR/.env.local" "$ROOT/.env.local"
printf '%s\n' "$PREVIOUS_RELEASE" > "$ROOT/.dimprover/active-next-release"
cp -a "$SOURCE_BACKUP/etc/nginx/drop.dimpro.hu" /etc/nginx/sites-available/drop.dimpro.hu
rm -f /etc/nginx/conf.d/dimpro-drop-rate-limit.conf
nginx -t
systemctl reload nginx
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
sleep 6
echo "DROP 0.9.3 rollback kész. Aktív release: $PREVIOUS_RELEASE; build: $(cat "$ROOT/$PREVIOUS_RELEASE/BUILD_ID")"
