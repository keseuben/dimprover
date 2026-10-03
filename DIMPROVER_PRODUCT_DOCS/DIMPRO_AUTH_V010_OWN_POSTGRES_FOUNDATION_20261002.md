# DIMPRO AUTH V0.1 – saját PostgreSQL OTP/session alap

Dátum: 2026-10-02
Állapot: DEV candidate · PROD DENY

## Cél
A DIMPRO központi beléptetés első saját infrastruktúrás változata Supabase Auth nélkül. Első belépési mód: e-mail + 6 számjegyű egyszer használatos OTP. A session szerveroldali, opaque token alapú. Első integrációs cél: DIMPRO Drive.

## Elkészült
- Saját PostgreSQL repository `DIMPRO_AUTH_DATABASE_URL` kapcsolattal.
- Saját auth migráció: `db/auth/migrations/001_auth_v010_core.sql`.
- Auth, session, audit és authz alaptáblák.
- OTP: 6 számjegy, 5 perc, max. 5 hibás próbálkozás, 30 mp cooldown, új kód invalidálja a régit.
- OTP és session token csak HMAC/hash formában tárolható.
- Egységes publikus OTP-request válasz; a valódi e-mail kézbesítés háttérfutásban történik.
- Session: HttpOnly, Secure, SameSite=Lax, host-only `__Host-dimpro_auth`; szerveroldali revokáció és lejáratok.
- Audit correlation ID-val, e-mail hash-sel, IP-vel és user-agenttel.
- Route-ok: `/api/dimpro-auth/request-otp`, `/verify-otp`, `/session`, `/logout`, `/health`.
- DIMPRO app hoston saját DIMPRO AUTH session ellenőrzés.
- Drive authz alap: `DRIVE` product, `DRIVE_USER` role, `drive.access` permission.
- Drive oldalon és API-kon session + permission gate.
- Explicit DEV bootstrap és migrációs gate.

## Tesztek
- `scripts/dimpro-auth/auth-v010-contract.mjs`: 22/22 PASS.
- Célzott ESLint: PASS.
- Célzott TypeScript hibaszűrés: nincs releváns hiba.
- `git diff --check`: PASS.
- Migráció dry-run: PASS.

## Még nem történt meg
- `db.dimpro.hu` adatbázison migráció nem futott.
- DEV auth adatbázis/felhasználó nem lett létrehozva.
- Runtime auth DB/secrets/SMTP env nincs aktiválva.
- Fizikai OTP e-mail + böngészős session E2E még nincs lefuttatva.
- `login.dev.dimpro.hu` → `auth.dev.dimpro.hu` → termék callback egyszer használatos SSO-code flow még nincs aktiválva.
- Projektkapu, passkey/Windows Hello, 2FA és Eszközhíd későbbi fázis.

## DB gate
A jelenlegi végrehajtási csatorna nem rendelkezik hitelesített írási hozzáféréssel a központi DB szerverhez, ezért DB-write nem történt. A migráció csak authoritative DEV hozzáféréssel aktiválható.
