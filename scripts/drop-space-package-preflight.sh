#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/6] DROP 0.3.2 SQL contract"
node scripts/drop-space-package-schema-contract.test.mjs

echo "[2/6] DROP 0.3.2 code contract"
node scripts/drop-space-package-code-contract.test.mjs

echo "[3/6] Pre-SQL readiness must remain closed"
NEXT_ENV_PROJECT_DIR="$PWD" NODE_OPTIONS='-r ./scripts/load-next-env.cjs' npx --yes tsx -e '
import { getDropFeatureState } from "./app/lib/drop/dropFeatureFlags";
import { getDropRuntimeHealth } from "./app/lib/drop/dropRuntime";
void (async()=>{
  const feature=getDropFeatureState();
  const health=await getDropRuntimeHealth();
  const out={
    spacesEnabled:feature.flags.spacesEnabled,
    spacePackageCreationEnabled:feature.flags.spacePackageCreationEnabled,
    spacesEngine:health.readiness.spacesEngine,
    spacePackageSchema:health.readiness.spacePackageSchema,
    spacePackageCreation:health.readiness.spacePackageCreation,
    publicUpload:health.readiness.publicUpload,
    migrationMode:health.database.migrationMode,
  };
  console.log(JSON.stringify(out,null,2));
  if(out.spacesEnabled!==true || out.spacesEngine!==true || out.spacePackageCreationEnabled!==false || out.spacePackageSchema!==false || out.spacePackageCreation!==false || out.publicUpload!==false) process.exit(2);
})().catch((error)=>{console.error(error);process.exit(1)});
'

echo "[4/6] DROP 0.3.1 invitations and spaces regression"
bash scripts/drop-spaces-preflight.sh

echo "[5/6] Targeted ESLint"
npx eslint \
  app/api/drop/spaces/packages/route.ts \
  app/lib/drop/dropTypes.ts \
  app/lib/drop/dropFeatureFlags.ts \
  app/lib/drop/dropRepository.ts \
  app/lib/drop/dropRuntime.ts \
  app/lib/drop/dropSpaceRepository.ts \
  app/lib/drop/dropSpacePackageService.ts \
  components/drop/DropSpacePackagePanel.tsx \
  components/drop/DropSpaceGuestWorkspace.tsx \
  scripts/drop-space-package-schema-contract.test.mjs \
  scripts/drop-space-package-code-contract.test.mjs \
  --max-warnings=0

echo "[6/6] TypeScript"
npx tsc --noEmit --pretty false

echo "DROP 0.3.2 pre-SQL space package preflight: PASS"
