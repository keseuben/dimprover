#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ "$ROOT" == /srv/dimpro-dev/* ]]; then
  DEFAULT_BUILD_CPUS="2"
  DEFAULT_NODE_OPTIONS="--max-old-space-size=4096"
  DEFAULT_CPU_QUOTA="200%"
  DEFAULT_MEMORY_HIGH="4G"
  DEFAULT_MEMORY_MAX="6G"
  DEFAULT_MEMORY_SWAP_MAX="1G"
else
  DEFAULT_BUILD_CPUS="1"
  DEFAULT_NODE_OPTIONS="--max-old-space-size=2048"
  DEFAULT_CPU_QUOTA="80%"
  DEFAULT_MEMORY_HIGH="1800M"
  DEFAULT_MEMORY_MAX="2800M"
  DEFAULT_MEMORY_SWAP_MAX="3G"
fi

export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-${DIMPRO_BUILD_OWNER:-DIMPRO fejlesztés}}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-Next.js production build}"
export NEXT_SAFE_BUILD="${NEXT_SAFE_BUILD:-1}"
export NEXT_BUILD_CPUS="${NEXT_BUILD_CPUS:-$DEFAULT_BUILD_CPUS}"
export NODE_OPTIONS="${NODE_OPTIONS:-$DEFAULT_NODE_OPTIONS}"

CPU_QUOTA="${DIMPRO_BUILD_CPU_QUOTA:-$DEFAULT_CPU_QUOTA}"
MEMORY_HIGH="${DIMPRO_BUILD_MEMORY_HIGH:-$DEFAULT_MEMORY_HIGH}"
MEMORY_MAX="${DIMPRO_BUILD_MEMORY_MAX:-$DEFAULT_MEMORY_MAX}"
MEMORY_SWAP_MAX="${DIMPRO_BUILD_MEMORY_SWAP_MAX:-$DEFAULT_MEMORY_SWAP_MAX}"
UNIT_NAME="dimpro-build-$(date +%s)-$$"

exec "$ROOT/scripts/dimpro-coordinated-operation.sh" build -- \
  systemd-run --scope --quiet --unit="$UNIT_NAME" \
    -p CPUQuota="$CPU_QUOTA" \
    -p MemoryHigh="$MEMORY_HIGH" \
    -p MemoryMax="$MEMORY_MAX" \
    -p MemorySwapMax="$MEMORY_SWAP_MAX" \
    -p IOWeight=10 \
    nice -n 10 ionice -c2 -n7 \
    bash -lc 'cd "$1" && npx next build && node scripts/ensure-next-standalone-assets.cjs --force' \
    _ "$ROOT"
