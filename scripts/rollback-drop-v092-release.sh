#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
BACKUP_REF="$ROOT/.work_drop_v092_release_activation_backup"
if [[ ! -f "$BACKUP_REF" ]]; then echo "Hiányzó DROP 0.9.2 rollback-hivatkozás." >&2; exit 2; fi
BACKUP_DIR="$(cat "$BACKUP_REF")"
case "$BACKUP_DIR" in backups/*) BACKUP_DIR="$ROOT/$BACKUP_DIR" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen rollback könyvtár." >&2; exit 3 ;; esac
[[ -f "$BACKUP_DIR/.env.local" && -f "$BACKUP_DIR/active-next-release" ]] || { echo "Hiányos rollback-mentés." >&2; exit 4; }
PREVIOUS_RELEASE="$(tr -d '\r\n' < "$BACKUP_DIR/active-next-release")"
[[ -f "$ROOT/$PREVIOUS_RELEASE/BUILD_ID" ]] || { echo "A korábbi release nem található: $PREVIOUS_RELEASE" >&2; exit 5; }
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v092-rollback-$(date +%Y%m%d_%H%M%S)"
cp -a "$BACKUP_DIR/.env.local" "$ROOT/.env.local"
printf '%s\n' "$PREVIOUS_RELEASE" > "$ROOT/.dimprover/active-next-release"
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
sleep 5
echo "DROP 0.9.2 rollback kész. Aktív release: $PREVIOUS_RELEASE; build: $(cat "$ROOT/$PREVIOUS_RELEASE/BUILD_ID")"
