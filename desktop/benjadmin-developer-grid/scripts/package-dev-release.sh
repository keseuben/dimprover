#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="$(git -C "$ROOT" rev-parse --show-toplevel)"
VERSION="$(node -e 'process.stdout.write(require(process.argv[1]).version)' "$ROOT/package.json")"
NAME="BENJADMIN-Developer-Grid-v${VERSION}-DEV"
OUT_DIR="${1:-$ROOT/dist-dev}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
STAGE="$TMP/$NAME"
mkdir -p "$STAGE/desktop/benjadmin-developer-grid" "$OUT_DIR"
tar -C "$ROOT" --exclude=node_modules --exclude=dist --exclude=dist-dev --exclude='*.log' -cf - . | tar -C "$STAGE/desktop/benjadmin-developer-grid" -xf -
for rel in app/admin/developer-grid app/api/dev/grid app/lib/developer-grid components/admin/developer-grid scripts/developer-grid; do
  mkdir -p "$STAGE/$(dirname "$rel")"
  cp -a "$REPO/$rel" "$STAGE/$rel"
done
cat > "$STAGE/README_FIRST.txt" <<TXT
BENJADMIN Developer Grid v${VERSION} DEV
DEV ONLY · PROD DENY
Commit: $(git -C "$REPO" rev-parse HEAD)
Branch: $(git -C "$REPO" branch --show-current)
Build ID: $(cat "$REPO/.next/BUILD_ID" 2>/dev/null || echo NINCS)
Desktop build: cd desktop/benjadmin-developer-grid && npm ci && npm run check && npm run dist:win
TXT
python3 - "$STAGE" "$OUT_DIR/${NAME}.zip" <<'PYZIP'
from pathlib import Path
import sys, zipfile
stage = Path(sys.argv[1])
out = Path(sys.argv[2])
with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    for file in sorted(stage.rglob("*")):
        if file.is_file():
            z.write(file, file.relative_to(stage.parent))
PYZIP
sha256sum "$OUT_DIR/${NAME}.zip" > "$OUT_DIR/${NAME}.zip.sha256"
echo "$OUT_DIR/${NAME}.zip"
cat "$OUT_DIR/${NAME}.zip.sha256"
