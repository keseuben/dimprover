#!/usr/bin/env bash
set -euo pipefail
ROOT=/root/dimprover
BACKUP_FILE="$ROOT/.work_drop_v050_release_activation_backup"
[[ -f "$BACKUP_FILE" ]] || { echo 'Hiányzó DROP 0.5.0 release backup pointer.' >&2; exit 2; }
BACKUP=$(cat "$BACKUP_FILE")
case "$BACKUP" in backups/drop_v050_release_activation_*) ;; *) echo 'Érvénytelen backup útvonal.' >&2; exit 2;; esac
[[ -f "$ROOT/$BACKUP/.env.local.before" ]] || { echo 'Hiányzó env backup.' >&2; exit 2; }
cp -p "$ROOT/$BACKUP/.env.local.before" "$ROOT/.env.local"
chmod 600 "$ROOT/.env.local"
printf '%s\n' '.next' > "$ROOT/.dimprover/active-next-release"
chmod 600 "$ROOT/.dimprover/active-next-release"
cd "$ROOT"
pm2 restart dimprover --update-env
pm2 save
printf 'DROP 0.5.0 rollback kész: release=.next, storage mode visszaállítva.\n'
