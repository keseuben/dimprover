#!/usr/bin/env bash
set -euo pipefail
export NEXT_ENV_PROJECT_DIR="$PWD"
export NODE_OPTIONS='-r ./scripts/load-next-env.cjs'

echo '[1/9] DROP 0.3.4 schema readiness'
npx --yes tsx -e '
import { getDropMultipartSchemaHealth, getDropStorageSchemaHealth } from "./app/lib/drop/storage/dropStorageRepository";
void (async()=>{const [s,m]=await Promise.all([getDropStorageSchemaHealth(),getDropMultipartSchemaHealth()]);const o={storageReady:s.ready,multipartReady:m.ready,version:s.marker?.schema_version,migrationCount:s.marker?.migration_count,bootstrapId:s.marker?.bootstrap_id};console.log(JSON.stringify(o,null,2));if(!o.storageReady||!o.multipartReady||o.version!=="DROP 0.3.4"||Number(o.migrationCount)!==2||o.bootstrapId!=="drop-034-resumable-multipart-20260802")process.exit(2)})().catch(e=>{console.error(e);process.exit(1)});'

echo '[2/9] Active runtime and code contract'
node scripts/drop-resumable-code-contract.test.mjs
npx --yes tsx -e '
import { getDropRuntimeHealth } from "./app/lib/drop/dropRuntime";
void (async()=>{const r=await getDropRuntimeHealth();const o={version:r.version,resumableFlag:r.featureGate.flags.resumableUploadEnabled,resumableReady:r.readiness.resumableUpload,quarantine:r.readiness.quarantineUpload,virusScanner:r.readiness.virusScanner,publicDownload:r.readiness.publicDownload,maxFile:r.storage.maxFileBytes,maxPart:r.storage.maxPartBytes,chunk:r.storage.chunkSizeBytes};console.log(JSON.stringify(o,null,2));if(o.version!=="DROP 0.3.4"||!o.resumableFlag||!o.resumableReady||!o.quarantine||o.virusScanner||o.publicDownload||o.maxFile!==500*1024*1024||o.maxPart!==70*1024*1024||o.chunk!==64*1024*1024)process.exit(2)})().catch(e=>{console.error(e);process.exit(1)});'

echo '[3/9] Real 65 MB interruption and resume integration'
DROP_ALLOW_V034_POST_SQL_TEST='DROP-V034-POST-SQL-TEST' \
DROP_RELEASE_GATE_ENABLED=true \
DROP_STORAGE_CORE_ENABLED=true \
DROP_QUARANTINE_UPLOAD_ENABLED=true \
DROP_RESUMABLE_UPLOAD_ENABLED=true \
DROP_EMAIL_NOTIFICATIONS_ENABLED=false \
DROP_STORAGE_PROVIDER=local-private \
DROP_STORAGE_MODE=quarantine \
DROP_STORAGE_LOCAL_ROOT=/root/dimprover/.data/drop-storage-v034-integration \
DROP_STORAGE_BUCKET=dimpro-drop-v034-integration \
DROP_MAX_FILE_UPLOAD_MB=500 \
DROP_MAX_STREAM_UPLOAD_MB=70 \
DROP_UPLOAD_CHUNK_MB=64 \
npx --yes tsx scripts/drop-resumable-post-sql-integration.test.ts

echo '[4/9] DROP 0.3.3 and legacy regression'
bash scripts/drop-private-storage-post-sql-preflight.sh

echo '[5/9] Upload rules unit contract'
npx --yes tsx -e '
import { DROP_UPLOAD_RULES_VERSION, validateDropUploadRulesAcceptance } from "./app/lib/drop/dropUploadRules";
const now=new Date().toISOString();
const accepted=validateDropUploadRulesAcceptance({rulesAccepted:true,rulesVersion:DROP_UPLOAD_RULES_VERSION,rulesAcceptedAt:now});
let blocked=false;try{validateDropUploadRulesAcceptance({rulesAccepted:false,rulesVersion:DROP_UPLOAD_RULES_VERSION,rulesAcceptedAt:now})}catch(e){blocked=(e as {code?:string}).code==="DROP_UPLOAD_RULES_NOT_ACCEPTED"}
console.log(JSON.stringify({version:accepted.version,missingAcceptanceBlocked:blocked},null,2));if(!blocked)process.exit(2);'

echo '[6/9] Nginx multipart route contract'
NGINX_DUMP=$(nginx -T 2>/dev/null)
grep -Fq 'location ~ ^/api/drop/uploads/[^/]+/parts/[0-9]+$' <<<"$NGINX_DUMP"
grep -Fq 'client_max_body_size 70m;' <<<"$NGINX_DUMP"
grep -Fq 'proxy_request_buffering off;' <<<"$NGINX_DUMP"
nginx -t

echo '[7/9] Proxy streaming bypass contract'
node scripts/drop-proxy-streaming-bypass.test.mjs

echo '[8/9] UI information contract'
grep -Fq '500 MB / fájl' components/drop/DropUploadRulesNotice.tsx
grep -Fq 'Hamarosan: akár 2 GB / fájl' components/drop/DropUploadRulesNotice.tsx
grep -Fq 'hamarosan 1–2 GB-ra emelkedik' components/drop/DropUploadRulesNotice.tsx
grep -Fq 'Elolvastam és elfogadom a feltöltési szabályokat' components/drop/DropUploadRulesNotice.tsx

echo '[9/9] Targeted lint and TypeScript'
npx eslint \
  app/lib/drop/dropUploadRules.ts \
  app/lib/drop/dropFeatureFlags.ts \
  app/lib/drop/dropRuntime.ts \
  app/lib/drop/dropRepository.ts \
  app/lib/drop/storage/dropStorageConfig.ts \
  app/lib/drop/storage/dropStorageRepository.ts \
  app/lib/drop/storage/dropUploadService.ts \
  app/lib/drop/storage/dropMultipartLocalStorage.ts \
  app/lib/drop/storage/dropS3Storage.ts \
  app/api/drop/access/uploads/init/route.ts \
  app/api/drop/spaces/packages/'[packageId]'/uploads/init/route.ts \
  app/api/drop/uploads/'[uploadId]'/parts/route.ts \
  app/api/drop/uploads/'[uploadId]'/parts/'[partNumber]'/route.ts \
  components/drop/dropMultipartClient.ts \
  components/drop/DropUploadRulesNotice.tsx \
  components/drop/DropPackageQuarantineUpload.tsx \
  components/drop/DropCapabilityQuarantineUpload.tsx \
  scripts/drop-resumable-code-contract.test.mjs \
  scripts/drop-resumable-post-sql-integration.test.ts \
  --max-warnings=0
npx tsc --noEmit --pretty false

echo 'DROP 0.3.4 post-SQL resumable multipart preflight 9/9: PASS'
