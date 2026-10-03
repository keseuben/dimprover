# DIMPRO AUTH V0.2.1 – DEV aktiválási runbook

Állapot: DEV ONLY · PROD DENY

A folyamat szándékosan fail-closed. A `plan` mód nem kapcsolódik a DB-hez és nem módosít semmit. A `preflight` csak olvas és migrációs dry-runt futtat. A tényleges migráció csak három egymástól független megerősítő környezeti kapcsoló után indul.

## 1. Statikus terv és contractok

```bash
node scripts/dimpro-auth/activate-dev.mjs
```

Kötelező eredmény: V0.1, V0.2 és V0.2.1 contract PASS, tiszta AUTH branch/worktree, `productionAccess=DENY`.

## 2. DB szerver előkészítés

A `db.dimpro.hu` szerveren authoritative admin művelettel:

- `dimpro_auth_dev` adatbázis;
- `dimpro_auth_migrator_dev` DDL/migration role;
- `dimpro_auth_app_dev` least-privilege runtime role;
- `pgcrypto`;
- a DEV alkalmazásszerver `213.160.68.24/32` számára kizárólag a két AUTH role + `dimpro_auth_dev` hostssl/SCRAM bejegyzés;
- nincs `all/all` szabály.

Előkészített fájlok: `db/auth/bootstrap/000_create_dev_database.psql`, `db/auth/bootstrap/pg_hba.dev.example`.

## 3. Runtime trust/secrets

Az authoritative `DIMPRO Internal PostgreSQL CA` root telepítése után állítandó:

- `DIMPRO_AUTH_ENVIRONMENT=DEV`
- runtime és migrator connection string külön role-lal;
- `DIMPRO_AUTH_DB_SSL_MODE=verify-full`
- `DIMPRO_AUTH_DB_CA_FILE=...`
- három külön, legalább 32 karakteres OTP/session/SSO secret;
- authoritative DEV origin + Drive callback.

Valós secret nem kerül Gitbe.

## 4. Olvasási preflight

```bash
node scripts/dimpro-auth/activate-dev.mjs --preflight
```

Ez runtime-preflightot, DB-readiness ellenőrzést és migráció dry-runt futtat, de nem APPLY-ol.

## 5. Migráció APPLY

Csak DB backup/üres új DB igazolása után:

```bash
export DIMPRO_AUTH_ACTIVATION_CONFIRM=APPLY_DEV_AUTH_ACTIVATION
export DIMPRO_AUTH_MIGRATION_CONFIRM=APPLY_DEV_AUTH_MIGRATIONS
export DIMPRO_AUTH_BACKUP_CONFIRMED=YES
node scripts/dimpro-auth/activate-dev.mjs --apply-migrations
```

Elvárt postcondition: `migrationCount=3`.

Első pilot felhasználó ugyanebben a kontrollált körben opcionálisan:

```bash
export DIMPRO_AUTH_BOOTSTRAP_CONFIRM=BOOTSTRAP_DEV_AUTH_USER
node scripts/dimpro-auth/activate-dev.mjs --apply-migrations --bootstrap-email '<DEV_PILOT_EMAIL>'
```

## 6. Fizikai E2E

A DB/runtime aktiválás után: `drive.dev.dimpro.hu` → `auth.dev.dimpro.hu` → OTP e-mail → egyszer használatos code → Drive app session. Kötelező negatív tesztek: hibás/lejárt OTP, 5 próbálkozás, code replay, state mismatch, PKCE mismatch, permission revoke, logout-all, inactivity/absolute expiry.

PROD aktiválást ez a runbook nem végez és nem engedélyez.
