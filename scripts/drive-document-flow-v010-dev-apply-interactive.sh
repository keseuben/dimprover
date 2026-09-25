#!/usr/bin/env bash
set -euo pipefail

EXPECTED_HOST="dimpro-dev"
ROOT_DEFAULT="/srv/dimpro-dev/worktrees/worker-benjaminai-dev-task-grid-22b48c4d9bae10e22e09"
ENV_DEFAULT="/srv/dimpro-dev/worktrees/integration-prod-v1212-benjadmin-m35"
ROOT="${DRIVE_DOCUMENT_FLOW_WORKTREE:-$ROOT_DEFAULT}"
ENV_DIR="${NEXT_ENV_PROJECT_DIR:-$ENV_DEFAULT}"

if [[ "$(hostname)" != "$EXPECTED_HOST" ]]; then
  echo "BLOCKED: this helper may run only on dimpro-dev." >&2
  exit 2
fi
if [[ ! -f "$ROOT/scripts/drive-document-flow-v010-migration-gate.mjs" ]]; then
  echo "BLOCKED: canonical migration gate not found: $ROOT" >&2
  exit 2
fi
if [[ ! -f "$ENV_DIR/.env.local" ]]; then
  echo "BLOCKED: DEV runtime env file not found: $ENV_DIR/.env.local" >&2
  exit 2
fi

cd "$ROOT"
echo "DIMPRO Projektkapu · DRIVE Document Flow V0.1.0 · DEV ONLY"
echo "Host: $(hostname)"
echo "Worktree: $ROOT"
echo "No PROD operation will be performed."
echo

read -r -s -p "DEV Supabase PostgreSQL database password: " DRIVE_DOCUMENT_FLOW_DB_PASSWORD
echo
if [[ -z "$DRIVE_DOCUMENT_FLOW_DB_PASSWORD" ]]; then
  echo "BLOCKED: empty database password." >&2
  exit 2
fi
export DRIVE_DOCUMENT_FLOW_DB_PASSWORD
export NEXT_ENV_PROJECT_DIR="$ENV_DIR"
trap 'unset DRIVE_DOCUMENT_FLOW_DB_PASSWORD DRIVE_DOCUMENT_FLOW_V010_MIGRATION_APPROVED' EXIT

echo
echo "[1/4] PRE-FLIGHT"
node scripts/drive-document-flow-v010-migration-gate.mjs preflight

echo
read -r -p "Type APPLY to run the verified DEV-only migration: " CONFIRM
if [[ "$CONFIRM" != "APPLY" ]]; then
  echo "Cancelled before SQL apply. No migration executed."
  exit 0
fi

export DRIVE_DOCUMENT_FLOW_V010_MIGRATION_APPROVED="DEV_ONLY_DRIVE_DOCUMENT_FLOW_V010_APPLY_APPROVED"

echo
echo "[2/4] BACKUP + APPLY"
node scripts/drive-document-flow-v010-migration-gate.mjs apply

echo
echo "[3/4] VERIFY"
node scripts/drive-document-flow-v010-migration-gate.mjs verify

echo
echo "[4/4] REST READINESS PROBE"
node scripts/drive-document-flow-v010-rest-probe.mjs

echo
echo "PASS: DRIVE Document Flow V0.1.0 DEV migration and readiness verification completed."
