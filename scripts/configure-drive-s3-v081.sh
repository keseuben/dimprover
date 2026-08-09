#!/usr/bin/env bash
set -euo pipefail

ROOT="/root/dimprover"
ENV_FILE="$ROOT/.env.local"
cd "$ROOT"

if [[ ! -t 0 ]]; then
  echo "HIBA: ezt a konfigurálót interaktív VPS terminálban kell futtatni." >&2
  exit 2
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "HIBA: a DIMPRO DRIVE tárhelykonfigurációt root felhasználóként kell futtatni." >&2
  exit 2
fi

read -r -p "S3 HTTPS endpoint [https://fsn1.your-objectstorage.com]: " ENDPOINT
ENDPOINT="${ENDPOINT:-https://fsn1.your-objectstorage.com}"
read -r -p "S3 régió [fsn1]: " REGION
REGION="${REGION:-fsn1}"
read -r -p "Külön privát DRIVE bucket neve: " BUCKET
read -r -p "DRIVE S3 access key ID: " ACCESS_KEY
read -r -s -p "DRIVE S3 secret access key: " SECRET_KEY
printf '\n'
read -r -p "Path-style címzés szükséges? [y/N]: " PATH_STYLE_ANSWER

FORCE_PATH_STYLE="false"
case "${PATH_STYLE_ANSWER,,}" in
  y|yes|i|igen) FORCE_PATH_STYLE="true" ;;
esac

export DRIVE_INPUT_ENDPOINT="$ENDPOINT"
export DRIVE_INPUT_REGION="$REGION"
export DRIVE_INPUT_BUCKET="$BUCKET"
export DRIVE_INPUT_ACCESS_KEY="$ACCESS_KEY"
export DRIVE_INPUT_SECRET_KEY="$SECRET_KEY"
export DRIVE_INPUT_FORCE_PATH_STYLE="$FORCE_PATH_STYLE"

python3 - <<'PY'
import os
import re
from urllib.parse import urlparse

endpoint = os.environ["DRIVE_INPUT_ENDPOINT"].strip()
region = os.environ["DRIVE_INPUT_REGION"].strip()
bucket = os.environ["DRIVE_INPUT_BUCKET"].strip()
access_key = os.environ["DRIVE_INPUT_ACCESS_KEY"].strip()
secret_key = os.environ["DRIVE_INPUT_SECRET_KEY"].strip()

parsed = urlparse(endpoint)
if parsed.scheme != "https" or not parsed.netloc or parsed.path not in ("", "/"):
    raise SystemExit("HIBA: az endpoint teljes HTTPS gyökércím legyen, például https://fsn1.your-objectstorage.com")
if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,61}[a-z0-9]", bucket):
    raise SystemExit("HIBA: a bucket neve 3–63 karakteres, kisbetűs, számot és kötőjelet tartalmazó név legyen.")
if not re.fullmatch(r"[A-Za-z0-9._-]{2,80}", region):
    raise SystemExit("HIBA: érvénytelen S3 régió.")
if len(access_key) < 8:
    raise SystemExit("HIBA: az access key hiányzik vagy túl rövid.")
if len(secret_key) < 16:
    raise SystemExit("HIBA: a secret access key hiányzik vagy túl rövid.")
PY

STAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_DIR="$ROOT/backups/drive_s3_credentials_v081_$STAMP"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
if [[ -f "$ENV_FILE" ]]; then
  cp -p "$ENV_FILE" "$BACKUP_DIR/.env.local.before"
  chmod 600 "$BACKUP_DIR/.env.local.before"
else
  : > "$BACKUP_DIR/.env.local.before"
  chmod 600 "$BACKUP_DIR/.env.local.before"
fi

python3 - <<'PY'
import os
from pathlib import Path

path = Path("/root/dimprover/.env.local")
managed = {
    "DIMPRO_DRIVE_STORAGE_MODE": "disabled",
    "DIMPRO_DRIVE_STORAGE_PROVIDER": "s3-compatible",
    "DIMPRO_DRIVE_MAX_UPLOAD_MB": "500",
    "DIMPRO_DRIVE_SIGNED_URL_TTL_SECONDS": "600",
    "DIMPRO_DRIVE_UPLOAD_SESSION_TTL_MINUTES": "30",
    "DIMPRO_DRIVE_S3_ENDPOINT": os.environ["DRIVE_INPUT_ENDPOINT"].strip(),
    "DIMPRO_DRIVE_S3_REGION": os.environ["DRIVE_INPUT_REGION"].strip(),
    "DIMPRO_DRIVE_S3_BUCKET": os.environ["DRIVE_INPUT_BUCKET"].strip(),
    "DIMPRO_DRIVE_S3_ACCESS_KEY_ID": os.environ["DRIVE_INPUT_ACCESS_KEY"].strip(),
    "DIMPRO_DRIVE_S3_SECRET_ACCESS_KEY": os.environ["DRIVE_INPUT_SECRET_KEY"].strip(),
    "DIMPRO_DRIVE_S3_FORCE_PATH_STYLE": os.environ["DRIVE_INPUT_FORCE_PATH_STYLE"].strip(),
}

lines = path.read_text().splitlines() if path.exists() else []
kept = []
for line in lines:
    stripped = line.strip()
    key = stripped.split("=", 1)[0] if "=" in stripped and not stripped.startswith("#") else None
    if key not in managed:
        kept.append(line)

if kept and kept[-1].strip():
    kept.append("")
kept.append("# DIMPRO DRIVE private S3 activation v0.8.1")
for key, value in managed.items():
    kept.append(f"{key}={value}")
path.write_text("\n".join(kept) + "\n")
path.chmod(0o600)
PY

unset SECRET_KEY DRIVE_INPUT_SECRET_KEY

printf '\nKonfiguráció biztonságosan mentve.\n'
printf 'Endpoint: %s\n' "$ENDPOINT"
printf 'Régió: %s\n' "$REGION"
printf 'Bucket: %s\n' "$BUCKET"
printf 'Path-style: %s\n' "$FORCE_PATH_STYLE"
printf 'Mód: disabled\n'
printf 'Rollback mentés: %s/.env.local.before\n' "$BACKUP_DIR"
printf 'Secret kiírva: NEM\n\n'

node -r ./scripts/load-next-env.cjs scripts/drive-object-storage-v040-preflight.mjs
node -r ./scripts/load-next-env.cjs scripts/drive-object-storage-v081-cors.mjs
node -r ./scripts/load-next-env.cjs scripts/drive-object-storage-v081-readiness.mjs

printf '\nA preflight és a CORS ellenőrzés sikeres. A tárhely továbbra is disabled módban maradt.\n'
printf 'A következő lépést a fejlesztési ellenőrzés kapcsolja quarantine módba.\n'