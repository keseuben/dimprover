#!/usr/bin/env bash
set -euo pipefail
export NEXT_ENV_PROJECT_DIR="$PWD"
export NODE_OPTIONS='-r ./scripts/load-next-env.cjs'

echo '[1/7] DROP 0.3.3 schema readiness'
npx --yes tsx -e '
import { getDropStorageSchemaHealth } from "./app/lib/drop/storage/dropStorageRepository";
void (async()=>{const r=await getDropStorageSchemaHealth();console.log(JSON.stringify(r,null,2));if(!r.ready)process.exit(2)})().catch(e=>{console.error(e);process.exit(1)});
'

echo '[2/7] Active code and runtime contract'
node scripts/drop-private-storage-active-contract.test.mjs
npx --yes tsx -e '
import { getDropRuntimeHealth } from "./app/lib/drop/dropRuntime";
void (async()=>{const r=await getDropRuntimeHealth();const out={version:r.version,storageSchema:r.readiness.storageSchema,storageCore:r.readiness.storageCore,quarantineUpload:r.readiness.quarantineUpload,resumableUpload:r.readiness.resumableUpload,virusScanner:r.readiness.virusScanner,publicDownload:r.readiness.publicDownload,publicUpload:r.readiness.publicUpload,maxFileBytes:r.storage.maxFileBytes,maxPartBytes:r.storage.maxPartBytes,chunkSizeBytes:r.storage.chunkSizeBytes};console.log(JSON.stringify(out,null,2));if(r.version!=="DROP 0.3.4"||!out.storageSchema||!out.storageCore||!out.quarantineUpload||!out.resumableUpload||out.virusScanner||out.publicDownload||out.publicUpload||out.maxFileBytes!==500*1024*1024||out.maxPartBytes!==70*1024*1024||out.chunkSizeBytes!==64*1024*1024)process.exit(2)})().catch(e=>{console.error(e);process.exit(1)});
'

echo '[3/7] Local private storage security core'
DROP_STORAGE_LOCAL_ROOT=/root/dimprover/.data/drop-storage-core-test npx --yes tsx scripts/drop-private-storage-core.test.ts

echo '[4/7] Real post-SQL streaming and quota integration'
DROP_ALLOW_STORAGE_POST_SQL_TEST='DROP-STORAGE-POST-SQL-TEST' \
DROP_RELEASE_GATE_ENABLED=true \
DROP_STORAGE_CORE_ENABLED=true \
DROP_QUARANTINE_UPLOAD_ENABLED=true \
DROP_EMAIL_NOTIFICATIONS_ENABLED=false \
DROP_STORAGE_PROVIDER=local-private \
DROP_STORAGE_MODE=quarantine \
DROP_STORAGE_LOCAL_ROOT=/root/dimprover/.data/drop-storage-integration-test \
DROP_STORAGE_BUCKET=dimpro-drop-integration \
DROP_MAX_STREAM_UPLOAD_MB=70 \
DROP_MAX_FILE_UPLOAD_MB=500 \
DROP_UPLOAD_CHUNK_MB=64 \
npx --yes tsx scripts/drop-private-storage-post-sql-integration.test.ts

echo '[5/7] DROP 0.3.2 spaces/package regression'
bash scripts/drop-space-package-post-sql-preflight.sh

echo '[6/7] Email notification regression'
DROP_RELEASE_GATE_ENABLED=true DROP_EMAIL_NOTIFICATIONS_ENABLED=true npx --yes tsx scripts/drop-email-notifications.test.ts

echo '[7/7] Targeted lint and TypeScript'
npx eslint \
  app/lib/drop/dropTypes.ts \
  app/lib/drop/dropFeatureFlags.ts \
  app/lib/drop/dropUploadRules.ts \
  app/lib/drop/dropRuntime.ts \
  app/lib/drop/dropRepository.ts \
  app/lib/drop/dropSpaceRepository.ts \
  app/lib/drop/storage/dropStorageConfig.ts \
  app/lib/drop/storage/dropLocalStorage.ts \
  app/lib/drop/storage/dropFileSecurity.ts \
  app/lib/drop/storage/dropUploadToken.ts \
  app/lib/drop/storage/dropStorageRepository.ts \
  app/lib/drop/storage/dropUploadService.ts \
  app/api/drop/access/uploads/init/route.ts \
  app/api/drop/spaces/packages/'[packageId]'/files/route.ts \
  app/api/drop/spaces/packages/'[packageId]'/uploads/init/route.ts \
  app/api/drop/uploads/'[uploadId]'/route.ts \
  app/api/drop/uploads/'[uploadId]'/content/route.ts \
  app/api/drop/uploads/'[uploadId]'/complete/route.ts \
  components/drop/DropPackageQuarantineUpload.tsx \
  components/drop/DropUploadRulesNotice.tsx \
  components/drop/DropCapabilityQuarantineUpload.tsx \
  components/drop/dropMultipartClient.ts \
  app/lib/drop/storage/dropMultipartLocalStorage.ts \
  app/lib/drop/storage/dropS3Storage.ts \
  app/api/drop/uploads/'[uploadId]'/parts/route.ts \
  app/api/drop/uploads/'[uploadId]'/parts/'[partNumber]'/route.ts \
  components/drop/DropValidatedAccessPage.tsx \
  proxy.ts \
  scripts/drop-private-storage-active-contract.test.mjs \
  scripts/drop-private-storage-post-sql-integration.test.ts \
  --max-warnings=0
npx tsc --noEmit --pretty false

echo 'DROP 0.3.3 post-SQL private storage preflight: PASS'
