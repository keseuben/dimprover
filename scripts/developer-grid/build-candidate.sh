#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED_ROOT="/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v1-20260827"
EXPECTED_BRANCH="feature/benjadmin-developer-grid-v1-20260827"
EXPECTED_COMMON="/srv/dimpro-dev/repositories/dimprover.git"
EXPECTED_HOST="dimpro-dev"
TARGET=".next"

fail() {
  echo "BLOCKED · $1" >&2
  exit "${2:-1}"
}

[[ "$(hostname)" == "$EXPECTED_HOST" ]] || fail "CANONICAL_DEV_HOST_MISMATCH" 40
[[ "$ROOT" == "$EXPECTED_ROOT" ]] || fail "CANONICAL_DEV_WORKTREE_MISMATCH" 41
[[ "$(git -C "$ROOT" branch --show-current)" == "$EXPECTED_BRANCH" ]] || fail "SOURCE_BASELINE_MISMATCH · branch" 42
COMMON="$(readlink -f "$(git -C "$ROOT" rev-parse --git-common-dir)")"
[[ "$COMMON" == "$EXPECTED_COMMON" ]] || fail "SOURCE_BASELINE_MISMATCH · repository" 43
HEAD="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$HEAD" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_BASELINE_MISMATCH · HEAD" 44
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]] || fail "SOURCE_WORKTREE_DIRTY" 45
[[ "$ROOT" == /srv/dimpro-dev/* ]] || fail "PROD_DENY" 46

if [[ "${1:-}" == "--preflight-only" ]]; then
  printf 'DEVELOPER_GRID_BUILD_PREFLIGHT=PASS\nHOST=%s\nROOT=%s\nBRANCH=%s\nHEAD=%s\nTARGET=%s\nPROD=DENY\n' \
    "$EXPECTED_HOST" "$ROOT" "$EXPECTED_BRANCH" "$HEAD" "$TARGET"
  exit 0
fi

export NEXT_DIST_DIR="$TARGET"
export NEXT_SAFE_BUILD=1
export NEXT_BUILD_CPUS=1
export NODE_OPTIONS="--max-old-space-size=3400"

# A canonical DEV buildhez csak a prerender által kötelező két publikus Supabase
# változót vesszük át a BENJADMIN DEV runtime-ból. A teljes PM2 környezetet és
# semmilyen PROD/secret értéket nem örökítünk át.
readarray -t DEV_PUBLIC_ENV < <(node <<'NODE'
const cp = require("node:child_process");
const all = JSON.parse(cp.execFileSync("pm2", ["jlist"], { encoding: "utf8" }));
const proc = all.find((item) => item.name === "dimpro-benjadmin-operator-ui-v2-dev");
if (!proc) process.exit(21);
const env = proc.pm2_env || {};
for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY"]) {
  const value = String(env[key] || "").trim();
  if (!value) process.exit(22);
  process.stdout.write(Buffer.from(value, "utf8").toString("base64") + "\n");
}
NODE
) || fail "DEV_PUBLIC_ENV_UNAVAILABLE" 47
[[ "${#DEV_PUBLIC_ENV[@]}" -eq 2 ]] || fail "DEV_PUBLIC_ENV_UNAVAILABLE" 47
export NEXT_PUBLIC_SUPABASE_URL="$(printf '%s' "${DEV_PUBLIC_ENV[0]}" | base64 -d)"
export NEXT_PUBLIC_SUPABASE_ANON_KEY="$(printf '%s' "${DEV_PUBLIC_ENV[1]}" | base64 -d)"
[[ -n "$NEXT_PUBLIC_SUPABASE_URL" && -n "$NEXT_PUBLIC_SUPABASE_ANON_KEY" ]] || fail "DEV_PUBLIC_ENV_UNAVAILABLE" 47

export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-OutminAI}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-Developer Grid v0.1.4 canonical webpack candidate}"
export DIMPRO_WORKER_CODE="OUTMINAI"

"$ROOT/scripts/dimpro-dev-storage-prebuild.sh"

UNIT="dimpro-developer-grid-build-$(date +%s)-$$"
exec "$ROOT/scripts/dimpro-coordinated-operation.sh" build -- \
  systemd-run --scope --quiet --unit="$UNIT" \
    -p CPUQuota=100% \
    -p MemoryHigh=4800M \
    -p MemoryMax=5500M \
    -p MemorySwapMax=512M \
    -p IOWeight=10 \
    nice -n 10 ionice -c2 -n7 \
    bash -lc 'cd "$1" && export DIMPRO_RELEASE_SOURCE_COMMIT="$2" DIMPRO_RELEASE_SOURCE_BRANCH="$3" NEXT_DIST_DIR="$4" NEXT_SAFE_BUILD=1 NEXT_BUILD_CPUS=1 NODE_OPTIONS="--max-old-space-size=3400" NEXT_PUBLIC_SUPABASE_URL="$5" NEXT_PUBLIC_SUPABASE_ANON_KEY="$6" && ./node_modules/.bin/next build --webpack && NEXT_DIST_DIR="$4" node scripts/ensure-next-standalone-assets.cjs --force && node scripts/dimpro-dev-storage-retention.mjs --post-build --apply-builds --quiet' \
    _ "$ROOT" "$HEAD" "$EXPECTED_BRANCH" "$TARGET" "$NEXT_PUBLIC_SUPABASE_URL" "$NEXT_PUBLIC_SUPABASE_ANON_KEY"
