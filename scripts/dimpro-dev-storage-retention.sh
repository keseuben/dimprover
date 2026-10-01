#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFE_DELETE_SKILL="/srv/dimpro-dev/development-library/skills/dimpro-safe-delete/SKILL.md"
SAFE_DELETE_DIRECTIVE="/srv/dimpro-dev/coordination/SAFE_DELETE_SKILL_REQUIRED.md"
APPROVED_ENGINE="/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2/scripts/dimpro-dev-storage-retention.mjs"
EXPECTED_SKILL_SHA256="1250a0440c9231b6aacdbf6943977f5547aae486fc6c3fade8148134bfc1c211"
EXPECTED_ENGINE_SHA256="6dc03a019efc9ccbfd12fa48dcfabe420d80ca838c16c41fc03d8f595d7c4aaa"

fail() {
  echo "SAFE_DELETE_PREFLIGHT_FAILED · $*" >&2
  exit 79
}

[[ -f "$SAFE_DELETE_SKILL" ]] || fail "skill missing"
[[ -f "$SAFE_DELETE_DIRECTIVE" ]] || fail "directive missing"
[[ -f "$APPROVED_ENGINE" ]] || fail "approved engine missing"

actual_skill_sha="$(sha256sum "$SAFE_DELETE_SKILL" | awk '{print $1}')"
actual_engine_sha="$(sha256sum "$APPROVED_ENGINE" | awk '{print $1}')"
[[ "$actual_skill_sha" == "$EXPECTED_SKILL_SHA256" ]] || fail "skill SHA-256 mismatch"
[[ "$actual_engine_sha" == "$EXPECTED_ENGINE_SHA256" ]] || fail "engine SHA-256 mismatch"
grep -Fq "$EXPECTED_SKILL_SHA256" "$SAFE_DELETE_DIRECTIVE" || fail "directive does not authorize skill hash"
grep -Fq "$EXPECTED_ENGINE_SHA256" "$SAFE_DELETE_DIRECTIVE" || fail "directive does not authorize engine hash"

export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-DIMPRO Storage Retention}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-DEV storage retention}"
exec "$ROOT/scripts/dimpro-coordinated-operation.sh" maintenance -- \
  node "$APPROVED_ENGINE" --apply-builds "$@"
