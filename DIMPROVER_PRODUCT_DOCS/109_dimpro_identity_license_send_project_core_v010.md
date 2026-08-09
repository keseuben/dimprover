# DIMPRO központi azonosító-, licenc-, Send-jogosultság- és projektkód-adatbázis V0.1.0

Dátum: 2026-08-06  
Folytatás / security hardening: 2026-08-07  
Fejlesztési központ azonosító: `version_78f1e03a-02c`  
Fejlesztési központ verzió: `IDENTITY CORE 0.1.0`  
Állapot: **Identity Core V0.1.0 adatbázismag live Supabase-ben telepítve és 24/24 acceptance teszttel ellenőrizve; Drop UI bekötés és feature gate aktiválás külön integrációs lépés**

## 1. Rendszerszintű cél

A fejlesztés nem a DIMPRO Drop külön felhasználói adatbázisa. A létrehozott modell a teljes DIMPRO / DIMPROVER / DIMPROVER AI termékcsalád közös:

- felhasználói törzsét;
- szervezeti törzsét;
- felhasználó–szervezet kapcsolatait;
- egyéni és szervezeti licenceit;
- modul- és feature-jogosultságait;
- projektjeit és projektjogosultságait;
- DIMPRO Send-jogosultságait;
- projektkódos Drop-beérkeztetését;
- hozzáférési audit- és rate-limit rétegét

készíti elő.

A DIMPRO Drop csak fogyasztója a központi adatoknak. Termékenként párhuzamos felhasználói adatbázis nem készülhet.

## 2. Kötelező azonosítási elv

Minden üzleti entitás két azonosítót használ:

1. belső, nem publikus UUID elsődleges kulcs;
2. ember által olvasható, véletlenszerű DIMPRO nyilvános kód.

Formátumok:

- felhasználó: `USR-26-K7M4-Q9TX`;
- szervezet: `ORG-26-M3P8-R7KD`;
- licenc: `LIC-26-T6N2-W8QF`;
- projekt: `PRJ-26-K7M-4Q9`.

Engedélyezett véletlen karakterkészlet:

`23456789ABCDEFGHJKMNPQRSTUVWXYZ`

Nem kerülhet a kódokba: `0`, `O`, `1`, `I`, `L`.

A kódok unique constrainttel védettek, nem sorszámok, önmagukban nem jogosítanak hozzáférésre, és létrehozás után alapértelmezetten változatlanok.

## 3. Live sémafelmérés és mentés

A fejlesztés előtt a Supabase PostgREST live séma pillanatképe és a kapcsolódó táblák adatmentése elkészült.

Mentések:

- `backups/identity-core-20260806/live_postgrest_openapi_before.json`;
- `backups/identity-core-20260806/live_postgrest_openapi_before.json.sha256`;
- `backups/identity-core-20260806/live_relevant_data_before.json`;
- `backups/identity-core-20260806/live_relevant_data_before.json.sha256`;
- `backups/identity-core-20260806/dev-center-state-before.json`.

A live adatmentés jogosultsága `0600`, mert személyes és hozzáférési adatokat tartalmazhat.

A felméréskor már létezett:

- `dimpro_account_users`: 1 rekord;
- `dimpro_companies`: 1 rekord;
- `dimpro_memberships`: 1 rekord;
- `dimpro_product_access`: 1 rekord;
- `dimpro_subscriptions`: 1 rekord;
- `project_core_projects`: 2 rekord;
- `project_core_memberships`: 4 rekord;
- `project_core_audit_events`: 33 rekord;
- `drop_public_send_codes`: 5 rekord;
- `drop_space_projects`: 1 rekord.

Ezért a migráció nem törli és nem újralétrehozza a működő moduladatokat, hanem additív kanonikus törzsadatbázist és egyedi hídkapcsolatokat hoz létre.

## 4. Kanonikus adatmodell

### 4.1. `dimpro_users`

A teljes termékcsalád üzleti felhasználói rekordja.

Fő mezők:

- `id uuid`;
- `public_user_code`;
- `auth_user_id nullable`;
- `full_name`;
- `email`;
- `email_normalized unique`;
- `email_verified_at`;
- `phone`;
- `status`;
- `created_by`;
- `legacy_account_user_id`.

Az `auth_user_id` nem primary key. Később módosítható kapcsolat marad a Supabase Auth vagy az `auth.dimpro.hu` felé.

### 4.2. `dimpro_organizations`

A teljes termékcsalád közös szervezeti törzse.

Fő mezők:

- `id uuid`;
- `public_organization_code`;
- `legal_name`;
- `display_name`;
- `tax_number`;
- `registration_number`;
- `email`;
- `phone`;
- `status`;
- `legacy_company_id`.

### 4.3. `dimpro_organization_memberships`

Több-több kapcsolat felhasználók és szervezetek között.

Fő mezők:

- `user_id`;
- `organization_id`;
- `role_code`;
- `role_label`;
- `status`;
- `joined_at`;
- `access_ends_at`;
- `is_primary`;
- `legacy_membership_id`.

Egy felhasználónak legfeljebb egy aktív elsődleges szervezeti tagsága lehet.

### 4.4. `dimpro_licenses`

Egyéni vagy szervezeti licenc. Constraint biztosítja, hogy pontosan egy tulajdonos legyen kitöltve.

Fő mezők:

- `public_license_code`;
- `owner_type`;
- `owner_user_id`;
- `owner_organization_id`;
- `product_code`;
- `plan_code`;
- `status`;
- `activated_at`;
- `expires_at`;
- `offline_grace_until`;
- `max_devices`;
- legacy kapcsolatok.

### 4.5. `dimpro_license_modules`

A licenchez rendelt modul- és feature-jogosultság.

Fő mezők:

- `license_id`;
- `module_code`;
- `enabled`;
- `limits jsonb`;
- `feature_flags jsonb`;
- `valid_from`;
- `valid_until`;
- `legacy_product_access_id`.

Előkészített Drop modulazonosítók:

- `DROP_PACKAGE`;
- `DROP_SUBMISSION_GATE`;
- `DROP_SEND`;
- `DROP_QUICK_IMAGE_SEND`;
- `DROP_SPACE`;
- `DROP_PROJECT_INBOX`;
- `DROP_DRIVE_ARCHIVE`.

### 4.6. `dimpro_projects`

A központi projektentitás. A meglévő `project_core_projects` továbbra is működik, és `dimpro_project_id` hídkapcsolattal kapcsolódik ehhez a kanonikus rekordhoz.

Fő mezők:

- `public_project_code`;
- `name`;
- `short_name`;
- `description`;
- `organization_id`;
- `status`;
- `project_drop_enabled`;
- `created_by`;
- `legacy_project_core_id`;
- `legacy_project_code`.

### 4.7. `dimpro_project_memberships`

Központi projektjogosultság:

- `project_id`;
- `user_id`;
- `organization_id`;
- `role_code`;
- `can_view`;
- `can_upload_to_drop`;
- `can_download`;
- `can_manage_inbox`;
- `status`;
- `valid_from`;
- `valid_until`;
- `legacy_project_core_membership_id`.

## 5. DIMPRO Send és projektkódos Drop

### 5.1. `dimpro_send_entitlements`

A küldési jogosultság konkrét felhasználóhoz és licenchez kötött.

A teljes kód nem tárolható. A szerver a normalizált `ABCD-123-456` kódot külön, legalább 32 karakteres pepperrel HMAC-SHA256 hashre alakítja. Az adatbázis kizárólag a 64 karakteres hex `code_hash` és opcionális `code_hint` értéket tárolja.

Fő jogosultságok:

- normál Send;
- Gyors KépSend;
- képcsoportok;
- fájlmegjegyzések;
- projekt Drop;
- címzettmód;
- címzett-, csomagméret- és havi küldési limit.

### 5.2. `dimpro_send_recipients`

Engedélyezett vagy zárolt címzetti profilok. Egy entitlementhez legfeljebb egy aktív alapértelmezett címzett tartozhat.

Címzettmódok:

- `locked_default`;
- `approved_list`;
- `free_entry`.

### 5.3. `dimpro_project_drop_settings`

Projekt Drop-célbeállítás:

- engedélyezés;
- Drive célmappa;
- `Beérkező Drop` mappanév;
- csoportstruktúra megtartása;
- vírusellenőrzés kötelezővé tétele;
- projektadminisztrátori értesítés.

Minden migrált projekthez alapértelmezetten kikapcsolt beállítás készül. Aktiválás külön adminművelet.

### 5.4. `dimpro_access_audit_logs`

Naplózza a sikeres és sikertelen Send- és projektkód-műveleteket. Nyers IP helyett HMAC-alapú `ip_hash` tárolódik.

### 5.5. `dimpro_access_rate_limits`

A Send- és projektkód próbálkozásokhoz 5 hibás kísérlet után 15 perces ideiglenes zárolás.

A nem létező és a nem engedélyezett projekt azonos külső választ ad:

`A projektkód nem használható.`

## 6. Kompatibilitási hídkapcsolatok

A migráció az alábbi oszlopokat additív módon hozza létre:

- `dimpro_account_users.dimpro_user_id`;
- `dimpro_companies.dimpro_organization_id`;
- `dimpro_memberships.dimpro_organization_membership_id`;
- `dimpro_subscriptions.dimpro_license_id`;
- `dimpro_product_access.dimpro_license_module_id`;
- `project_core_projects.dimpro_project_id`;
- `project_core_memberships.dimpro_project_membership_id`;
- `drop_public_send_codes.dimpro_send_entitlement_id`;
- `drop_space_projects.dimpro_project_id`.

A legacy Send-kódok automatikus felhasználóhoz rendelése szándékosan nem történik meg, mert a régi rekordokból nem minden esetben állapítható meg biztonságosan a konkrét felhasználó és licenc. A későbbi átvezetés külön auditált adminművelet legyen.

A legacy Project Core tagság csak akkor backfillelhető automatikusan, ha a felhasználó e-mail vagy UUID alapján egyértelműen egyezik a központi felhasználóval. Bizonytalan vagy demo felhasználóból nem készül automatikusan új üzleti felhasználó.

## 7. RLS és biztonsági modell

RLS aktív minden új központi táblán.

### 7.1. 2026-08-07 security hardening

A live aktiválás előtti második mélyellenőrzés négy további adatbázis-szintű védelmet tett kötelezővé:

- a Send rate limit nem függhet a próbált kódtól, ezért eltérő hibás kódok forgatásával sem indítható új számláló; a Send korlátozás IP-pseudonimhoz, a projektkód-korlátozás entitlement + IP-pseudonimhoz kötött;
- `locked_default` címzettmód csak aktív, az adott entitlementhez tartozó alapértelmezett címzettel tekinthető használhatónak;
- a `default_recipient_id` kompozit, azonnali FK-val `(default_recipient_id, entitlement_id)` ugyanahhoz az entitlementhez kötött, így más jogosultság címzettje nem kapcsolható be;
- a PostgreSQL által alapértelmezetten `PUBLIC EXECUTE` jogosultsággal létrejövő belső `SECURITY DEFINER` helper függvények kliensoldali végrehajtási joga explicit visszavonásra került. Csak az RLS-hez szükséges olvasási helperek maradnak `authenticated` számára futtathatók.

További migráció:

- `supabase/migrations/20260807083000_dimpro_identity_core_security_hardening_v010.sql`.

A sémajelölő ennek megfelelően `migration_count = 3`, a teljes csomag bootstrap azonosítója: `dimpro-identity-core-security-hardening-v010-20260807`.


Alapelvek:

- a felhasználó csak saját rekordját olvashatja;
- a szervezeti adatok csak aktív tagsággal olvashatók;
- a projektadatok csak projektjogosultsággal vagy szervezeti tagsággal olvashatók;
- a licencadatok csak a tulajdonos vagy tulajdonosi szervezet tagjai számára olvashatók;
- `dimpro_send_entitlements`, `dimpro_send_recipients`, audit és rate-limit tábla nem olvasható `anon` vagy `authenticated` szerepkörből;
- Send- és projektkód-ellenőrzés kizárólag service-role szerveroldali RPC-n keresztül történhet;
- service role kulcs, Send pepper és munkamenet-aláíró titok kliensbe nem kerülhet;
- nyers Send-kód vagy nyers IP nem naplózható.

## 8. Szerveroldali API

### 8.1. `GET /api/dimpro-identity/health`

Ellenőrzi:

- a sémajelölőt;
- mind a 12 szükséges központi táblát;
- a migrációs verziót;
- a feature gate állapotát.

### 8.2. `POST /api/dimpro-identity/send/verify`

Bemenet:

```json
{
  "code": "ABCD-123-456"
}
```

A kód szerveroldalon normalizálódik és hash-elődik. Siker esetén visszaadja:

- felhasználói profilt;
- entitlement-jogosultságokat;
- alapértelmezett címzettet;
- engedélyezett projektlistát;
- rövid élettartamú, HMAC-aláírt `dss1` Send-munkamenetet.

### 8.3. `GET /api/dimpro-identity/send/projects`

`Authorization: Bearer <sendSession.token>` szükséges.

Csak aktív, Dropra engedélyezett, `can_upload_to_drop` jogosultságú projekteket ad vissza.

### 8.4. `POST /api/dimpro-identity/projects/verify-code`

`Authorization: Bearer <sendSession.token>` szükséges.

Bemenet:

```json
{
  "projectCode": "PRJ-26-K7M-4Q9"
}
```

Siker esetén projekt- és célmappaadatot ad, sikertelenségnél mindig általános hibát.

### 8.5. Belső elszámolás

A `recordDimproSendCompleted` repository művelet a sikeres küldés lezárásakor:

- ellenőrzi az entitlementet;
- ellenőrzi a csomagméretet és címzettszámot;
- projektküldésnél újra ellenőrzi a projektjogosultságot;
- növeli a havi felhasználást;
- auditbejegyzést készít.

## 9. Környezeti változók

Kötelező:

- `NEXT_PUBLIC_SUPABASE_URL`;
- `SUPABASE_SERVICE_ROLE_KEY`;
- `DIMPRO_IDENTITY_CORE_ENABLED`;
- `DIMPRO_SEND_CODE_PEPPER`;
- `DIMPRO_ACCESS_HASH_PEPPER`;
- `DIMPRO_SEND_SESSION_SECRET`;
- `DIMPRO_SEND_SESSION_TTL_SECONDS`.

Sablon:

`ops/env/dimpro-identity-core.env.example`

A feature gate a live migráció és teszt előtt maradjon `false`.

## 10. Migrációs és visszaállítási fájlok

Migrációk:

1. `supabase/migrations/20260806213000_dimpro_identity_license_project_core_v010.sql`;
2. `supabase/migrations/20260806214000_dimpro_send_project_access_v010.sql`;
3. `supabase/migrations/20260807083000_dimpro_identity_core_security_hardening_v010.sql`.

Kombinált SQL Editor csomag:

- `supabase/DIMPRO_IDENTITY_CORE_V010_BOOTSTRAP.sql`.

Rollback:

- `supabase/rollback/DIMPRO_IDENTITY_CORE_V010_ROLLBACK.sql`.

Elfogadási teszt:

- `supabase/tests/DIMPRO_IDENTITY_CORE_V010_ACCEPTANCE.sql`.

Ellenőrző összegek:

- `supabase/DIMPRO_IDENTITY_CORE_V010_MANIFEST.sha256`.

A rollback megőrzi a legacy account-, Project Core- és Drop-táblákat, de eltávolítja az új kanonikus táblákat és azok adatait. Csak ellenőrzött mentés után futtatható.

## 11. Tesztelés

### 11.1. Elkészült és lefutott

- PostgreSQL parser: mindhárom migráció, a kombinált bootstrap, rollback és elfogadási SQL szintaktikailag érvényes;
- statikus séma/API szerződés: sikeres;
- biztonsági szerződés: 16 ellenőrzés sikeres;
- TypeScript: `npx tsc --noEmit` sikeres;
- SQL elfogadási csomag: 24 különálló tranzakciós teszteset elkészült, köztük RPC privilege-, kereszt-entitlement címzett-, fail-closed címzettmód- és kódrotációs rate-limit teszt.

### 11.2. Live Supabase telepítés – 2026-08-07

A közvetlen PostgreSQL admin-kapcsolat a VPS-en biztonságosan konfigurálva lett. Az adatbázisjelszó nem került a repóba vagy a `.env.local` fájlba, kizárólag root által olvasható secretfájlban tárolódik.

Admin segédeszközök:

- `/root/bin/dimpro-supabase-admin-setup`;
- `/root/bin/dimpro-supabase-admin-status`;
- `/root/bin/dimpro-supabase-psql`;
- `/root/bin/dimpro-supabase-migrate`;
- secret: `/root/.dimpro-secrets/supabase-admin.env` (`0600`).

A migráció előtti friss `public` séma mentés:

- `backups/identity-core-v010-live-migration-20260807T074748Z/public_before.dump`;
- `backups/identity-core-v010-live-migration-20260807T074748Z/public_schema_before.sql`;
- `backups/identity-core-v010-live-migration-20260807T074748Z/SHA256SUMS`.

A teljes adatbázis mérete a migráció előtt kb. 20 MB volt, ezért a `public` séma visszaállítható custom dumpja is elkészült.

Live futtatás:

- `supabase/DIMPRO_IDENTITY_CORE_V010_BOOTSTRAP.sql`: PASS;
- `node scripts/dimpro-identity-core-live-preflight.mjs`: `ready: true`;
- mind a 12 kötelező központi tábla elérhető;
- schema marker: `migration_count = 3`;
- bootstrap ID: `dimpro-identity-core-security-hardening-v010-20260807`;
- `DIMPRO_IDENTITY_CORE_ENABLED=false` tudatosan megmaradt az alkalmazásoldali Drop-integrációig.

A preflight scriptet a live ellenőrzés során javítani kellett: a `dimpro_access_rate_limits` táblának nincs általános `id` oszlopa, ezért a táblalétezés-vizsgálat most oszlopfüggetlen `select("*").limit(0)` ellenőrzést használ.

Live backfill eredmény:

- `dimpro_users`: 1;
- `dimpro_organizations`: 1;
- `dimpro_organization_memberships`: 1;
- `dimpro_licenses`: 1;
- `dimpro_license_modules`: 1;
- `dimpro_projects`: 2;
- `project_core_projects`: 2/2 hídkapcsolt;
- legacy account/company/membership/subscription/product-access rekordok: 1/1 hídkapcsoltak;
- `project_core_memberships`: 4 legacy demo tagság, 0 automatikus hídkapcsolat. Ezek `dev-web-user`, `demo-designer`, `demo-reviewer` szöveges demo azonosítókat használnak, amelyekhez nincs biztonságosan bizonyítható központi felhasználói egyezés, ezért nem történt találgatásos backfill.

Preflight parancs:

```bash
node scripts/dimpro-identity-core-live-preflight.mjs
```

### 11.3. 2026-08-07 végső forrásoldali ellenőrzés

Sikeresen lefutott:

- mindhárom migráció PostgreSQL parser ellenőrzése;
- kombinált bootstrap parser ellenőrzése;
- rollback parser ellenőrzése;
- 24 tesztes acceptance SQL parser ellenőrzése;
- `node scripts/dimpro-identity-core-schema-contract.test.mjs`: PASS;
- `node scripts/dimpro-identity-core-security-contract.test.cjs`: PASS, 16 ellenőrzés;
- `npx tsc --noEmit`: PASS;
- célzott ESLint: 0 hiba; a CJS security test a meglévő ignore szabály miatt csak figyelmeztetést ad;
- final validation build: `pHDlwdSLfwJ6gW2OYtxft`, exit code 0, standalone asset sync PASS;
- a beépített teljes smoke-check egyszer timeoutot adott, ezért nem lett PASS-nak minősítve; külön ellenőrzés szerint PM2 `dimprover` online, Nginx config OK, localhost és `https://app.dimpro.hu/` egyaránt gyors HTTP 307 választ ad.

Naplók:

- `.work_identity_core_v010_schema_contract_final.log`;
- `.work_identity_core_v010_security_contract_final.log`;
- `.work_identity_core_v010_tsc_final.log`;
- `.work_identity_core_v010_live_preflight_hardened.json`.

Hardening előtti visszaállítási mentés:

- `backups/identity-core-20260807-hardening-20260807_062245`.

A live preflight a telepítés után `ready: true`. A `DIMPRO_IDENTITY_CORE_ENABLED=false` továbbra is tudatos integrációs gate: az adatbázismag live és tesztelt, de a Drop UI még nincs átállítva az új Identity Core API-k fogyasztására.

## 12. Fejezeti állapotszintek

| Fejezet | Állapot | Megjegyzés |
|---|---|---|
| 0. Követelmény és központi scope | KÉSZ | Nem Drop-specifikus, teljes termékcsaládra készült. |
| 1. Live sémafelmérés | KÉSZ | OpenAPI és releváns táblák ellenőrizve. |
| 2. Visszaállítható mentés | KÉSZ | Séma- és releváns adatmentés SHA-256-tal. |
| 3. Kanonikus felhasználói/szervezeti mag | KÉSZ | Additív migráció elkészült. |
| 4. Licenc- és moduljogosultság | KÉSZ | Egyéni/szervezeti tulajdon, feature flag előkészítés. |
| 5. Projekt- és projektjogosultsági mag | KÉSZ | Kanonikus projekt és Project Core bridge. |
| 6. Send- és projektkód-adatmodell | KÉSZ | Hash, címzettmódok, audit, rate limit. |
| 7. RLS és service-role RPC | KÉSZ | Kliensoldali hash-hozzáférés tiltott. |
| 8. Szerveroldali API-szerződés | KÉSZ | 4 API-végpont és belső repository elkészült. |
| 9. Statikus és biztonsági tesztek | KÉSZ | 3 migráció + bootstrap + rollback + acceptance parser PASS; 24 SQL teszt, 16 security check, TypeScript PASS. |
| 10. Live Supabase migráció | KÉSZ | Közvetlen root-only PostgreSQL admin kapcsolattal bootstrap PASS. |
| 11. Live SQL elfogadási teszt | KÉSZ | 24/24 teszt PASS, tesztadatok ROLLBACK-kel eltávolítva. |
| 12. Drop UI bekötés | INAKTÍV | A live adatbázis és feature gate után kapcsolható. |
| 13. `auth.dimpro.hu` teljes auth | KÉSŐBBI SZAKASZ | Passkey, Eszközhíd, session, recovery nem része V0.1.0-nak. |

## 13. Következő integrációs sorrend

A live adatbázis-migráció és az acceptance teszt elkészült. Következő lépések:

1. a Drop / Projektkapu fogyasztói kódjának átállítása a központi Identity Core API-kra;
2. a Send-jogosultságok adminisztratív létrehozása és a legacy Send-kódok egyenkénti, auditált entitlementhez rendelése;
3. a szükséges szerveroldali Send/session/hash secretek ellenőrzése vagy előállítása – értékük nem kerülhet dokumentációba;
4. valós Send → projektlista → projektkód → Drop cél E2E;
5. csak sikeres fogyasztói E2E után `DIMPRO_IDENTITY_CORE_ENABLED=true`;
6. új production build, célzott smoke/regresszió, majd kontrollált deploy/PM2 restart;
7. a régi párhuzamos felhasználói/jogosultsági olvasások fokozatos kivezetése, az additív bridge mezők megtartásával.

Az adatbázismagot nem kell újra migrálni. A bootstrap ismételt futtatása csak dokumentált helyreállítási vagy új környezeti telepítési eljárásban történhet.

## 14. Nem része ennek a fejlesztési körnek

- teljes `auth.dimpro.hu` beléptetési rendszer;
- jelszavas/OTP/passkey belépés teljes implementációja;
- Windows Hello és Eszközhíd;
- megbízható eszközök és aktív munkamenetek adatmodellje;
- fiók-helyreállítás;
- meghívási rendszer;
- teljes globális szerepkörkatalógus;
- felhasználói beállítások és jogi hozzájárulások;
- fájlok tényleges Drive `Beérkező Drop` áthelyező workerje;
- vírusellenőrzési és projektadmin-értesítési háttérfolyamat bekötése.

A V0.1.0 adatmodell ezeket nem akadályozza: az `auth_user_id` opcionális, módosítható kapcsolat, az üzleti `dimpro_users.id` marad a központi azonosító.
