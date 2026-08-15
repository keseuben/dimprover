# DIMPRO Drive Compare Findings V2.1 – Finding → Hibajegy DEV aktiválás

**Dátum:** 2026-08-15  
**Státusz:** DEV AKTÍV / E2E LEZÁRVA  
**Környezet:** kizárólag DEV  
**PROD:** nem érintett  
**SmartSync / Private Vault:** nem érintett

## 1. Eredmény

A Compare Findings V2.1 finding → hibajegy workflow DEV-en aktív. Egy vizuális eltérésből csak emberi `JAVÍTANDÓ` (`FIX_REQUIRED`) döntés után készülhet tartós projekt-hibajegy. Az eredeti finding megmarad; a hibajegy külön objektum és `CREATED_FROM` hivatkozással kapcsolódik hozzá.

A fejlesztéshez elkészült a közös Project Issue Core V0.1 backend mag is. Ez később a Hibajegyzék és a Terepi hibafelvétel közös szerveres alapja lehet.

## 2. Forrás

Feature candidate:

- branch: `feature/jazmin-drive-compare-findings-v210-20260815`
- feature commit: `76086c5575e162d86a31f2d74949a95ac5bc43ff`

Aktív operator integráció:

- worktree: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- integrált commit: `3955cc6e07616fbfff7476f59c86cfa5b9443035`
- branch: `feat/benjadmin-operator-ui-v2`

Pre-cutover Git backup ref:

`backup/benjadmin-pre-compare-findings-v210-cutover-20260815_162240`

A párhuzamos Ármin-AI fejlesztési branch nem került módosításra vagy automatikusan integrálásra.

## 3. Project Issue Core V0.1

Új adatobjektumok:

- `project_issue_schema_meta`
- `project_core_issue_sequences`
- `project_core_issues`

Hibajegy sorszám projektenként:

`HJ-00001`, `HJ-00002`, ...

Forrástípusok:

- `COMPARE_FINDING`
- `FIELD_CAPTURE`
- `MANUAL`
- `MEETING`
- `IMPORT`

Állapotok:

- `NEW`
- `IN_PROGRESS`
- `FIXED`
- `VERIFIED`
- `CLOSED`
- `REOPENED`

Súlyosság:

- `LOW`
- `MEDIUM`
- `HIGH`
- `URGENT`

Új projektjogosultságok:

- `issue.read`
- `issue.write`

OWNER / PROJECT_MANAGER / CONTRIBUTOR: read + write.  
REVIEWER / VIEWER: read only.

## 4. Migráció

Migráció:

`supabase/migrations/20260815161000_project_issue_core_v010.sql`

Bootstrap:

`supabase/DIMPRO_PROJECT_ISSUE_CORE_V010_BOOTSTRAP.sql`

SHA-256 mindkét fájlnál:

`63ff47a8d2cea4adfb87780128786d50ab456d562c042a56e1e527c52ba078ee`

DEV Supabase projekt:

`pbgyuznivqvestuksvif`

Migrációs eredmény:

- tranzakciós apply: PASS / COMMIT
- marker: `project-issue-core|0.1.0|1|project-issue-core-v010-20260815`
- atomic conversion RPC: aktív
- RLS: aktív
- service-role CRUD: engedélyezett
- authenticated közvetlen SELECT: tiltott
- Project Core audit constraint: `issue` típust tartalmazza

## 5. Backup

Pre-V2.1 artifact:

`/srv/dimpro-dev/artifacts/drive-compare-findings-v210-pre-20260815T155818+0200`

Teljes DEV DB dump:

`supabase-dev-pre-v210.dump`

DB dump SHA-256:

`5bd0ddfdbede2b81bae0627632be580a813f393af2acc44677f5668319af7ffa`

Pre-V2.1 source bundle SHA-256:

`debf439dbeb428558cbdbb139dde83a7720243e7e7382e1cf9cde759a29e3cad`

A DB dump `pg_restore -l` ellenőrzést kapott.

## 6. Konverziós szabály

A conversion API csak akkor készít hibajegyet, ha a finding:

- ugyanahhoz a projekthez tartozik;
- nincs archiválva;
- státusza `FIX_REQUIRED`;
- a felhasználó rendelkezik `issue.write` jogosultsággal.

Nem `FIX_REQUIRED` finding esetén:

- HTTP 409
- `PROJECT_ISSUE_COMPARE_FINDING_REQUIRES_FIX_REQUIRED`

A konverzió idempotens: ugyanabból az aktív findingből ismételt kérés nem készít új hibajegyet.

Priority → severity:

- LOW → LOW
- MEDIUM → MEDIUM
- HIGH → HIGH
- CRITICAL → URGENT

A hibajegy örökli a finding felelősét, határidejét és műszaki megjegyzését, továbbá metadata snapshotban megőrzi az A/B dokumentum- és verzióazonosítókat, az oldalt, a zónát, a finding verzióját és a `humanClassification=FIX_REQUIRED` értéket.

## 7. Kapcsolat és audit

Kapcsolat:

`issue --CREATED_FROM--> compare_finding`

Konverziókor egyszer keletkezik:

- `PROJECT_ISSUE_CREATED_FROM_COMPARE_FINDING`
- `DRIVE_COMPARE_FINDING_CONVERTED_TO_ISSUE`
- `COMPARE_FINDING_ISSUE_CREATED`

A Compare repository V2.1-ben a bejövő entity linkeket is feloldja és a hibajegy `HJ-xxxxx` sorszámát `targetLabel` mezőként visszaadja.

## 8. Valós DEV E2E

QA projekt:

`project-drive-compare-rc1-qa`

QA felhasználó:

`qa-drive-rc1` – aktív OWNER

Finding:

`drive-finding-v210-e2e-20260815162150`

Létrejött hibajegy:

- id: `project-issue-39bf809d99d245c1`
- serial: `HJ-00001`
- source: `COMPARE_FINDING`
- severity: `URGENT`
- status: `NEW`
- responsible: `qa-drive-rc1`
- due: `2026-08-22T12:00:00Z`

E2E sorrend és eredmény:

1. REVIEW finding létrehozás: HTTP 201
2. REVIEW → issue konverzió: HTTP 409, elvárt human gate
3. emberi PATCH → FIX_REQUIRED: HTTP 200, version 2
4. első konverzió: HTTP 201, `HJ-00001`
5. ismételt konverzió: HTTP 200, ugyanaz az issue, `created=false`
6. issue lista: pontosan 1 kapcsolt issue
7. Compare reload: `targetType=issue`, `targetLabel=HJ-00001`
8. DB-ben pontosan 1 aktív issue az adott source findinghez
9. pontosan 1 `CREATED_FROM` entity link
10. issue audit: 1 db
11. finding conversion audit: 1 db
12. Drive change-feed conversion event: 1 db

## 9. Build és contract kapuk

Feature candidate build:

`KAch7OiDMuT12oVvYbcHD`

Végleges, aktív operator worktree-ben készült release build:

`UDBbz0Ivi6fM29BN2s_wK`

Aktív release könyvtár:

`.next-drive-compare-findings-v210`

Kapuk:

- TypeScript: PASS
- ESLint: PASS, 0 error; meglévő warningok nem blokkolók
- `git diff --check`: PASS
- production Turbopack build: PASS
- standalone assets: PASS
- 245 statikus chunk: PASS
- Compare Findings V2.1 issue conversion contract: `45/45 PASS`
- Compare Findings V2.0 regresszió: `30/30 PASS`
- teljes Drive/Compare contract: `206/206 PASS`
- BENJADMIN P10.2 regresszió: `50/50 PASS`
- Supabase migration order: PASS, 40 migration / 17 dependency check

A már ismert Next/Turbopack NFT warning továbbra is megjelenik a `next.config.ts` / infrastructure-summary trace környezetében, de a build sikeres.

## 10. DEV cutover

Aktiválás előtti pointer:

`.next-drive-compare-findings-v200`

Aktív pointer:

`.next-drive-compare-findings-v210`

Aktív PM2:

`dimpro-benjadmin-operator-ui-v2-dev`

Port:

`3100`

A cutover után 3 másodpercen belül egyszerre teljesült:

- Issue Core health: `0.1.0`, databaseReady=true
- Compare Findings health: `2.0.0`, databaseReady=true

Rollback feltétel be volt építve; nem kellett aktiválni.

## 11. Post-cutover acceptance

- publikus `/drive`: 307 → `/login`
- publikus `/login`: HTTP 200
- auth nélküli convert API: HTTP 401
- Issue health: HTTP 200 / `0.1.0`
- issue lista: HTTP 200 / `HJ-00001` látható
- ismételt conversion: HTTP 200 / `created=false`
- PM2: online
- PM2 cwd: helyes operator worktree
- unstable restart: 0
- csak port 3100 maradt aktív; 3210/3220 candidate folyamatok törölve

## 12. Biztonsági határok

- PROD nem kapott kódot, migrációt, restartot vagy konfigurációmódosítást.
- SmartSync fejlesztés nem indult.
- Private Vault fejlesztés nem indult.
- általános SQL executor nem készült.
- titkos Supabase/PostgreSQL credential nem került dokumentációba.
- a visual compare továbbra sem automatikus hibaminősítő: hibajegy csak emberi `JAVÍTANDÓ` döntés után hozható létre.

## 13. Következő logikus fejlesztési pont

A V2.1 backend és Compare-konverzió kész. A következő praktikus szelet a meglévő `/jegyzokonyvek/hibajegyzek` felület rákapcsolása a Project Issue Core V0.1-re, hogy a Compare-ból létrehozott `HJ-xxxxx` hibajegyek a központi Hibajegyzékben is azonnal megjelenjenek és onnan kezelhetők legyenek.
