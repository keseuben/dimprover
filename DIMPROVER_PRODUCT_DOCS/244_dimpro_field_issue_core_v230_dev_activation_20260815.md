# DIMPRO Terepi hibafelvétel → Project Issue Core V0.3 DEV aktiválás

**Dátum:** 2026-08-15  
**Státusz:** DEV AKTÍV / E2E LEZÁRVA  
**Környezet:** kizárólag DEV  
**PROD:** nem érintett  
**SmartSync / Private Vault:** nem érintett

## 1. Eredmény

A Terepi hibafelvétel már nem kizárólag kliensoldali `TH-xxx` React-state munkapéldányként működik. A helyi terepi workflow megmaradt a gyors fotó-, terv- és megjegyzésrögzítéshez, de a felhasználó explicit mentési művelettel központi, auditált `HJ-xxxxx` Project Issue Core hibajegyet hozhat létre.

A központi HJ létrehozása nem történik minden mezőmódosításkor. A rendszer csak külön `Központi HJ mentése`, `Központi HJ frissítése` vagy mobil Mentés műveletre ír az adatbázisba.

Az első központi mentés után a terepi tétel megőrzi a saját helyi identitását a fotó- és tervkapcsolatokhoz, miközben a megjelenített fő azonosító a központi `HJ-xxxxx` sorszám lesz.

## 2. Forrás és integráció

Feature worktree:

`/srv/dimpro-dev/worktrees/jazmin-field-issue-core-v230`

Feature branch:

`feature/jazmin-field-issue-core-v230-20260815`

Feature commit:

`e8411193880700f6a255eacb916d8872e59ad0e3`

Commit message:

`feat(issues): sync field captures to project issue core`

Feature baseline / párhuzamos Ármin-AI head:

`6d942326da9e801bae7145794585a0b029f0661d`

Aktív operator integrált commit:

`970525b0f2ad91e02583ff946ae2b26ad5c6fe3d`

Pre-cutover operator backup ref:

`backup/benjadmin-pre-field-issue-v230-cutover-20260815_175118`

A V0.3 az Ármin-AI `6d94232` aktuális módosításaira került, konfliktus nélkül.

## 3. Terepi helyi és központi identitás

A terepi issue objektum megtartja:

- helyi `id` értékét;
- helyi `TH-xxx` sorszámát `localSerial` mezőben;
- fotókapcsolatait;
- tervkapcsolatait;
- lokális szerkesztési állapotát.

Központi sync után további mezők kapcsolódnak hozzá:

- `sourceId`
- `coreIssueId`
- `coreSerial`
- `coreVersion`
- `syncState`
- `syncError`
- `syncedAt`

Sync state-ek:

- `LOCAL`
- `DIRTY`
- `SYNCING`
- `SYNCED`
- `ERROR`

A terepi listában és adatlapon külön badge mutatja, hogy a tétel csak helyi vázlat, központi HJ, módosított vagy hibás sync állapotú.

## 4. Projektkontextus

A `/jegyzokonyvek/uj/terepi-hibafelvetel` oldal most valós projektkontextust használ:

- `/api/projects` projektlista;
- `?projectId=<projectId>` URL paraméter;
- hibás/nem elérhető projectId esetén első hozzáférhető projekt;
- projektváltáskor `history.replaceState`;
- `projectId`, `projectName`, `projectCode`, `permissions` átadása a terepi munkatérnek;
- projektváltáskor a `FieldMinutePage` React key változik, ezért a helyi terepi state nem folyik át másik projektbe.

A korábbi hardcoded `Duna Part Lakópark` projektválasztás megszűnt. A munkaterület külön helyi mezőként maradt meg.

## 5. Explicit központi mentés

A központi adatbázisba írás csak felhasználói műveletre történik.

Elérhető műveletek:

- `Központi HJ mentése`
- `Központi HJ frissítése`
- mobil alsó `Mentés`

Első mentés:

- POST `/api/projects/[projectId]/issues`
- sourceType = `FIELD_CAPTURE`
- stabil, egyedi sourceId
- új `HJ-xxxxx` sorszám
- version 1

További mentés:

- PATCH `/api/projects/[projectId]/issues/[issueId]`
- kötelező `expectedVersion`
- siker esetén version + 1

Ha a központi HJ-t közben más módosította:

- HTTP 409
- `PROJECT_ISSUE_VERSION_CONFLICT`
- a kliens megpróbálja visszaolvasni az aktuális core verziót;
- a tétel `ERROR` állapotot kap;
- a felhasználó újramentheti a helyi változtatást az új verzióra.

## 6. FIELD_CAPTURE payload

A terepi workflow a központi HJ-be átadja:

- title
- description
- location
- severity
- status
- külső responsibleName
- dueAt
- note

Metadata:

- `fieldCaptureVersion`
- `fieldLocalIssueId`
- `fieldLocalSerial`
- `contractorRepresentative`
- `projectId`
- `projectCode`
- `projectName`
- `workArea`
- `recordDate`
- `photoCount`
- `planLinkCount`

A fotók és tervfájlok fizikai átemelése ebben a körben nem történt meg; a V0.3 a kapcsolat és számláló metadata alapját készíti elő. A helyi terepi issue ID továbbra is stabil marad, ezért a meglévő fotó-/tervkapcsolatok nem szakadnak le.

## 7. Státusz- és súlyosság mapping

Terepi → Project Issue Core súlyosság:

- Alacsony → LOW
- Közepes → MEDIUM
- Magas → HIGH
- Sürgős → URGENT

Terepi → Project Issue Core státusz:

- Új → NEW
- Folyamatban → IN_PROGRESS
- Javítva → FIXED
- Ellenőrizve → VERIFIED
- Lezárva → CLOSED
- Újranyitva → REOPENED

## 8. Külső vállalkozói felelős

V0.3-ban a Project Issue Core támogatja a nem DIMPRO-projekttag külső felelős nevét is.

Ha `responsibleUserId` nincs, a `responsibleName` mezőben például kivitelező cég vagy külső partner tárolható.

Ha `responsibleUserId` meg van adva, továbbra is csak aktív projekttag választható.

A központi `/jegyzokonyvek/hibajegyzek` felület külső felelősnél ezt mutatja:

`Külső: <responsibleName>`

## 9. Project Issue Core V0.3

Új generikus create RPC:

`project_issue_create_atomic(project_id, source_type, source_id, payload, actor_user_id, actor_name)`

Engedélyezett sourceType:

- FIELD_CAPTURE
- MANUAL
- MEETING
- IMPORT

A `COMPARE_FINDING` szándékosan NINCS a generikus create allowlistben.

Ennek célja, hogy a Compare Findings V2.1 emberi `JAVÍTANDÓ / FIX_REQUIRED` gate-jét semmilyen generikus issue-create útvonal ne kerülhesse meg.

Nem engedélyezett sourceType esetén:

`PROJECT_ISSUE_SOURCE_TYPE_INVALID`

## 10. Idempotencia

Aktív hibajegyre meglévő unique source szabály:

`project_id + source_type + source_id`

Azonos FIELD_CAPTURE source újbóli POST esetén:

- új HJ nem készül;
- HTTP 200;
- `created=false`;
- ugyanaz az issue ID és HJ serial érkezik vissza.

Az RPC unique violation fallbacket is tartalmaz, így párhuzamos create esetén is a már létrejött rekord visszaolvasható.

## 11. Entity link

Generikus HJ létrehozáskor:

`issue --CREATED_FROM--> field_capture`

A kapcsolat source és target azonosítója auditálható, a linkre külön unique index készült a generikus issue-forrásokhoz.

## 12. Audit

Létrehozáskor:

`PROJECT_ISSUE_CREATED`

Frissítéskor:

`PROJECT_ISSUE_UPDATED`

Az update audit továbbra is tárolja:

- serial
- version
- status
- severity
- responsibleUserId
- responsibleName
- dueAt
- changes snapshot

## 13. V0.3 update RPC bővítés

A V0.2 optimistic update logika megmaradt.

V0.3 bővítés:

- `responsibleName` patch támogatás;
- `metadata` objektum patch támogatás;
- metadata merge a meglévő metadata objektumba;
- külső felelősnév támogatása `responsibleUserId` nélkül.

## 14. Helyi törlés szabály

Ha egy terepi tételből már központi HJ készült, a helyi terepi tétel törlése NEM törli automatikusan a központi HJ rekordot.

A UI erről külön figyelmeztet:

- helyi terepi munkapéldány törölhető;
- auditált központi HJ megmarad.

Tömeges törlésnél központi HJ-k esetén külön megerősítés szükséges.

## 15. Migráció

Migráció:

`supabase/migrations/20260815173500_project_issue_core_v030.sql`

Bootstrap:

`supabase/DIMPRO_PROJECT_ISSUE_CORE_V030_BOOTSTRAP.sql`

SHA-256:

`fdf94c86b97304108aafad7d0dae15705bb42cf5a778bd9e8925f98db2dbecf4`

DEV Supabase projekt:

`pbgyuznivqvestuksvif`

Apply result:

- BEGIN
- CREATE INDEX
- CREATE FUNCTION – generic create
- REVOKE / GRANT
- CREATE FUNCTION – V0.3 update
- REVOKE / GRANT
- schema marker update
- COMMIT

Aktív marker:

`project-issue-core|0.3.0|3|project-issue-core-v030-20260815`

Migrációs sorrend:

- 42 migration
- 19 dependency check
- V0.1 → V0.2 → V0.3 sorrend
- V0.3 a jelenlegi lista végén

## 16. Backup

Pre-V0.3 artifact:

`/srv/dimpro-dev/artifacts/field-issue-core-v230-pre-20260815T172421+0200`

Teljes DEV DB dump:

`supabase-dev-pre-v230.dump`

DB dump SHA-256:

`f2c125400dbba325d0baa37dc493d82982314c8580faa316a83e2efa84a8a868`

Pre-V0.3 source bundle SHA-256:

`77c73b70f1aaab2f7d2dd7108bd210d98dd2feb25ece8bf3e7d1c7f092fffcb9`

A DB dump `pg_restore -l` ellenőrzést kapott.

## 17. Candidate build

Feature candidate build:

`Pbu8bRmPg1WDdobU7EEKe`

Feature candidate port:

`3210`

Candidate restart:

`0`

A candidate build még a V0.3 DB migráció előtt elkészült és production build PASS volt.

## 18. Valós DEV E2E

QA projekt:

`project-drive-compare-rc1-qa`

Korábbi Compare HJ:

- `HJ-00001`
- sourceType `COMPARE_FINDING`

V0.3 QA FIELD_CAPTURE source:

`field-capture-v230-e2e-20260815175021`

Létrejött issue:

- id: `project-issue-edeb2ee5302549d0`
- serial: `HJ-00002`
- sourceType: `FIELD_CAPTURE`
- sourceId: `field-capture-v230-e2e-20260815175021`

Create állapot:

- severity HIGH
- status NEW
- external responsibleName `E2E Külső Kivitelező Kft.`
- version 1

Update után:

- severity URGENT
- status IN_PROGRESS
- responsibleName `E2E Külső Kivitelező Kft. – javító`
- version 2
- photoCount 3
- planLinkCount 2

E2E lépések:

1. health HTTP 200 / schema 0.3.0;
2. generikus COMPARE_FINDING create → HTTP 400;
3. error code `PROJECT_ISSUE_SOURCE_TYPE_INVALID`;
4. FIELD_CAPTURE create → HTTP 201;
5. HJ serial regex PASS;
6. sourceType FIELD_CAPTURE;
7. külső responsibleName mentés;
8. terepi metadata mentés;
9. azonos source ismételt POST → HTTP 200;
10. `created=false`;
11. ugyanaz az issue / serial;
12. PATCH expectedVersion 1 → HTTP 200;
13. version 2;
14. status és severity frissítés;
15. külső responsibleName frissítés;
16. metadata merge;
17. stale expectedVersion 1 → HTTP 409;
18. `PROJECT_ISSUE_VERSION_CONFLICT`;
19. reload → version 2 tartósan látható;
20. DB source uniqueness = 1;
21. CREATED_FROM field_capture link = 1;
22. PROJECT_ISSUE_CREATED audit = 1;
23. PROJECT_ISSUE_UPDATED audit = 1.

A `HJ-00002` QA rekord auditált tesztadatként megmarad; nem került megkerülő SQL DELETE-re.

## 19. Statikus és regressziós kapuk

- Field Issue Core V2.3: `70/70 PASS`
- Central Issue Register V2.2: `46/46 PASS`
- Compare Findings V2.1: `45/45 PASS`
- Compare Findings V2.0: `30/30 PASS`
- teljes Drive / Compare: `206/206 PASS`
- BENJADMIN P10.2: `50/50 PASS`
- Ármin AI Developer Space V1: `40/40 PASS`
- TypeScript: PASS
- ESLint: 0 error / 103 meglévő warning
- migration order: 42 migration / 19 dependency check PASS
- `git diff --check`: PASS

## 20. Végleges operator build

Aktív operator source a release build készítésekor:

`970525b0f2ad91e02583ff946ae2b26ad5c6fe3d`

Végleges build:

`Tgp-ODgYRzmIgsfJ8fe7o`

Release könyvtár:

`.next-field-issue-core-v230`

Standalone asset:

- 245 static chunk PASS

A már ismert Next/Turbopack NFT warning megjelent a `next.config.ts` / infrastructure-summary trace miatt, de buildhibát nem okozott.

## 21. Exact operator candidate

Port:

`3220`

Build:

`Tgp-ODgYRzmIgsfJ8fe7o`

Ellenőrzések:

- restart 0;
- helyes operator cwd;
- helyes központi `.dimprover` symlink;
- terepi route login gate;
- auth nélküli issue API 401;
- health 0.3.0;
- HJ-00001 Compare rekord;
- HJ-00002 FIELD_CAPTURE rekord;
- idempotens FIELD_CAPTURE create;
- generic Compare create tiltás.

## 22. DEV cutover

Cutover előtti pointer:

`.next-central-issue-register-v220`

Cutover előtti build:

`WmSckw0g-juU3zh5b3tGX`

Aktív pointer:

`.next-field-issue-core-v230`

Aktív build:

`Tgp-ODgYRzmIgsfJ8fe7o`

Aktív PM2:

`dimpro-benjadmin-operator-ui-v2-dev`

Port:

`3100`

A V0.3 runtime 3 másodperc alatt teljesítette egyszerre:

- Issue Core health 0.3.0 / databaseReady=true;
- Compare Findings 2.0.0 / databaseReady=true;
- PM2 online;
- unstable restart 0.

## 23. Élő post-cutover acceptance

Külön 21 pontos élő acceptance futott a 3100-as runtime-on.

Eredmény:

`21/21 PASS`

Fő ellenőrzések:

- terepi route login gate + projectId megőrzés;
- login HTTP 200;
- központi Hibajegyzék auth gate;
- issue API auth nélkül 401;
- Issue Core 0.3.0 ready;
- QA projekt és issue.write jogosultság;
- HJ-00001 Compare rekord megmaradt;
- HJ-00002 FIELD_CAPTURE listázható;
- külső felelős tárolható;
- localSerial / photoCount / planLinkCount metadata;
- create idempotencia;
- COMPARE_FINDING generic create tiltás;
- DB source uniqueness;
- entity link uniqueness;
- create/update audit pontosan 1-1;
- Compare Findings 2.0.0 health.

Acceptance log:

`/srv/dimpro-dev/artifacts/field-issue-core-v230-pre-20260815T172421+0200/live-acceptance-v230.txt`

SHA-256:

`a1e799e117e155e737fc14d77e509bea9be0e12f8985ed1572d68b414e138f47`

## 24. Cleanup

Sikeres cutover után törölve:

- `dimpro-field-issue-core-v230-candidate` / 3210
- `dimpro-field-issue-core-v230-active-candidate` / 3220

Csak a fő 3100-as DEV runtime maradt aktív.

## 25. Biztonsági határok

Ebben a körben:

- PROD nem kapott kódot;
- PROD DB migráció nem történt;
- PROD restart nem történt;
- PROD konfiguráció nem változott;
- SmartSync fejlesztés nem indult;
- Private Vault fejlesztés nem indult;
- generikus create nem képes COMPARE_FINDING HJ létrehozására;
- a Compare human FIX_REQUIRED gate megmaradt;
- web-login megkerülés nem készült;
- secret / DEV token érték nem került dokumentációba;
- általános SQL executor nem készült;
- auditált központi HJ helyi törléssel nem semmisül meg.

## 26. Következő logikus fejlesztési pont

A Terepi hibafelvétel és a Drive Compare most ugyanabba a központi HJ-rendszerbe dolgozik.

Következő praktikus szelet lehet:

1. terepi fotó- és tervkapcsolatok szerveres entity-link / asset kapcsolatainak tényleges központi mentése;
2. HJ komment- és státusztörténet;
3. HJ értesítési workflow felelősnek és határidőre;
4. HJ PDF/XLSX jelentés;
5. meeting / manual source bekötése ugyanebbe a generikus create core-ba.
