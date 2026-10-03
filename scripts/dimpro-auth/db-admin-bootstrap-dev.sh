#!/usr/bin/env bash
set -Eeuo pipefail

# DIMPRO AUTH DEV ONLY · PROD DENY
EXPECTED_HOST="dimpro-db"
CONFIRM="${DIMPRO_AUTH_DB_ADMIN_CONFIRM:-}"
SECRETS_FILE="${DIMPRO_AUTH_DB_BOOTSTRAP_ENV:-/root/.dimpro-secrets/dimpro-auth/dev/bootstrap.env}"
SQL_FILE="${DIMPRO_AUTH_DB_BOOTSTRAP_SQL:-/root/dimpro-auth-bootstrap/000_create_dev_database.psql}"

fail() { echo "BLOCKED · $1" >&2; exit "${2:-1}"; }
[[ "${EUID}" -eq 0 ]] || fail "ROOT_REQUIRED" 40
[[ "$(hostname)" == "$EXPECTED_HOST" ]] || fail "HOST_MISMATCH" 41
[[ "$CONFIRM" == "BOOTSTRAP_DIMPRO_AUTH_DEV" ]] || fail "EXPLICIT_CONFIRMATION_REQUIRED" 42
[[ -f "$SECRETS_FILE" && -f "$SQL_FILE" ]] || fail "BOOTSTRAP_INPUT_MISSING" 43
[[ "$(stat -c '%a' "$SECRETS_FILE")" == "600" ]] || fail "BOOTSTRAP_SECRET_MODE_INVALID" 44
[[ "$SQL_FILE" != *prod* && "$SECRETS_FILE" != *prod* ]] || fail "PROD_DENY" 45

grep -Fq "\\set db_name 'dimpro_auth_dev'" "$SQL_FILE" || fail "SQL_DEV_DATABASE_GUARD_MISSING" 46
if grep -qi 'dimpro_auth_prod' "$SQL_FILE"; then fail "PROD_REFERENCE_FORBIDDEN" 47; fi

set -a
# shellcheck disable=SC1090
source "$SECRETS_FILE"
set +a
[[ "${DIMPRO_AUTH_APP_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{32,}$ ]] || fail "APP_PASSWORD_INVALID" 48
[[ "${DIMPRO_AUTH_MIGRATION_PASSWORD:-}" =~ ^[A-Za-z0-9_-]{32,}$ ]] || fail "MIGRATION_PASSWORD_INVALID" 49
[[ "$DIMPRO_AUTH_APP_PASSWORD" != "$DIMPRO_AUTH_MIGRATION_PASSWORD" ]] || fail "DATABASE_PASSWORDS_MUST_DIFFER" 50

# The bootstrap runs through the local PostgreSQL administrator peer-auth path.
runuser -u postgres -- env \
  DIMPRO_AUTH_APP_PASSWORD="$DIMPRO_AUTH_APP_PASSWORD" \
  DIMPRO_AUTH_MIGRATION_PASSWORD="$DIMPRO_AUTH_MIGRATION_PASSWORD" \
  psql --dbname=postgres --file="$SQL_FILE"

runuser -u postgres -- psql --dbname=postgres -Atqc \
  "select datname from pg_database where datname='dimpro_auth_dev'; select rolname from pg_roles where rolname in ('dimpro_auth_app_dev','dimpro_auth_migrator_dev') order by 1;"

echo "DIMPRO_AUTH_DEV_DB_BOOTSTRAP=PASS"
echo "PRODUCTION_ACCESS=DENY"
