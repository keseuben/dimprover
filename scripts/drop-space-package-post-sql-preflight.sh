#!/usr/bin/env bash
set -euo pipefail

export NEXT_ENV_PROJECT_DIR="$PWD"
export NODE_OPTIONS='-r ./scripts/load-next-env.cjs'

echo '[1/7] DROP 0.3.2 SQL contract'
node scripts/drop-space-package-schema-contract.test.mjs

echo '[2/7] DROP 0.3.2 active code contract'
DROP_EXPECT_SPACE_PACKAGE_FEATURE=true node scripts/drop-space-package-code-contract.test.mjs

echo '[3/7] DROP 0.3.2 active readiness'
npx --yes tsx -e '
import { getDropFeatureState } from "./app/lib/drop/dropFeatureFlags";
import { getDropSpacePackageSchemaHealth, getDropSpacesSchemaHealth } from "./app/lib/drop/dropSpaceRepository";
void (async()=>{
  const feature=getDropFeatureState();
  const spaces=await getDropSpacesSchemaHealth();
  const packages=await getDropSpacePackageSchemaHealth();
  const result={
    version:feature.version,
    spacesEnabled:feature.flags.spacesEnabled,
    spacePackageCreationEnabled:feature.flags.spacePackageCreationEnabled,
    spacesSchema:spaces.ready,
    spacePackageSchema:packages.ready,
    uploadEnabled:feature.uploadEnabled,
  };
  console.log(JSON.stringify(result,null,2));
  const acceptedVersions=["DROP 0.3.2","DROP 0.3.3-staged","DROP 0.3.3","DROP 0.3.4-staged","DROP 0.3.4"];
  if(!acceptedVersions.includes(feature.version)||!result.spacesEnabled||!result.spacePackageCreationEnabled||!result.spacesSchema||!result.spacePackageSchema||result.uploadEnabled) process.exit(2);
})().catch(e=>{console.error(e);process.exit(1)});
'

echo '[4/7] DROP 0.3.2 real Supabase integration'
DROP_ALLOW_SPACE_PACKAGE_POST_SQL_TEST='DROP-SPACE-PACKAGE-POST-SQL-TEST' npx --yes tsx scripts/drop-space-package-post-sql-integration.test.ts

echo '[5/7] DROP 0.3.1 spaces and invitations regression'
bash scripts/drop-spaces-preflight.sh

echo '[6/7] Existing DROP package-engine regression'
DROP_PREFLIGHT_EXPECT_RELEASE_GATE=true bash scripts/drop-offline-acceptance.sh

echo '[7/7] Targeted lint and TypeScript'
npx eslint \
  app/lib/drop/dropFeatureFlags.ts \
  app/lib/drop/dropRuntime.ts \
  app/lib/drop/dropRepository.ts \
  app/lib/drop/dropSpaceRepository.ts \
  app/lib/drop/dropSpacePackageService.ts \
  app/api/drop/spaces/packages/route.ts \
  components/drop/DropSpacePackagePanel.tsx \
  components/drop/DropSpaceGuestWorkspace.tsx \
  scripts/drop-space-package-schema-contract.test.mjs \
  scripts/drop-space-package-code-contract.test.mjs \
  scripts/drop-space-package-post-sql-integration.test.ts \
  --max-warnings=0
npx tsc --noEmit --pretty false

echo 'DROP 0.3.2 post-SQL space-package preflight: PASS'
