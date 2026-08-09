#!/usr/bin/env bash
set -euo pipefail
export NEXT_ENV_PROJECT_DIR="$PWD"
export NODE_OPTIONS='-r ./scripts/load-next-env.cjs'

echo '[1/7] DROP 0.3.4 SQL contract'
node scripts/drop-resumable-schema-contract.test.mjs

echo '[2/7] DROP 0.3.4 code contract'
node scripts/drop-resumable-code-contract.test.mjs

echo '[3/7] Local interrupted/resumed multipart storage'
DROP_STORAGE_PROVIDER=local-private \
DROP_STORAGE_MODE=quarantine \
DROP_STORAGE_LOCAL_ROOT=/root/dimprover/.data/drop-storage-v034-preflight \
DROP_MAX_STREAM_UPLOAD_MB=9 \
DROP_MAX_FILE_UPLOAD_MB=500 \
DROP_UPLOAD_CHUNK_MB=64 \
npx --yes tsx scripts/drop-resumable-local-storage.test.ts

echo '[4/7] Pre-SQL runtime must remain closed'
npx --yes tsx -e '
import { getDropRuntimeHealth } from "./app/lib/drop/dropRuntime";
void (async()=>{
  const r=await getDropRuntimeHealth();
  const out={
    version:r.version,
    storageSchemaVersion:r.database.storageSchema.marker?.schema_version,
    resumableFlag:r.featureGate.flags.resumableUploadEnabled,
    resumableReady:r.readiness.resumableUpload,
    quarantineUpload:r.readiness.quarantineUpload,
    maxFileBytes:r.storage.maxFileBytes,
    maxPartBytes:r.storage.maxPartBytes,
    chunkSizeBytes:r.storage.chunkSizeBytes,
    hetznerConfigured:r.readiness.hetznerStorageConfigured,
    publicDownload:r.readiness.publicDownload,
  };
  console.log(JSON.stringify(out,null,2));
  if(out.version!=="DROP 0.3.4-staged"||out.storageSchemaVersion!=="DROP 0.3.3"||out.resumableFlag||out.resumableReady||!out.quarantineUpload||out.maxFileBytes!==500*1024*1024||out.maxPartBytes!==9*1024*1024||out.chunkSizeBytes!==64*1024*1024||out.publicDownload) process.exit(2);
})().catch(e=>{console.error(e);process.exit(1)});
'

echo '[5/7] DROP 0.3.3 and legacy regression'
bash scripts/drop-private-storage-post-sql-preflight.sh

echo '[6/7] Nginx multipart route contract'
grep -q 'client_max_body_size 70m' ops/nginx/drop-v034-multipart-location.conf.example
grep -q 'proxy_request_buffering off' ops/nginx/drop-v034-multipart-location.conf.example
grep -q '/api/drop/uploads/' ops/nginx/drop-v034-multipart-location.conf.example

echo '[7/7] Targeted lint and TypeScript'
npx eslint \
  app/lib/drop/dropTypes.ts \
  app/lib/drop/dropFeatureFlags.ts \
  app/lib/drop/dropRuntime.ts \
  app/lib/drop/dropRepository.ts \
  app/lib/drop/storage/dropStorageConfig.ts \
  app/lib/drop/storage/dropLocalStorage.ts \
  app/lib/drop/storage/dropMultipartLocalStorage.ts \
  app/lib/drop/storage/dropS3Storage.ts \
  app/lib/drop/storage/dropStorageRepository.ts \
  app/lib/drop/storage/dropUploadService.ts \
  app/api/drop/uploads/'[uploadId]'/parts/route.ts \
  app/api/drop/uploads/'[uploadId]'/parts/'[partNumber]'/route.ts \
  components/drop/dropMultipartClient.ts \
  components/drop/DropPackageQuarantineUpload.tsx \
  components/drop/DropCapabilityQuarantineUpload.tsx \
  components/drop/DropValidatedAccessPage.tsx \
  scripts/drop-resumable-local-storage.test.ts \
  scripts/drop-resumable-schema-contract.test.mjs \
  scripts/drop-resumable-code-contract.test.mjs \
  scripts/drop-resumable-pre-sql-candidate.test.ts \
  --max-warnings=0
npx tsc --noEmit --pretty false

echo 'DROP 0.3.4 pre-SQL resumable multipart preflight: PASS'
