#!/usr/bin/env bash
set -Eeuo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFE_DELETE_SKILL="/srv/dimpro-dev/development-library/skills/dimpro-safe-delete/SKILL.md"
SAFE_DELETE_DIRECTIVE="/srv/dimpro-dev/coordination/SAFE_DELETE_SKILL_REQUIRED.md"
APPROVED_ENGINE="/srv/dimpro-dev/worktrees/benjadmin-grid-v0159-windows-package-20260920/scripts/dimpro-dev-storage-retention.mjs"
APPROVED_GUARD="/srv/dimpro-dev/worktrees/benjadmin-grid-v0159-windows-package-20260920/scripts/dimpro-safe-delete-guard.mjs"
EXPECTED_SKILL_SHA256="c6f04df150f39b3891dee5b7f65efefaadb50d2f4bef9e5cb3e5afb572cd9a97"
EXPECTED_ENGINE_SHA256="13bdbd291210bb92d76168915cee4a69467532d17577fbbc4483798cd78f5190"
EXPECTED_GUARD_SHA256="e31a4228a4fc7774cb38c64cf4cd53c1e881aee39858a339b05f3b1f7e93f736"

fail() {
  echo "SAFE_DELETE_PREFLIGHT_FAILED · $*" >&2
  exit 79
}

[[ -f "$SAFE_DELETE_SKILL" ]] || fail "skill missing"
[[ -f "$SAFE_DELETE_DIRECTIVE" ]] || fail "directive missing"
[[ -f "$APPROVED_ENGINE" ]] || fail "approved engine missing"
[[ -f "$APPROVED_GUARD" ]] || fail "approved guard missing"

actual_skill_sha="$(sha256sum "$SAFE_DELETE_SKILL" | awk '{print $1}')"
actual_engine_sha="$(sha256sum "$APPROVED_ENGINE" | awk '{print $1}')"
actual_guard_sha="$(sha256sum "$APPROVED_GUARD" | awk '{print $1}')"
[[ "$actual_skill_sha" == "$EXPECTED_SKILL_SHA256" ]] || fail "skill SHA-256 mismatch"
[[ "$actual_engine_sha" == "$EXPECTED_ENGINE_SHA256" ]] || fail "engine SHA-256 mismatch"
[[ "$actual_guard_sha" == "$EXPECTED_GUARD_SHA256" ]] || fail "guard SHA-256 mismatch"
grep -Fq "$EXPECTED_SKILL_SHA256" "$SAFE_DELETE_DIRECTIVE" || fail "directive does not authorize skill hash"

export DIMPRO_OPERATION_OWNER="${DIMPRO_OPERATION_OWNER:-DIMPRO Storage Retention}"
export DIMPRO_OPERATION_TASK="${DIMPRO_OPERATION_TASK:-DEV storage retention}"
ACTIVE_OPERATION_FILE="/srv/dimpro-dev/coordination/active-development.json"
ACTIVE_OPERATION=""
if [[ -f "$ACTIVE_OPERATION_FILE" ]]; then
  ACTIVE_OPERATION="$(node -e 'const fs=require("fs"); try{const x=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); process.stdout.write(String(x.operation||""));}catch{}' "$ACTIVE_OPERATION_FILE")"
fi

# Remote build dispatch already owns the exclusive BUILD lock. Re-entering
# maintenance from pre-build retention would deadlock. In that case we execute
# the approved Safe Delete engine under the existing BUILD authority and force
# its dedicated --post-build gate, which explicitly permits only an active build.
if [[ "$ACTIVE_OPERATION" == "build" ]]; then
  exec node "$APPROVED_ENGINE" \
    --operator-root="$ROOT" \
    --config="$ROOT/config/dimpro-dev-storage-retention.json" \
    --post-build --apply-builds "$@"
fi

exec "$ROOT/scripts/dimpro-coordinated-operation.sh" maintenance -- \
  node "$APPROVED_ENGINE" \
    --operator-root="$ROOT" \
    --config="$ROOT/config/dimpro-dev-storage-retention.json" \
    --apply-builds "$@"
