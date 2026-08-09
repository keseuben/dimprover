#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/7] DROP 0.3.0 spaces domain"
npx --yes tsx scripts/drop-spaces-domain.test.ts

echo "[2/7] DROP 0.3.0 SQL contract"
node scripts/drop-spaces-schema-contract.test.mjs

echo "[3/7] Admin API and UI contract"
node scripts/drop-spaces-admin-contract.test.mjs

echo "[4/7] DROP 0.3.1 invitation and session contract"
node scripts/drop-space-invitation-contract.test.mjs

echo "[5/7] DROP 0.3.0 schema readiness"
NEXT_ENV_PROJECT_DIR="$PWD" NODE_OPTIONS='-r ./scripts/load-next-env.cjs' npx --yes tsx -e '
import { getDropFeatureState } from "./app/lib/drop/dropFeatureFlags";
import { getDropRuntimeHealth } from "./app/lib/drop/dropRuntime";
void (async()=>{
  const feature=getDropFeatureState();
  const health=await getDropRuntimeHealth();
  console.log(JSON.stringify({spacesEnabled:feature.flags.spacesEnabled,spacesSchema:health.readiness.spacesSchema,spacesEngine:health.readiness.spacesEngine,uploadEnabled:health.uploadEnabled},null,2));
  if(!feature.flags.spacesEnabled || !health.readiness.spacesSchema || !health.readiness.spacesEngine || health.uploadEnabled) process.exit(2);
})().catch((error)=>{console.error(error);process.exit(1)});
'

echo "[6/7] Targeted ESLint"
npx eslint   app/api/drop/admin/spaces/route.ts   app/lib/drop/dropSpaceTypes.ts   app/lib/drop/dropSpacePermissions.ts   app/lib/drop/dropSpaceValidation.ts   app/lib/drop/dropSpaceRepository.ts   app/lib/drop/dropRuntime.ts   components/drop/DropSpaceManager.tsx   components/drop/DropPackageManager.tsx   scripts/drop-spaces-domain.test.ts   scripts/drop-spaces-schema-contract.test.mjs   scripts/drop-spaces-admin-contract.test.mjs   scripts/drop-spaces-live-integration.test.ts   scripts/drop-spaces-visual.test.mjs   --max-warnings=0

echo "[7/7] TypeScript"
npx tsc --noEmit --pretty false

echo "DROP 0.3.1 active spaces and invitations preflight: PASS"
