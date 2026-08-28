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
export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-OutminAI}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-Developer Grid v0.1.1 canonical webpack candidate}"
export DIMPRO_WORKER_CODE="OUTMINAI"

"$ROOT/scripts/dimpro-dev-storage-prebuild.sh"

UNIT="dimpro-developer-grid-build-$(date +%s)-$$"
exec "$ROOT/scripts/dimpro-coordinated-operation.sh" build -- \
  systemd-run --scope --quiet --unit="$UNIT" \
    -p CPUQuota=100% \
    -p MemoryHigh=4G \
    -p MemoryMax=5G \
    -p MemorySwapMax=512M \
    -p IOWeight=10 \
    nice -n 10 ionice -c2 -n7 \
    bash -lc 'cd "$1" && export DIMPRO_RELEASE_SOURCE_COMMIT="$2" DIMPRO_RELEASE_SOURCE_BRANCH="$3" NEXT_DIST_DIR="$4" NEXT_SAFE_BUILD=1 NEXT_BUILD_CPUS=1 NODE_OPTIONS="--max-old-space-size=3400" && ./node_modules/.bin/next build --webpack && NEXT_DIST_DIR="$4" node scripts/ensure-next-standalone-assets.cjs --force && node scripts/dimpro-dev-storage-retention.mjs --post-build --apply-builds --quiet' \
    _ "$ROOT" "$HEAD" "$EXPECTED_BRANCH" "$TARGET"
