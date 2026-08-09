#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
BACKUP_REF="$ROOT/.work_drop_v070_release_activation_backup"
if [[ ! -f "$BACKUP_REF" ]]; then echo "Hiányzó DROP 0.7.0 rollback-hivatkozás: $BACKUP_REF" >&2; exit 2; fi
BACKUP_DIR="$(cat "$BACKUP_REF")"
case "$BACKUP_DIR" in backups/*) BACKUP_DIR="$ROOT/$BACKUP_DIR" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen rollback könyvtár: $BACKUP_DIR" >&2; exit 3 ;; esac
ENV_BACKUP="$BACKUP_DIR/.env.local"
POINTER_BACKUP="$BACKUP_DIR/active-next-release"
if [[ ! -f "$ENV_BACKUP" || ! -f "$POINTER_BACKUP" ]]; then echo "A DROP 0.7.0 rollback-mentés hiányos: $BACKUP_DIR" >&2; exit 4; fi
PREVIOUS_RELEASE="$(tr -d '\r\n' < "$POINTER_BACKUP")"
if [[ -z "$PREVIOUS_RELEASE" || ! -f "$ROOT/$PREVIOUS_RELEASE/BUILD_ID" ]]; then echo "A korábbi release nem található: $PREVIOUS_RELEASE" >&2; exit 5; fi
cp -a "$ROOT/.env.local" "$ROOT/.env.local.before-v070-rollback-$(date +%Y%m%d_%H%M%S)"
cp -a "$ENV_BACKUP" "$ROOT/.env.local"
printf '%s\n' "$PREVIOUS_RELEASE" > "$ROOT/.dimprover/active-next-release"
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
sleep 5
ACTIVE_BUILD="$(cat "$ROOT/$PREVIOUS_RELEASE/BUILD_ID")"
echo "DROP 0.7.0 rollback kész. Aktív release: $PREVIOUS_RELEASE; build: $ACTIVE_BUILD"
