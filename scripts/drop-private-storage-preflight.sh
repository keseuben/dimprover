#!/usr/bin/env bash
set -euo pipefail

export NEXT_ENV_PROJECT_DIR="$PWD"
export NODE_OPTIONS='-r ./scripts/load-next-env.cjs'

echo '[1/7] DROP 0.3.3 SQL contract'
node scripts/drop-private-storage-schema-contract.test.mjs

echo '[2/7] DROP 0.3.3 code contract'
node scripts/drop-private-storage-code-contract.test.mjs

echo '[3/7] Local private storage security core'
npx --yes tsx scripts/drop-private-storage-core.test.ts

echo '[4/7] Pre-SQL readiness must remain closed'
npx --yes tsx -e '
import { getDropFeatureState } from "./app/lib/drop/dropFeatureFlags";
import { getDropRuntimeHealth } from "./app/lib/drop/dropRuntime";
import { getDropStorageSchemaHealth } from "./app/lib/drop/storage/dropStorageRepository";
void (async()=>{
  const feature=getDropFeatureState();
  const health=await getDropRuntimeHealth();
  const schema=await getDropStorageSchemaHealth();
  const result={
    version:feature.version,
    storageCoreEnabled:feature.flags.storageCoreEnabled,
    quarantineUploadEnabled:feature.flags.quarantineUploadEnabled,
    fullUploadModesEnabled:feature.uploadEnabled,
    storageSchema:schema.ready,
    storageConfigured:health.storage?.configured,
    storageCore:health.readiness?.storageCore,
    quarantineUpload:health.readiness?.quarantineUpload,
    virusScanner:health.readiness?.virusScanner,
    publicDownload:health.readiness?.publicDownload,
    publicUpload:health.readiness?.publicUpload,
    provider:health.storage?.provider,
    mode:health.storage?.mode,
  };
  console.log(JSON.stringify(result,null,2));
  if(
    feature.version!=="DROP 0.3.3-staged"
    || result.storageCoreEnabled
    || result.quarantineUploadEnabled
    || result.fullUploadModesEnabled
    || result.storageSchema
    || result.storageCore
    || result.quarantineUpload
    || result.virusScanner
    || result.publicDownload
    || result.publicUpload
    || result.provider!=="local-private"
    || result.mode!=="quarantine"
  ) process.exit(2);
})().catch(e=>{console.error(e);process.exit(1)});
'

echo '[5/7] DROP 0.3.2 spaces/packages regression'
bash scripts/drop-space-package-post-sql-preflight.sh

echo '[6/7] Email notification regression'
DROP_RELEASE_GATE_ENABLED=true DROP_EMAIL_NOTIFICATIONS_ENABLED=true npx --yes tsx scripts/drop-email-notifications.test.ts

echo '[7/7] Targeted lint and TypeScript'
npx eslint \
  app/lib/drop/dropTypes.ts \
  app/lib/drop/dropFeatureFlags.ts \
  app/lib/drop/dropRuntime.ts \
  app/lib/drop/dropRepository.ts \
  app/lib/drop/dropEmail.ts \
  app/lib/drop/dropSpaceRepository.ts \
  app/lib/drop/storage \
  app/api/drop/access/uploads/init/route.ts \
  app/api/drop/spaces/packages/'[packageId]'/files/route.ts \
  app/api/drop/spaces/packages/'[packageId]'/uploads/init/route.ts \
  app/api/drop/uploads/'[uploadId]'/route.ts \
  app/api/drop/uploads/'[uploadId]'/content/route.ts \
  app/api/drop/uploads/'[uploadId]'/complete/route.ts \
  components/drop/DropPackageQuarantineUpload.tsx \
  components/drop/DropCapabilityQuarantineUpload.tsx \
  components/drop/DropValidatedAccessPage.tsx \
  components/drop/DropSpacePackagePanel.tsx \
  proxy.ts \
  scripts/drop-private-storage-schema-contract.test.mjs \
  scripts/drop-private-storage-code-contract.test.mjs \
  scripts/drop-private-storage-core.test.ts \
  --max-warnings=0
npx tsc --noEmit --pretty false

echo 'DROP 0.3.3 pre-SQL private storage preflight: PASS'
