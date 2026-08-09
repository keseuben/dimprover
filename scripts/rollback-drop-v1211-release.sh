#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
CURRENT=".next-v1211-release-final"
ROLLBACK=".next-v1210-release-final"
cd "$ROOT"
ACTIVE="$(tr -d '\r\n' < .dimprover/active-next-release)"
[[ "$ACTIVE" == "$CURRENT" ]] || { echo "Rollback leállítva: az aktív release nem $CURRENT, hanem $ACTIVE." >&2; exit 2; }
[[ -f "$ROLLBACK/BUILD_ID" && -f "$ROLLBACK/standalone/server.js" ]] || { echo "A rollback release hiányos: $ROLLBACK" >&2; exit 3; }
printf '%s\n' "$ROLLBACK" > .dimprover/active-next-release.tmp
chmod 600 .dimprover/active-next-release.tmp
mv -f .dimprover/active-next-release.tmp .dimprover/active-next-release
NEXT_DIST_DIR="$ROLLBACK" pm2 restart dimprover --update-env >/dev/null
for _ in $(seq 1 90); do
  if curl -fsS --max-time 8 -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health >/tmp/drop-v1211-rollback-health.json 2>/dev/null; then break; fi
  sleep 2
done
node - <<'NODE'
const h=require('/tmp/drop-v1211-rollback-health.json');if(h.version!=='DROP 1.2.10'||h.coreReady!==true)throw new Error(`Rollback health hibás: ${h.version}`);console.log(JSON.stringify({ok:true,version:h.version,coreReady:h.coreReady},null,2));
NODE
pm2 save >/dev/null
echo "DROP 1.2.11 rollback kész: $ROLLBACK"
