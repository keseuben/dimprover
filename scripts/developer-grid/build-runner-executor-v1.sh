#!/usr/bin/env bash
set -Eeuo pipefail
umask 027

BUILD_ROOT="/srv/dimpro-build"
STATE_ROOT="${BUILD_ROOT}/state"
REPO="${BUILD_ROOT}/repositories/dimprover.git"
LOCK_FILE="${STATE_ROOT}/full-build.lock"
CURRENT_RUN="${STATE_ROOT}/current-run.json"
RESULT_ROOT="${STATE_ROOT}/results"
TOOLCHAIN_ENV="${BUILD_ROOT}/toolchains/node.env"
BUILD_PUBLIC_ENV="${STATE_ROOT}/build-public-env.json"
NPM_CACHE="${BUILD_ROOT}/cache/npm"
ARTIFACT_ROOT="${BUILD_ROOT}/artifacts"
TEMP_ROOT="${BUILD_ROOT}/temp"
WORKTREE_ROOT="${BUILD_ROOT}/worktrees"
LOG_ROOT="${BUILD_ROOT}/logs"

node_id="${1:-}"
run_id="${2:-}"
task_id="${3:-}"
session_id="${4:-}"
worker_code="${5:-}"
source_commit="${6:-}"
source_branch="${7:-}"

fail_json() {
  local code="$1"
  local message="$2"
  mkdir -p "${RESULT_ROOT}"
  jq -n \
    --arg runId "${run_id:-unknown}" \
    --arg nodeId "${node_id:-unknown}" \
    --arg code "${code}" \
    --arg message "${message}" \
    --arg finishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    '{schemaVersion:1,environment:"DEV",productionAccess:"DENY",status:"FAIL",runId:$runId,nodeId:$nodeId,code:$code,message:$message,finishedAt:$finishedAt}' \
    > "${RESULT_ROOT}/${run_id:-unknown}.json"
  echo "{\"ok\":false,\"status\":\"FAIL\",\"code\":\"${code}\"}"
  exit 1
}

case "${node_id}" in build01|build02) ;; *) fail_json "INVALID_NODE_ID" "Runner node azonosító érvénytelen." ;; esac
[[ "$(id -un)" == "dimproadmin" ]] || fail_json "INVALID_EXECUTION_USER" "Runner csak dimproadmin felhasználóként futtatható."
[[ "$(hostname -s)" == "${node_id}" ]] || fail_json "HOSTNAME_MISMATCH" "Runner hostname nem egyezik a kijelölt node-dal."

safe_id_re='^[A-Za-z0-9][A-Za-z0-9._:-]{2,159}$'
[[ "${run_id}" =~ ${safe_id_re} ]] || fail_json "RUN_ID_INVALID" "runId érvénytelen."
[[ "${task_id}" =~ ${safe_id_re} ]] || fail_json "TASK_ID_INVALID" "taskId érvénytelen."
[[ "${session_id}" =~ ${safe_id_re} ]] || fail_json "SESSION_ID_INVALID" "sessionId érvénytelen."
case "${worker_code}" in ARMINAI|OUTMINAI|BENJAMINAI|JAZMINAI|DEVMINAI) ;; *) fail_json "WORKER_CODE_INVALID" "workerCode érvénytelen." ;; esac
[[ "${source_commit}" =~ ^[0-9a-fA-F]{40}$ ]] || fail_json "SOURCE_COMMIT_INVALID" "sourceCommit nem teljes Git SHA."
git check-ref-format --branch "${source_branch}" >/dev/null 2>&1 || fail_json "SOURCE_BRANCH_INVALID" "sourceBranch érvénytelen."
[[ "${source_branch}" != -* && "${source_branch}" != *".."* ]] || fail_json "SOURCE_BRANCH_INVALID" "sourceBranch tiltott."

mkdir -p "${RESULT_ROOT}" "${NPM_CACHE}" "${ARTIFACT_ROOT}" "${TEMP_ROOT}" "${WORKTREE_ROOT}" "${LOG_ROOT}"
bundle="${TEMP_ROOT}/${run_id}.bundle"
artifact_dir="${ARTIFACT_ROOT}/${run_id}"
worktree="${WORKTREE_ROOT}/${run_id}"
log_file="${LOG_ROOT}/${run_id}.log"
result_file="${RESULT_ROOT}/${run_id}.json"

cleanup() {
  local ec=$?
  if [[ -d "${worktree}" ]]; then
    git --git-dir="${REPO}" worktree remove --force "${worktree}" >/dev/null 2>&1 || true
  fi
  rm -f "${bundle}"
  if [[ -f "${CURRENT_RUN}" ]]; then
    current="$(jq -r '.runId // empty' "${CURRENT_RUN}" 2>/dev/null || true)"
    [[ "${current}" == "${run_id}" ]] && rm -f "${CURRENT_RUN}"
  fi
  if (( ec != 0 )) && [[ ! -s "${result_file}" ]]; then
    jq -n \
      --arg runId "${run_id}" --arg nodeId "${node_id}" --arg finishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
      --argjson exitCode "${ec}" \
      '{schemaVersion:1,environment:"DEV",productionAccess:"DENY",status:"FAIL",runId:$runId,nodeId:$nodeId,code:"RUNNER_EXECUTION_FAILED",exitCode:$exitCode,finishedAt:$finishedAt}' \
      > "${result_file}"
  fi
}
trap cleanup EXIT

[[ -f "${bundle}" ]] || fail_json "SOURCE_BUNDLE_MISSING" "A forrás Git bundle nem érkezett meg."
[[ ! -e "${artifact_dir}" ]] || fail_json "ARTIFACT_RUN_ALREADY_EXISTS" "Ehhez a runId-hez már létezik artifact."
[[ ! -e "${worktree}" ]] || fail_json "WORKTREE_RUN_ALREADY_EXISTS" "Ehhez a runId-hez már létezik worktree."

exec 9>"${LOCK_FILE}"
if ! flock -n 9; then
  fail_json "RUNNER_LOCAL_LOCK_BUSY" "A runner FULL BUILD lock foglalt."
fi

if [[ ! -r "${TOOLCHAIN_ENV}" ]]; then
  fail_json "TOOLCHAIN_ENV_MISSING" "A rögzített Node toolchain környezet hiányzik."
fi
# shellcheck disable=SC1090
source "${TOOLCHAIN_ENV}"
[[ "$(node --version 2>/dev/null || true)" == "v22.23.2" ]] || fail_json "NODE_VERSION_MISMATCH" "Node.js verzió eltér."
[[ "$(npm --version 2>/dev/null || true)" == "10.9.8" ]] || fail_json "NPM_VERSION_MISMATCH" "npm verzió eltér."
[[ "$(git --version 2>/dev/null | awk '{print $3}' || true)" == "2.43.0" ]] || fail_json "GIT_VERSION_MISMATCH" "Git verzió eltér."

[[ -r "${BUILD_PUBLIC_ENV}" ]] || fail_json "BUILD_PUBLIC_ENV_MISSING" "A build public konfiguráció hiányzik."
public_keys="$(jq -r 'keys | sort | join(",")' "${BUILD_PUBLIC_ENV}" 2>/dev/null || true)"
[[ "${public_keys}" == "NEXT_PUBLIC_SUPABASE_ANON_KEY,NEXT_PUBLIC_SUPABASE_URL" ]] || fail_json "BUILD_PUBLIC_ENV_KEYS_INVALID" "A build public konfiguráció kulcsai érvénytelenek."
NEXT_PUBLIC_SUPABASE_URL="$(jq -er '.NEXT_PUBLIC_SUPABASE_URL | select(type == "string" and startswith("https://") and length <= 500)' "${BUILD_PUBLIC_ENV}" 2>/dev/null || true)"
NEXT_PUBLIC_SUPABASE_ANON_KEY="$(jq -er '.NEXT_PUBLIC_SUPABASE_ANON_KEY | select(type == "string" and length >= 20 and length <= 4096)' "${BUILD_PUBLIC_ENV}" 2>/dev/null || true)"
[[ -n "${NEXT_PUBLIC_SUPABASE_URL}" ]] || fail_json "BUILD_PUBLIC_SUPABASE_URL_INVALID" "A public Supabase URL érvénytelen."
[[ -n "${NEXT_PUBLIC_SUPABASE_ANON_KEY}" ]] || fail_json "BUILD_PUBLIC_SUPABASE_ANON_INVALID" "A public Supabase anon kulcs érvénytelen."
export NEXT_PUBLIC_SUPABASE_URL NEXT_PUBLIC_SUPABASE_ANON_KEY
unset SUPABASE_SERVICE_ROLE_KEY SUPABASE_DB_PASSWORD SUPABASE_DB_URL || true

bundle_head="$(git bundle list-heads "${bundle}" "refs/heads/${source_branch}" | awk 'NR==1{print $1}')"
[[ "${bundle_head}" == "${source_commit}" ]] || fail_json "SOURCE_BUNDLE_HEAD_MISMATCH" "A bundle branch HEAD nem egyezik a kért sourceCommit értékkel."

if [[ ! -d "${REPO}" ]]; then
  git init --bare "${REPO}" >/dev/null
fi
git --git-dir="${REPO}" bundle verify "${bundle}" >/dev/null 2>&1 || fail_json "SOURCE_BUNDLE_VERIFY_FAILED" "A Git bundle ellenőrzése sikertelen."
git --git-dir="${REPO}" fetch --force "${bundle}" "refs/heads/${source_branch}:refs/heads/${source_branch}" >>"${log_file}" 2>&1 \
  || fail_json "SOURCE_FETCH_FAILED" "A forrás branch nem tölthető be a runner repositoryba."
resolved="$(git --git-dir="${REPO}" rev-parse "refs/heads/${source_branch}^{commit}" 2>/dev/null || true)"
[[ "${resolved}" == "${source_commit}" ]] || fail_json "SOURCE_PROVENANCE_MISMATCH" "A runner repository branch HEAD eltér a kért committól."

jq -n \
  --arg runId "${run_id}" --arg taskId "${task_id}" --arg sessionId "${session_id}" \
  --arg workerCode "${worker_code}" --arg nodeId "${node_id}" \
  --arg sourceCommit "${source_commit}" --arg sourceBranch "${source_branch}" \
  --arg startedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{schemaVersion:1,environment:"DEV",productionAccess:"DENY",runId:$runId,taskId:$taskId,sessionId:$sessionId,workerCode:$workerCode,nodeId:$nodeId,sourceCommit:$sourceCommit,sourceBranch:$sourceBranch,startedAt:$startedAt}' \
  > "${CURRENT_RUN}"

git --git-dir="${REPO}" worktree add --detach "${worktree}" "${source_commit}" >>"${log_file}" 2>&1 \
  || fail_json "WORKTREE_CREATE_FAILED" "A runner worktree nem hozható létre."

cd "${worktree}"
[[ -f package.json && -f package-lock.json ]] || fail_json "NPM_LOCKFILE_REQUIRED" "package.json/package-lock.json hiányzik."

export npm_config_cache="${NPM_CACHE}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=8192}"
export NEXT_SAFE_BUILD=1
export NEXT_BUILD_CPUS="${NEXT_BUILD_CPUS:-4}"
export DIMPRO_RELEASE_SOURCE_COMMIT="${source_commit}"
export DIMPRO_RELEASE_SOURCE_BRANCH="${source_branch}"

{
  echo "[DIMPRO BUILD RUNNER] npm ci"
  npm ci --no-audit --no-fund
  echo "[DIMPRO BUILD RUNNER] npm run build:raw"
  npm run build:raw
} >>"${log_file}" 2>&1 || fail_json "FULL_BUILD_FAILED" "A FULL BUILD sikertelen; részletek a runner lokális logjában."

[[ -s .next/BUILD_ID ]] || fail_json "BUILD_ID_MISSING" "A buildből hiányzik a BUILD_ID."
[[ -f .next/standalone/server.js ]] || fail_json "STANDALONE_MISSING" "A standalone server artifact hiányzik."
[[ -f .next/.dimpro-release.json ]] || fail_json "RELEASE_METADATA_MISSING" "A release metadata hiányzik."

build_id="$(cat .next/BUILD_ID)"
release_commit="$(jq -r '.gitCommit // empty' .next/.dimpro-release.json 2>/dev/null || true)"
release_branch="$(jq -r '.gitBranch // empty' .next/.dimpro-release.json 2>/dev/null || true)"
[[ "${release_commit}" == "${source_commit}" ]] || fail_json "RELEASE_COMMIT_MISMATCH" "A build release metadata commit eltér."
[[ "${release_branch}" == "${source_branch}" ]] || fail_json "RELEASE_BRANCH_MISMATCH" "A build release metadata branch eltér."

mkdir "${artifact_dir}"
tar -C "${worktree}" -czf "${artifact_dir}/build-artifact.tar.gz" \
  .next/standalone .next/BUILD_ID .next/.dimpro-release.json
artifact_sha="$(sha256sum "${artifact_dir}/build-artifact.tar.gz" | awk '{print $1}')"
created_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

jq -n \
  --arg buildId "${build_id}" --arg runId "${run_id}" --arg taskId "${task_id}" --arg sessionId "${session_id}" \
  --arg workerCode "${worker_code}" --arg sourceCommit "${source_commit}" --arg sourceBranch "${source_branch}" \
  --arg artifactSha256 "${artifact_sha}" --arg nodeId "${node_id}" --arg hostname "${node_id}.dimpro.hu" \
  --arg createdAt "${created_at}" \
  '{schemaVersion:1,environment:"DEV",productionAccess:"DENY",buildId:$buildId,runId:$runId,taskId:$taskId,sessionId:$sessionId,workerCode:$workerCode,sourceCommit:$sourceCommit,sourceBranch:$sourceBranch,artifactSha256:$artifactSha256,runner:{id:$nodeId,hostname:$hostname},createdAt:$createdAt}' \
  > "${artifact_dir}/metadata.json"

jq -n \
  --arg runId "${run_id}" --arg nodeId "${node_id}" --arg buildId "${build_id}" \
  --arg artifactSha256 "${artifact_sha}" --arg finishedAt "${created_at}" \
  '{schemaVersion:1,environment:"DEV",productionAccess:"DENY",status:"PASS",runId:$runId,nodeId:$nodeId,buildId:$buildId,artifactSha256:$artifactSha256,finishedAt:$finishedAt}' \
  > "${result_file}"

echo "{\"ok\":true,\"status\":\"PASS\",\"runId\":\"${run_id}\",\"nodeId\":\"${node_id}\",\"buildId\":\"${build_id}\",\"artifactSha256\":\"${artifact_sha}\"}"
