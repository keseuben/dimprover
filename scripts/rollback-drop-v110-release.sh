#!/usr/bin/env bash
set -Eeuo pipefail
ROOT="/root/dimprover"
cd "$ROOT"
[[ -f .work_drop_v110_release_activation_backup && -f .work_drop_v110_identity_env_backup_path ]] || { echo "Hiányzó DROP 1.1.0 rollback hivatkozás." >&2; exit 2; }
BACKUP="$(cat .work_drop_v110_release_activation_backup)"
case "$BACKUP" in backups/*) BACKUP="$ROOT/$BACKUP" ;; "$ROOT"/backups/*) ;; *) echo "Érvénytelen pointer backup." >&2; exit 3 ;; esac
SECRET_BACKUP="$(cat .work_drop_v110_identity_env_backup_path)"
[[ -f "$BACKUP/active-next-release" && -f "$SECRET_BACKUP" ]] || { echo "Hiányos DROP 1.1.0 rollback mentés." >&2; exit 4; }
PREVIOUS="$(tr -d '\r\n' < "$BACKUP/active-next-release")"
[[ "$PREVIOUS" == ".next-v100-release-final" ]] || { echo "Váratlan rollback cél: $PREVIOUS" >&2; exit 5; }
cp -a "$SECRET_BACKUP" /root/.dimpro-secrets/dimpro-identity-core.env
chmod 600 /root/.dimpro-secrets/dimpro-identity-core.env
cp -a "$BACKUP/active-next-release" .dimprover/active-next-release.tmp
chmod 600 .dimprover/active-next-release.tmp
mv -f .dimprover/active-next-release.tmp .dimprover/active-next-release
pm2 restart dimprover --update-env
pm2 save >/dev/null
for _ in $(seq 1 60); do
  if curl -fsS --max-time 8 -H 'Host: drop.dimpro.hu' http://127.0.0.1:3000/api/drop/health >/tmp/drop-v110-rollback-health.json 2>/dev/null; then break; fi
  sleep 2
done
[[ "$(tr -d '\r\n' < .dimprover/active-next-release)" == "$PREVIOUS" ]]
grep -qx 'DIMPRO_IDENTITY_CORE_ENABLED=false' /root/.dimpro-secrets/dimpro-identity-core.env
echo "DROP 1.1.0 rollback kész. Aktív release: $PREVIOUS"
