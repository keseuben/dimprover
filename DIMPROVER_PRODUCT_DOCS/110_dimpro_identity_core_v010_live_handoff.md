# DIMPRO Identity Core V0.1.0 – live átadás a következő fejlesztő csevegésnek

Dátum: 2026-08-07
Projektmappa: `/root/dimprover`
Fejlesztési Központ verzió: `IDENTITY CORE 0.1.0`
Fejlesztési Központ ID: `version_78f1e03a-02c`
Állapot: **központi adatbázismag live Supabase-ben telepítve és lezárva; következő feladat a Drop/Projektkapu fogyasztói integráció**

## 1. Kötelező rendszerelv

Ez NEM a DIMPRO Drop külön felhasználói adatbázisa.

A teljes DIMPRO / DIMPROVER / DIMPROVER AI termékcsalád közös, kanonikus azonosító-, szervezet-, licenc-, modul-, projekt-, Send-jogosultság-, audit- és rate-limit magja.

A Drop és a Projektkapu ennek fogyasztója. Új párhuzamos user/license/project jogosultsági adatbázist nem szabad létrehozni.

## 2. Live Supabase állapot

A közvetlen PostgreSQL admin kapcsolat a VPS-en működik:

- `configured=true`
- `connection=ok`
- adatbázis: `postgres`
- port: `5432`

Biztonságos admin segédeszközök:

- `/root/bin/dimpro-supabase-admin-setup`
- `/root/bin/dimpro-supabase-admin-status`
- `/root/bin/dimpro-supabase-psql`
- `/root/bin/dimpro-supabase-migrate`

A DB-jelszó csak root-only secretfájlban található:

- `/root/.dimpro-secrets/supabase-admin.env`
- jogosultság: `0600`

A jelszó értékét tilos logba, dokumentációba, chatbe, repóba vagy `.env.local`-ba másolni.

## 3. Live migráció

Telepített migrációk:

1. `supabase/migrations/20260806213000_dimpro_identity_license_project_core_v010.sql`
2. `supabase/migrations/20260806214000_dimpro_send_project_access_v010.sql`
3. `supabase/migrations/20260807083000_dimpro_identity_core_security_hardening_v010.sql`

Kombinált bootstrap:

- `supabase/DIMPRO_IDENTITY_CORE_V010_BOOTSTRAP.sql`

A bootstrap live Supabase-ben sikeresen lefutott.

Schema marker:

- `component = dimpro-identity-core`
- `schema_version = 0.1.0`
- `migration_count = 3`
- `bootstrap_id = dimpro-identity-core-security-hardening-v010-20260807`

FONTOS: az adatbázismagot nem kell újramigrálni. A bootstrap ismételt futtatása csak új környezet telepítésénél vagy dokumentált helyreállítási eljárásban történjen.

## 4. Kanonikus táblák

Központi mag:

- `dimpro_users`
- `dimpro_organizations`
- `dimpro_organization_memberships`
- `dimpro_licenses`
- `dimpro_license_modules`
- `dimpro_projects`
- `dimpro_project_memberships`

Send / Drop jogosultsági és biztonsági réteg:

- `dimpro_project_drop_settings`
- `dimpro_send_entitlements`
- `dimpro_send_recipients`
- `dimpro_access_audit_logs`
- `dimpro_access_rate_limits`

Live preflight eredmény: **12/12 ready**, `ready=true`.

## 5. Legacy bridge állapot

A meglévő rendszer nem lett törölve. Additív bridge mezők készültek.

Sikeres backfill:

- `dimpro_account_users`: 1/1
- `dimpro_companies`: 1/1
- `dimpro_memberships`: 1/1
- `dimpro_product_access`: 1/1
- `dimpro_subscriptions`: 1/1
- `project_core_projects`: 2/2

Kanonikus live rekordok:

- `dimpro_users`: 1
- `dimpro_organizations`: 1
- `dimpro_organization_memberships`: 1
- `dimpro_licenses`: 1
- `dimpro_license_modules`: 1
- `dimpro_projects`: 2

A `project_core_memberships` 4 legacy demo rekordja nincs automatikusan kanonikus userhez kötve. A régi azonosítók: `dev-web-user`, `demo-designer`, `demo-reviewer`. Ezekhez nincs biztonságosan bizonyítható központi user-egyezés, ezért TILOS találgatással backfillt készíteni.

A legacy `drop_public_send_codes` rekordokat szintén nem szabad automatikusan entitlementhez rendelni. Ezeket később egyenként, auditált adminművelettel kell átvezetni.

## 6. Biztonsági szabályok

- UUID a belső elsődleges kulcs.
- Publikus kódok: `USR-*`, `ORG-*`, `LIC-*`, `PRJ-*`.
- Send-kód formátum: `ABCD-123-456`.
- A teljes Send-kód nem tárolható; csak HMAC hash és opcionális hint.
- Nyers IP nem tárolható; csak HMAC pseudonym.
- `locked_default` recipient mód fail-closed.
- Alapértelmezett címzett csak ugyanahhoz az entitlementhez tartozhat.
- Send rate limit kódrotációval nem kerülhető meg.
- Projektkód sikertelenség kívülről általános hibát ad.
- Érzékeny RPC-k csak service role szerveroldalon hívhatók.
- RLS aktív a központi érzékeny táblákon.
- Belső `SECURITY DEFINER` helper RPC-k kliensoldali execute joga visszavonva.

## 7. Szerveroldali Identity Core kód

Könyvtár:

- `app/lib/identity-core/`

Fájlok:

- `types.ts`
- `security.ts`
- `repository.ts`
- `api.ts`

API-k:

- `GET /api/dimpro-identity/health`
- `POST /api/dimpro-identity/send/verify`
- `GET /api/dimpro-identity/send/projects`
- `POST /api/dimpro-identity/projects/verify-code`

Send-session prefix: `dss1`.

## 8. Környezeti szerződés

Sablon:

- `ops/env/dimpro-identity-core.env.example`

Szükséges szerveroldali változók:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `DIMPRO_IDENTITY_CORE_ENABLED`
- `DIMPRO_SEND_CODE_PEPPER`
- `DIMPRO_ACCESS_HASH_PEPPER`
- `DIMPRO_SEND_SESSION_SECRET`
- `DIMPRO_SEND_SESSION_TTL_SECONDS`

Valódi secret értéket dokumentációban vagy chatben nem szabad kiírni.

Jelenlegi release gate:

- `DIMPRO_IDENTITY_CORE_ENABLED=false`

Ez SZÁNDÉKOS. Az adatbázis live és tesztelt, de a Drop fogyasztói kód még nincs teljesen átállítva az új Identity Core API-kra.

## 9. Teszteredmények

Live SQL acceptance:

- **24/24 PASS**
- a teszt tranzakció `ROLLBACK`-kel zárult, tesztadat nem maradt bent.

Statikus/biztonsági ellenőrzések:

- schema/API contract: PASS
- acceptance case count: 24
- security contract: 16/16 PASS
- TypeScript: PASS
- célzott ESLint: 0 hiba
- SQL parser: mindhárom migráció + bootstrap + rollback + acceptance PASS

Final validation build:

- BUILD_ID: `pHDlwdSLfwJ6gW2OYtxft`
- exit code: `0`
- standalone assets: PASS

A teljes beépített smoke-check egyszer időtúllépett, ezért nem lett PASS-nak minősítve. Külön kontroll:

- PM2 `dimprover`: online
- Nginx config: OK
- `http://127.0.0.1:3000/`: HTTP 307, kb. 0.007 s
- `https://app.dimpro.hu/`: HTTP 307, kb. 0.053 s

Tehát általános szolgáltatáskiesés nincs.

## 10. Mentések és rollback

Live migráció előtti friss mentés:

- `backups/identity-core-v010-live-migration-20260807T074748Z/public_before.dump`
- `backups/identity-core-v010-live-migration-20260807T074748Z/public_schema_before.sql`
- `backups/identity-core-v010-live-migration-20260807T074748Z/SHA256SUMS`

Rollback SQL:

- `supabase/rollback/DIMPRO_IDENTITY_CORE_V010_ROLLBACK.sql`

A rollback csak ellenőrzött mentés után és csak akkor használható, ha az új központi magra még nem érkezik éles üzleti forgalom.

## 11. Dokumentáció

Fő műszaki dokumentum:

- `DIMPROVER_PRODUCT_DOCS/109_dimpro_identity_license_send_project_core_v010.md`

Ez a live átadás:

- `DIMPROVER_PRODUCT_DOCS/110_dimpro_identity_core_v010_live_handoff.md`

A Fejlesztési Központban az `IDENTITY CORE 0.1.0` státusza `completed`, nyitott munkamenet nincs.

## 12. A KÖVETKEZŐ FEJLESZTŐ CSEVEGÉS FELADATA

Ne migrálja újra az adatbázismagot.

A következő munka a fogyasztói integráció:

1. olvassa be először a `109_...` és `110_...` dokumentumot;
2. auditálja a Drop jelenlegi Send/Gyors KépSend/kód/project kiválasztási logikáját;
3. a Dropot az új `/api/dimpro-identity/*` API-k fogyasztására állítsa át;
4. készítse el az adminisztratív Send entitlement létrehozási/hozzárendelési folyamatot;
5. a legacy Send-kódokat csak egyenként, auditáltan vezesse át;
6. ellenőrizze a három szerveroldali Send/hash/session secret meglétét; szükség esetén generáljon erős külön secretet, de értékét ne írja ki;
7. készítsen valós Send → projektlista → projektkód → `Beérkező Drop` E2E tesztet;
8. csak sikeres E2E után állítsa `DIMPRO_IDENTITY_CORE_ENABLED=true` értékre;
9. ezután új production build, célzott smoke/regresszió és kontrollált deploy/PM2 restart következzen;
10. a régi user/license/project jogosultsági olvasásokat fokozatosan vezesse ki, de a bridge kompatibilitást egyelőre tartsa meg.

A teljes `auth.dimpro.hu` passkey/Eszközhíd/session/recovery implementáció NEM része ennek a következő Drop-integrációs lépésnek; az külön későbbi fejlesztési szakasz.
