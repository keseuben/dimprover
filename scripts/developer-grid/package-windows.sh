#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EXPECTED_ROOT="/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905"
EXPECTED_BRANCH="feature/benjadmin-developer-grid-v013-outminai-20260905"
EXPECTED_COMMON="/srv/dimpro-dev/repositories/dimprover.git"
EXPECTED_HOST="dimpro-dev"
DESKTOP="$ROOT/desktop/benjadmin-developer-grid"

fail() { echo "BLOCKED · $1" >&2; exit "${2:-1}"; }

[[ "$(hostname)" == "$EXPECTED_HOST" ]] || fail "CANONICAL_DEV_HOST_MISMATCH" 40
[[ "$ROOT" == "$EXPECTED_ROOT" ]] || fail "CANONICAL_DEV_WORKTREE_MISMATCH" 41
[[ "$(git -C "$ROOT" branch --show-current)" == "$EXPECTED_BRANCH" ]] || fail "SOURCE_BASELINE_MISMATCH · branch" 42
COMMON="$(readlink -f "$(git -C "$ROOT" rev-parse --git-common-dir)")"
[[ "$COMMON" == "$EXPECTED_COMMON" ]] || fail "SOURCE_BASELINE_MISMATCH · repository" 43
HEAD="$(git -C "$ROOT" rev-parse HEAD)"
[[ "$HEAD" =~ ^[0-9a-f]{40}$ ]] || fail "SOURCE_BASELINE_MISMATCH · HEAD" 44
[[ -z "$(git -C "$ROOT" status --porcelain --untracked-files=normal)" ]] || fail "SOURCE_WORKTREE_DIRTY" 45
[[ "$ROOT" == /srv/dimpro-dev/* ]] || fail "PROD_DENY" 46

VERSION="$(node -p "require('$DESKTOP/package.json').version")"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || fail "WINDOWS_VERSION_INVALID" 47
BUILD_ID="$(cat "$ROOT/.next/BUILD_ID" 2>/dev/null || true)"
[[ -n "$BUILD_ID" ]] || fail "BUILD_ID_MISSING" 48
node - "$ROOT/.next/.dimpro-release.json" "$HEAD" "$EXPECTED_BRANCH" "$BUILD_ID" <<'NODE' || exit 49
const fs = require("node:fs");
const [file, head, branch, buildId] = process.argv.slice(2);
let meta;
try { meta = JSON.parse(fs.readFileSync(file, "utf8")); } catch { process.exit(1); }
if (meta.gitCommit !== head || meta.gitBranch !== branch || meta.buildId !== buildId) process.exit(1);
NODE

if [[ "${1:-}" == "--preflight-only" ]]; then
  printf 'DEVELOPER_GRID_WINDOWS_PREFLIGHT=PASS\nHOST=%s\nROOT=%s\nBRANCH=%s\nHEAD=%s\nVERSION=%s\nBUILD_ID=%s\nPROD=DENY\n' \
    "$EXPECTED_HOST" "$ROOT" "$EXPECTED_BRANCH" "$HEAD" "$VERSION" "$BUILD_ID"
  exit 0
fi

cd "$DESKTOP"
npm run check
node scripts/live-client-contract.mjs
npm audit --audit-level=moderate

export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-OutminAI}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-Developer Grid v${VERSION} Windows EXE ${HEAD:0:7}}"
export DIMPRO_WORKER_CODE="OUTMINAI"

"$ROOT/scripts/dimpro-coordinated-operation.sh" build -- \
  bash -lc 'set -Eeuo pipefail; ROOT="$1"; HEAD="$2"; BRANCH="$3"; VERSION="$4"; BUILD_ID="$5"; DESKTOP="$ROOT/desktop/benjadmin-developer-grid"; rm -f "$DESKTOP/dist/.dimpro-windows-artifact.json"; cd "$DESKTOP"; npm run dist:win; node "$ROOT/scripts/developer-grid/write-windows-artifact-marker.mjs" --root="$ROOT" --expected-commit="$HEAD" --expected-branch="$BRANCH" --version="$VERSION" --build-id="$BUILD_ID"' \
  _ "$ROOT" "$HEAD" "$EXPECTED_BRANCH" "$VERSION" "$BUILD_ID"
