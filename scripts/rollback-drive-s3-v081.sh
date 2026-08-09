#!/usr/bin/env bash
set -euo pipefail

ROOT="/root/dimprover"
cd "$ROOT"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "HIBA: a visszaállítást root felhasználóként kell futtatni." >&2
  exit 2
fi

BACKUP_FILE="${1:-}"
if [[ -z "$BACKUP_FILE" ]]; then
  echo "Használat: $0 /root/dimprover/backups/drive_s3_credentials_v081_ÉÉÉÉHHNN_ÓÓPPMM/.env.local.before" >&2
  exit 2
fi

case "$BACKUP_FILE" in
  /root/dimprover/backups/drive_s3_credentials_v081_*/.env.local.before) ;;
  *)
    echo "HIBA: csak a DRIVE v0.8.1 konfiguráló által létrehozott mentés állítható vissza." >&2
    exit 2
    ;;
esac

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "HIBA: a megadott mentés nem található." >&2
  exit 2
fi

STAMP="$(date +%Y%m%d_%H%M%S)"
SAFETY_DIR="$ROOT/backups/drive_s3_rollback_safety_$STAMP"
mkdir -p "$SAFETY_DIR"
chmod 700 "$SAFETY_DIR"
if [[ -f "$ROOT/.env.local" ]]; then
  cp -p "$ROOT/.env.local" "$SAFETY_DIR/.env.local.before_rollback"
  chmod 600 "$SAFETY_DIR/.env.local.before_rollback"
fi

cp "$BACKUP_FILE" "$ROOT/.env.local"
chmod 600 "$ROOT/.env.local"
pm2 restart dimprover --update-env

printf 'DRIVE S3 konfiguráció visszaállítva.\n'
printf 'Forrásmentés: %s\n' "$BACKUP_FILE"
printf 'Rollback előtti biztonsági mentés: %s\n' "$SAFETY_DIR"
printf 'Secret kiírva: NEM\n'