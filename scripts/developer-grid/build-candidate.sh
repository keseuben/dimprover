#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED_ROOT="/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905"
EXPECTED_BRANCH="feature/benjadmin-developer-grid-v013-outminai-20260905"
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

# A canonical Next build csak akkor indulhat, ha a gépen ténylegesen van
# elegendő szabad memória és a swap nincs tartós nyomás alatt. Ez külön kapu
# a storage preflight mellett, hogy az éjszakai automata se indítson buildet
# egy már memória-nyomásos DEV hoston.
MEM_AVAILABLE_KIB="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
SWAP_TOTAL_KIB="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
SWAP_FREE_KIB="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"
[[ "$MEM_AVAILABLE_KIB" =~ ^[0-9]+$ ]] || fail "RESOURCE_MEMORY_PREFLIGHT_UNAVAILABLE" 48
[[ "$SWAP_TOTAL_KIB" =~ ^[0-9]+$ && "$SWAP_FREE_KIB" =~ ^[0-9]+$ ]] || fail "RESOURCE_SWAP_PREFLIGHT_UNAVAILABLE" 49
MIN_MEM_AVAILABLE_KIB=$((3 * 1024 * 1024))
MAX_SWAP_USED_PERCENT=85
SWAP_USED_PERCENT=0
if (( SWAP_TOTAL_KIB > 0 )); then
  SWAP_USED_PERCENT=$(( (SWAP_TOTAL_KIB - SWAP_FREE_KIB) * 100 / SWAP_TOTAL_KIB ))
fi
printf 'RESOURCE_PREFLIGHT memAvailableMiB=%s swapUsedPercent=%s maxSwapUsedPercent=%s
' "$((MEM_AVAILABLE_KIB / 1024))" "$SWAP_USED_PERCENT" "$MAX_SWAP_USED_PERCENT"
(( MEM_AVAILABLE_KIB >= MIN_MEM_AVAILABLE_KIB )) || fail "RESOURCE_MEMORY_PRESSURE" 50
(( SWAP_USED_PERCENT < MAX_SWAP_USED_PERCENT )) || fail "RESOURCE_SWAP_PRESSURE" 51

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
for encoded in "${DEV_PUBLIC_ENV[@]}"; do
  [[ -n "$encoded" ]] || fail "DEV_PUBLIC_ENV_UNAVAILABLE" 47
  printf '%s' "$encoded" | base64 -d >/dev/null 2>&1 || fail "DEV_PUBLIC_ENV_UNAVAILABLE" 47
done

# A publikus DEV build-változókat nem adjuk tovább command-line argumentumként,
# mert a központi koordinátor a parancsot audit history-ba írja. Ehelyett egy
# kizárólag root által olvasható, rövid életű base64 env-fájlt használunk.
BUILD_ENV_DIR="${DIMPRO_COORDINATION_ROOT:-/srv/dimpro-dev/coordination}/secrets"
umask 077
mkdir -p "$BUILD_ENV_DIR"
chmod 700 "$BUILD_ENV_DIR"
BUILD_ENV_FILE="$BUILD_ENV_DIR/developer-grid-build-${HEAD:0:12}-$$.envb64"
printf '%s\n%s\n' "${DEV_PUBLIC_ENV[0]}" "${DEV_PUBLIC_ENV[1]}" > "$BUILD_ENV_FILE"
chmod 600 "$BUILD_ENV_FILE"
unset DEV_PUBLIC_ENV
cleanup_build_env() { rm -f "$BUILD_ENV_FILE"; }
trap cleanup_build_env EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-OutminAI}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-Developer Grid v0.1.18 canonical DEV candidate}"
export DIMPRO_WORKER_CODE="OUTMINAI"

"$ROOT/scripts/dimpro-dev-storage-prebuild.sh"

UNIT="dimpro-developer-grid-build-$(date +%s)-$$"
"$ROOT/scripts/dimpro-coordinated-operation.sh" build -- \
  systemd-run --scope --quiet --unit="$UNIT" \
    -p CPUQuota=100% \
    -p MemoryHigh=4300M \
    -p MemoryMax=5000M \
    -p MemorySwapMax=512M \
    -p RuntimeMaxSec=2700s \
    -p IOWeight=10 \
    nice -n 10 ionice -c2 -n7 \
    bash -lc 'set -Eeuo pipefail; cd "$1"; BUILD_ENV_FILE="$5"; mapfile -t PUBLIC_ENV_B64 < "$BUILD_ENV_FILE"; [[ "${#PUBLIC_ENV_B64[@]}" -eq 2 ]]; export NEXT_PUBLIC_SUPABASE_URL="$(printf "%s" "${PUBLIC_ENV_B64[0]}" | base64 -d)" NEXT_PUBLIC_SUPABASE_ANON_KEY="$(printf "%s" "${PUBLIC_ENV_B64[1]}" | base64 -d)"; unset PUBLIC_ENV_B64; export DIMPRO_RELEASE_SOURCE_COMMIT="$2" DIMPRO_RELEASE_SOURCE_BRANCH="$3" NEXT_DIST_DIR="$4" NEXT_SAFE_BUILD=1 NEXT_BUILD_CPUS=1 NODE_OPTIONS="--max-old-space-size=3400"; ./node_modules/.bin/next build --webpack && NEXT_DIST_DIR="$4" node scripts/ensure-next-standalone-assets.cjs --force && node scripts/dimpro-dev-storage-retention.mjs --post-build --apply-builds --quiet' \
    _ "$ROOT" "$HEAD" "$EXPECTED_BRANCH" "$TARGET" "$BUILD_ENV_FILE"
