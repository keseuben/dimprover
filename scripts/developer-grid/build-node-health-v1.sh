#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

schema_version=1
expected_user="dimproadmin"
expected_node="${1:-}"

case "${expected_node}" in
  build01|build02) ;;
  *)
    echo '{"ok":false,"error":"INVALID_NODE_ID"}'
    exit 64
    ;;
esac

if [[ "$(id -un)" != "${expected_user}" ]]; then
  echo '{"ok":false,"error":"INVALID_EXECUTION_USER"}'
  exit 77
fi

actual_hostname="$(hostname -s)"
if [[ "${actual_hostname}" != "${expected_node}" ]]; then
  echo '{"ok":false,"error":"HOSTNAME_MISMATCH"}'
  exit 78
fi

build_root="/srv/dimpro-build"
toolchain_env="${build_root}/toolchains/node.env"
state_root="${build_root}/state"
lock_file="${state_root}/full-build.lock"
current_run_file="${state_root}/current-run.json"
retention_config="/srv/dimpro-build/config/retention-v1.json"

read_cpu_line() {
  awk '/^cpu / { idle=$5+$6; total=0; for (i=2;i<=NF;i++) total+=$i; print idle, total; exit }' /proc/stat
}

read -r cpu_idle_a cpu_total_a < <(read_cpu_line)
sleep 0.2
read -r cpu_idle_b cpu_total_b < <(read_cpu_line)
cpu_delta_total=$((cpu_total_b - cpu_total_a))
cpu_delta_idle=$((cpu_idle_b - cpu_idle_a))
if (( cpu_delta_total > 0 )); then
  cpu_percent="$(awk -v total="${cpu_delta_total}" -v idle="${cpu_delta_idle}" 'BEGIN { printf "%.1f", (1-(idle/total))*100 }')"
else
  cpu_percent=0
fi

mem_total_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
mem_available_kb="$(awk '/^MemAvailable:/ {print $2}' /proc/meminfo)"
swap_total_kb="$(awk '/^SwapTotal:/ {print $2}' /proc/meminfo)"
swap_free_kb="$(awk '/^SwapFree:/ {print $2}' /proc/meminfo)"
mem_total_bytes=$((mem_total_kb * 1024))
mem_available_bytes=$((mem_available_kb * 1024))
mem_used_bytes=$((mem_total_bytes - mem_available_bytes))
swap_total_bytes=$((swap_total_kb * 1024))
swap_used_bytes=$(((swap_total_kb - swap_free_kb) * 1024))
memory_percent="$(awk -v used="${mem_used_bytes}" -v total="${mem_total_bytes}" 'BEGIN { if (total>0) printf "%.1f", used/total*100; else print "0" }')"
swap_percent="$(awk -v used="${swap_used_bytes}" -v total="${swap_total_bytes}" 'BEGIN { if (total>0) printf "%.1f", used/total*100; else print "0" }')"

read -r disk_total_bytes disk_used_bytes disk_available_bytes disk_percent_raw < <(
  df -B1 --output=size,used,avail,pcent "${build_root}" | awk 'NR==2 {print $1,$2,$3,$4}'
)
disk_percent="${disk_percent_raw%%%}"
load1="$(awk '{print $1}' /proc/loadavg)"
uptime_seconds="$(awk '{printf "%d", $1}' /proc/uptime)"
cores="$(nproc)"
sampled_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
swap_minimum_bytes=$((4 * 1024 * 1024 * 1024))

lock_held=false
if [[ -e "${lock_file}" ]] && ! flock -n "${lock_file}" -c true; then
  lock_held=true
fi

current_run_id=null
if [[ -f "${current_run_file}" ]]; then
  current_run_value="$(jq -r '.runId // empty' "${current_run_file}" 2>/dev/null | head -c 160 || true)"
  if [[ -n "${current_run_value}" ]]; then
    current_run_id="$(jq -Rn --arg value "${current_run_value}" '$value')"
  fi
fi

node_version=""
npm_version=""
if [[ -r "${toolchain_env}" ]]; then
  # shellcheck disable=SC1090
  source "${toolchain_env}"
  node_version="$(node --version 2>/dev/null || true)"
  npm_version="$(npm --version 2>/dev/null || true)"
fi
git_version="$(git --version 2>/dev/null | awk '{print $3}' || true)"
toolchain_ready=false
if [[ "${node_version}" == "v22.23.2" && "${npm_version}" == "10.9.8" && "${git_version}" == "2.43.0" ]]; then
  toolchain_ready=true
fi

retention_config_ready=false
safe_below=35
watch_below=45
auto_clean_below=55
cache_prune_below=65
wait_below=75
deny_below=85
if [[ -r "${retention_config}" ]]; then
  if jq -e '
      .schemaVersion == 1 and
      .environment == "DEV" and
      .productionAccess == "DENY" and
      .buildRoot == "/srv/dimpro-build" and
      (.storageGovernor.safeBelowPercent|type) == "number" and
      (.storageGovernor.watchBelowPercent|type) == "number" and
      (.storageGovernor.autoCleanBelowPercent|type) == "number" and
      (.storageGovernor.cachePruneBelowPercent|type) == "number" and
      (.storageGovernor.waitBelowPercent|type) == "number" and
      (.storageGovernor.denyBelowPercent|type) == "number"
    ' "${retention_config}" >/dev/null 2>&1; then
    safe_below="$(jq -r '.storageGovernor.safeBelowPercent' "${retention_config}")"
    watch_below="$(jq -r '.storageGovernor.watchBelowPercent' "${retention_config}")"
    auto_clean_below="$(jq -r '.storageGovernor.autoCleanBelowPercent' "${retention_config}")"
    cache_prune_below="$(jq -r '.storageGovernor.cachePruneBelowPercent' "${retention_config}")"
    wait_below="$(jq -r '.storageGovernor.waitBelowPercent' "${retention_config}")"
    deny_below="$(jq -r '.storageGovernor.denyBelowPercent' "${retention_config}")"
    if (( safe_below > 0 && safe_below < watch_below && watch_below < auto_clean_below && auto_clean_below < cache_prune_below && cache_prune_below < wait_below && wait_below < deny_below && deny_below <= 95 )); then
      retention_config_ready=true
    fi
  fi
fi

if (( disk_percent < safe_below )); then
  storage_governor="SAFE"
elif (( disk_percent < watch_below )); then
  storage_governor="WATCH"
elif (( disk_percent < auto_clean_below )); then
  storage_governor="AUTO_CLEAN"
elif (( disk_percent < cache_prune_below )); then
  storage_governor="CACHE_PRUNE"
elif (( disk_percent < wait_below )); then
  storage_governor="WAIT"
elif (( disk_percent < deny_below )); then
  storage_governor="DENY"
else
  storage_governor="CRITICAL"
fi

state="READY"
reason="MCP SSH health probe rendben; runner szabad."
if [[ "${retention_config_ready}" != "true" ]]; then
  state="BLOCKED"
  reason="A DIMPRO Build Retention V1 konfiguráció hiányzik vagy érvénytelen."
elif [[ "${toolchain_ready}" != "true" ]]; then
  state="BLOCKED"
  reason="A rögzített Node.js/npm/Git toolchain nem egyezik."
elif (( swap_total_bytes < swap_minimum_bytes )); then
  state="BLOCKED"
  reason="A FULL BUILD runner swap kapacitása 4 GB alatt van."
elif [[ "${storage_governor}" == "CRITICAL" || "${storage_governor}" == "DENY" ]]; then
  state="BLOCKED"
  reason="Storage Governor új buildet tilt."
elif [[ "${storage_governor}" == "WAIT" ]]; then
  state="DEGRADED"
  reason="Storage Governor: új build várakozik."
elif [[ "${lock_held}" == "true" ]]; then
  state="BUSY"
  reason="A runner helyi FULL BUILD lockja foglalt."
elif [[ "${storage_governor}" != "SAFE" ]]; then
  reason="MCP SSH health probe rendben; Storage Governor: ${storage_governor}."
fi

jq -n   --argjson schemaVersion "${schema_version}"   --arg id "${expected_node}"   --arg hostname "${actual_hostname}.dimpro.hu"   --arg state "${state}"   --arg reason "${reason}"   --arg sampledAt "${sampled_at}"   --arg source "DIMPRO_MCP_SSH_GATEWAY"   --arg quality "LIVE"   --arg storageGovernor "${storage_governor}"   --arg nodeVersion "${node_version}"   --arg npmVersion "${npm_version}"   --arg gitVersion "${git_version}"   --arg architecture "$(uname -m)"   --arg kernel "$(uname -r)"   --argjson cpuPercent "${cpu_percent}"   --argjson load1 "${load1}"   --argjson cores "${cores}"   --argjson memoryTotalBytes "${mem_total_bytes}"   --argjson memoryUsedBytes "${mem_used_bytes}"   --argjson memoryAvailableBytes "${mem_available_bytes}"   --argjson memoryPercent "${memory_percent}"   --argjson swapTotalBytes "${swap_total_bytes}"   --argjson swapUsedBytes "${swap_used_bytes}"   --argjson swapMinimumBytes "${swap_minimum_bytes}"   --argjson swapPercent "${swap_percent}"   --argjson diskTotalBytes "${disk_total_bytes}"   --argjson diskUsedBytes "${disk_used_bytes}"   --argjson diskAvailableBytes "${disk_available_bytes}"   --argjson diskPercent "${disk_percent}"   --argjson uptimeSeconds "${uptime_seconds}"   --argjson lockHeld "${lock_held}"   --argjson toolchainReady "${toolchain_ready}"   --argjson currentRunId "${current_run_id}"   '{
    schemaVersion: $schemaVersion,
    id: $id,
    hostname: $hostname,
    state: $state,
    reason: $reason,
    lastVerifiedAt: $sampledAt,
    source: $source,
    quality: $quality,
    metrics: {
      cpuPercent: $cpuPercent,
      load1: $load1,
      cores: $cores,
      memoryTotalBytes: $memoryTotalBytes,
      memoryUsedBytes: $memoryUsedBytes,
      memoryAvailableBytes: $memoryAvailableBytes,
      memoryPercent: $memoryPercent,
      swapTotalBytes: $swapTotalBytes,
      swapUsedBytes: $swapUsedBytes,
      swapMinimumBytes: $swapMinimumBytes,
      swapPercent: $swapPercent,
      diskTotalBytes: $diskTotalBytes,
      diskUsedBytes: $diskUsedBytes,
      diskAvailableBytes: $diskAvailableBytes,
      diskPercent: $diskPercent,
      uptimeSeconds: $uptimeSeconds,
      buildLockHeld: $lockHeld,
      currentRunId: $currentRunId,
      queueDepth: null,
      storageGovernor: $storageGovernor,
      toolchainReady: $toolchainReady,
      nodeVersion: $nodeVersion,
      npmVersion: $npmVersion,
      gitVersion: $gitVersion,
      architecture: $architecture,
      kernel: $kernel
    }
  }'
