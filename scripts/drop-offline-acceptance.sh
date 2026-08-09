#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "[1/11] Core security"
npx --yes tsx scripts/drop-core-security.test.ts

echo "[2/11] Database schema contract"
node scripts/drop-schema-contract.test.mjs

echo "[3/11] Atomic package creation contract"
node scripts/drop-package-creation-contract.test.mjs

echo "[4/11] Activation preflight"
NEXT_ENV_PROJECT_DIR="$PWD" DROP_PREFLIGHT_EXPECT_RELEASE_GATE="${DROP_PREFLIGHT_EXPECT_RELEASE_GATE:-false}" node -r ./scripts/load-next-env.cjs scripts/drop-activation-preflight.mjs

echo "[5/11] Package preview"
npx --yes tsx scripts/drop-preview.test.ts

echo "[6/11] Package lifecycle"
npx --yes tsx scripts/drop-lifecycle.test.ts

echo "[7/11] Access engine integration"
npx --yes tsx scripts/drop-access-memory.test.ts

echo "[8/11] Admin lifecycle integration"
npx --yes tsx scripts/drop-admin-lifecycle.test.ts

echo "[9/11] Admin API contract"
node scripts/drop-admin-api-contract.test.mjs

echo "[10/11] Targeted ESLint"
npx eslint \
  app/api/drop \
  app/drop \
  app/drive/drop \
  app/lib/drop \
  components/drop   components/ui/HoldActionButton.tsx \
  scripts/drop-activation-preflight.mjs \
  scripts/drop-admin-api-contract.test.mjs \
  scripts/drop-core-security.test.ts \
  scripts/drop-package-creation-contract.test.mjs \
  scripts/drop-post-activation-integration.test.ts \
  scripts/drop-preview.test.ts \
  scripts/drop-lifecycle.test.ts \
  scripts/drop-access-memory.test.ts \
  scripts/drop-admin-lifecycle.test.ts \
  scripts/drop-schema-contract.test.mjs \
  scripts/drop-smoke-test.mjs \
  scripts/drop-responsive-test.mjs \
  scripts/drop-email-notifications.test.ts \
  scripts/drop-email-live-integration.test.ts \
  scripts/drop-spaces-domain.test.ts \
  scripts/drop-spaces-schema-contract.test.mjs \
  scripts/drop-spaces-admin-contract.test.mjs \
  scripts/drop-spaces-live-integration.test.ts \
  scripts/drop-spaces-visual.test.mjs \
  scripts/drop-space-invitation-contract.test.mjs \
  scripts/drop-space-membership-live.test.ts \
  --max-warnings=0

echo "[11/11] TypeScript"
npx tsc --noEmit --pretty false

echo "DROP 0.2.0 offline acceptance: PASS"
