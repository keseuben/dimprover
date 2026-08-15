# DIMPRO Drive Security Backfill V0.5.1 – legacy re-quarantine workflow

Dátum: 2026-08-15

## Cél

A Drive Security V0.5.0 előtti, nem-DROP forrású `AVAILABLE` S3 dokumentumverziókat nem szabad implicit módon biztonságosnak tekinteni. A V0.5.1 backfill workflow feladata, hogy ezek a régi WEB/DESKTOP verziók auditálható módon visszakerüljenek karanténba, ugyanazzal a megosztott DROP/DRIVE ClamAV motorral újravizsgálhatók legyenek, és csak `CLEAN` eredmény után kerülhessenek külön emberi jóváhagyásra.

A workflow nem hoz létre második víruskereső motort és nem lazítja a Security V0.5 release-gate-et.

## Biztonsági alapelv

A backfill fail-closed működésű:

- legacy `AVAILABLE` → `QUARANTINED`;
- ClamAV scan;
- `CLEAN` → továbbra is `QUARANTINED`, emberi APPROVE szükséges;
- `INFECTED` → a meglévő Security V0.5 automatikus REJECT + cleanup folyamat;
- `ERROR` → karanténban marad;
- automatikus APPROVE nincs;
- objektumtörlést a backfill repository önállóan nem végez, csak a meglévő fertőzött/reject cleanup workflow.

## Jelöltképzés

Automatikus legacy jelölt csak akkor lehet:

- `drive_core_document_versions.storage_provider = S3`;
- verzió `AVAILABLE` és nincs `CLEAN` security audit; vagy korábbi backfill miatt már `QUARANTINED`;
- dokumentumforrás `WEB` vagy `DESKTOP`;
- aktív dokumentum;
- a scan végrehajtásához hitelesített `FINALIZED` upload session és S3 hivatkozás szükséges.

A `DROP` forrás kizárt, mert a trusted DROP → Drive archív útvonal már a DROP saját ClamAV kapuján ment át.

A Security V0.5 alatt már `CLEAN` auditot kapott `AVAILABLE` verzió nem kerül be a legacy tervbe.

## Állapotok

- `LEGACY_AVAILABLE` – régi, még elérhető verzió CLEAN audit nélkül;
- `BACKFILL_PENDING` – már visszakerült karanténba, scan vagy scan retry szükséges;
- `CLEAN_AWAITING_APPROVAL` – ClamAV CLEAN, de külön emberi jóváhagyásra vár.

## Admin API

Endpoint:

`/api/projects/admin/drive-security-backfill`

Az endpoint kizárólag licencadmin hitelesítéssel használható.

### GET – dry-run terv

Query:

- `projectId` opcionális;
- `limit` opcionális.

A GET soha nem módosít adatot.

### POST – terv

Ha `execute !== true`, a POST is csak tervet ad vissza.

### POST – végrehajtás

Végrehajtáskor kötelező:

- `execute: true`;
- `confirm: "REQUARANTINE_LEGACY_DRIVE"`;
- legalább `projectId` vagy explicit `versionIds`.

Batch limit legfeljebb 10 verzió futásonként. Ez szándékos korlát, mert a ClamAV INSTREAM vizsgálat nagy fájloknál hosszabb ideig tarthat.

## Audit és idempotencia

A re-quarantine előtt a FINALIZED upload session metadata mezőjébe bekerül:

`driveSecurityBackfill`

Tartalma:

- backfill verzió;
- előző státusz;
- re-quarantine időpont;
- actor;
- backfill ok.

A marker a verzióstátusz-váltás előtt kerül rögzítésre. Ha a későbbi lépés hibázik, a művelet visszakereshető és újraindítható.

A verzió `AVAILABLE → QUARANTINED` módosítása compare-and-set feltétellel történik.

Külön audit készül:

- Project Core: `DRIVE_SECURITY_LEGACY_REQUARANTINED`;
- Drive change event: `SECURITY_LEGACY_REQUARANTINED`.

Az auditazonosítók verzióhoz determinisztikusan kötöttek, ezért retry esetén nem jön létre többszörös esemény.

## Miért nincs új SQL migration?

A DEV operator worktree-ben jelenleg nincs a meglévő szervervédelmi szabályok szerint biztonságosan használható PostgreSQL migrációs credential. A credential-felderítést nem kerüljük meg.

A V0.5.1 ezért meglévő táblákon, service-role hozzáféréssel működő admin workflow, új adatbázisséma nélkül. A biztonsági sorrend úgy készült, hogy részleges hiba esetén a fájl legfeljebb karanténban maradjon, de engedélyezett állapotba ne kerülhessen.

## DEV acceptance cél

A DEV QA projektben Security V0.5 előtt létrehozott legacy WEB/S3 verziók használhatók a valós backfill teszthez. A cél:

1. dry-run pontosan az audit nélküli legacy verziókat jelölje;
2. Security V0.5 alatt létrejött CLEAN verziókat ne jelölje;
3. execute visszategye a legacy verziókat karanténba;
4. valós ClamAV scan fusson;
5. CLEAN után preview maradjon tiltott a külön APPROVE-ig;
6. emberi review után AVAILABLE + preview működjön;
7. a végén ne maradjon legacy AVAILABLE WEB/DESKTOP verzió CLEAN audit nélkül.

## Érintett források

- `app/lib/drive-core/securityBackfillRepository.ts`
- `app/lib/drive-core/securityBackfillService.ts`
- `app/api/projects/admin/drive-security-backfill/route.ts`
- `scripts/drive-security-backfill-v051-contract.mjs`

A Security V0.5 scanner, review, S3, preview és Compare engine változatlanul újrahasznosul.


## DEV valós acceptance – 2026-08-15

A `project-drive-compare-rc1-qa` tesztprojektben a Security V0.5 előtti három valós S3 verzió szolgált legacy mintaként:

- A-101 alaprajz V1 / Rev.01;
- A-101 alaprajz V2 / Rev.02;
- A-201 metszet V1 / Rev.01.

A dry-run eredménye:

- legacyAvailable: **3**;
- executable: **3**;
- unscannable: **0**;
- a Security V0.5 alatt már CLEAN Sec.3/Sec.4 verziók nem kerültek bele.

Confirmation gate:

- `execute=true` explicit `confirm=REQUARANTINE_LEGACY_DRIVE` nélkül HTTP 400 és `DRIVE_SECURITY_BACKFILL_CONFIRMATION_REQUIRED`.

Valós backfill execute:

- processed: **3**;
- CLEAN awaiting approval: **3**;
- infected: **0**;
- failed: **0**;
- mindhárom verzió `QUARANTINED` maradt;
- mindháromhoz valós ClamAV scan futott;
- mindhárom scan SHA-256 egyezett a dokumentumverzió hitelesített SHA-256 értékével.

Emberi approval gate:

- approval előtt preview: HTTP 409 `DRIVE_PREVIEW_NOT_AVAILABLE`;
- mindhárom CLEAN verzió külön meglévő review API-val APPROVE műveletet kapott;
- approval után állapot: `AVAILABLE`;
- approval után PDF preview: HTTP 200, `same-origin-proxy`.

Backfill utáni dry-run:

- total: **0**;
- legacyAvailable: **0**;
- backfillPending: **0**;
- cleanAwaitingApproval: **0**.

Audit ellenőrzés:

- `DRIVE_SECURITY_LEGACY_REQUARANTINED`: **3** projektaudit esemény;
- `SECURITY_LEGACY_REQUARANTINED`: **3** Drive change event;
- mindhárom upload sessionben `driveSecurityBackfill` marker;
- mindhárom upload sessionben `driveSecurityScan.status=CLEAN`.

A DEV QA állományok így már nem tartalmaznak Security V0.5 előtti, CLEAN audit nélküli AVAILABLE WEB/DESKTOP verziót.


## Végleges DEV cutover

Feature commit:

- `c8cb775 feat(drive): backfill legacy security scans`

Végleges Turbopack DEV build:

- **`M55ElcARAz3F8zvoQlTWy`**
- standalone statikus chunk ellenőrzés: **245 PASS**

Cutover rollback backup:

- `/srv/dimpro-dev/backups/drive_security_backfill_v051_runtime_20260815_095721`
- előző build: `Es_1tfzv1TRIkUuW-Z17V`

Aktív runtime:

- PM2: `dimpro-benjadmin-operator-ui-v2-dev`
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- port: 3100
- build: `M55ElcARAz3F8zvoQlTWy`
- runtime identity guard: PASS

### SHA-256 fail-closed acceptance

A végleges exact builden egy QA CLEAN scan audit SHA-256 értéke ideiglenesen, kontrollált tesztben hibás értékre lett cserélve. A backfill planner eredménye:

- state: `LEGACY_AVAILABLE`;
- scanStatus: `CLEAN`;
- securityHashMatch: `false`;
- executable: true;
- a verziót újravizsgálandó legacy jelöltnek minősítette.

Az eredeti metadata a teszt `finally` ágában visszaállt. Visszaállítás után a projekt backfill terve ismét **0 jelölt**.

### Post-cutover aktív runtime acceptance

- admin backfill endpoint jogosultság nélkül: HTTP 401;
- admin dry-run: 0 legacy jelölt;
- Drive storage mode: `active`;
- ClamAV health: `PONG`, engine 1.5.3;
- `activationSafe=true`;
- backfill-elt V1 security status: `CLEAN`;
- V1 preview: HTTP 200;
- same-origin PDF Range: HTTP 206, 100 byte kontrolltartomány;
- publikus `/drive`: meglévő auth redirect szerint HTTP 307;
- BENJADMIN dev console: HTTP 200.

### Végső regresszió

- Drive Security Backfill V0.5.1: **34/34 PASS**;
- Drive Security V0.5.0: **47/47 PASS**;
- Drive/Compare: **173/173 PASS**;
- Drive Workspace: **22/22 PASS**;
- Drive Core V0.30: **24/24 PASS**;
- Project Core: **19/19 PASS**;
- BENJADMIN Live Workspace P7: **43/43 PASS**;
- BENJADMIN Terminal Hub P9 Security: **55/55 PASS**;
- Runtime Identity Guard: **20/20 PASS**;
- TypeScript: PASS;
- teljes `npm run lint`: PASS, 0 error / 104 warning;
- production build: PASS.

A DEV QA adatbázisban a backfill lezárása után nincs Security V0.5 előtti, CLEAN + egyező SHA-256 audit nélküli AVAILABLE WEB/DESKTOP legacy verzió.
