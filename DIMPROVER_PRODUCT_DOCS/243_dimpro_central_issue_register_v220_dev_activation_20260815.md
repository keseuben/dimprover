# DIMPRO Központi Hibajegyzék V2.2 – Project Issue Core V0.2 DEV aktiválás

**Dátum:** 2026-08-15  
**Státusz:** DEV AKTÍV / E2E LEZÁRVA  
**Környezet:** kizárólag DEV  
**PROD:** nem érintett  
**SmartSync / Private Vault:** nem érintett

## 1. Eredmény

A `/jegyzokonyvek/hibajegyzek` korábbi statikus mintaadatai helyett a felület most a közös, szerveres Project Issue Core adatmodellből működik.

A Compare Findings V2.1-ből létrehozott `HJ-xxxxx` hibajegyek azonnal megjelennek a központi Hibajegyzékben. A felület projektalapú, jogosultságfüggő, kereshető és szűrhető, valamint támogatja a közvetlen hibajegy-szerkesztést optimista concurrency védelemmel és auditnaplóval.

A fejlesztés megőrzi az Ármin-AI párhuzamos AI Developer Space V1 fejlesztését is; a V2.2 annak aktuális operator headjére integrálva készült.

## 2. Forrás és integráció

Feature worktree:

`/srv/dimpro-dev/worktrees/jazmin-central-issue-register-v220`

Feature branch:

`feature/jazmin-central-issue-register-v220-20260815`

Feature commit:

`c16ed3596e1acf705957e1eb1206763bddcc881c`

Feature commit message:

`feat(issues): connect central register to project issue core`

A párhuzamos Ármin-AI fejlesztés integráció előtti aktív operator headje:

`5667a4931ea3a2568862dcee8d6052f36aac8f96`

Kapcsolódó Ármin-AI commitok:

- `3f593d0` – AI Developer Space task control V1
- `5667a49` – active runtime build ID javítás

A V2.2 konfliktus nélkül erre a headre került.

Aktív V2.2 source commit a cutoverkor:

`394301dde404d681c102bda29c0b7205ebcdb528`

Pre-V2.2 operator backup ref:

`backup/benjadmin-pre-central-issue-v220-cutover-20260815_170120`

## 3. Projektkontextus

A jelenlegi globális AppLayout / RightSidebar még nem tart fenn közös aktív projekt-state-et minden modul számára. Emiatt ebben a körben nem készült keresztmoduláris layout-átalakítás.

A Hibajegyzék projektkontextusa:

- `/api/projects` alapján tölti az elérhető projekteket;
- támogatja a `?projectId=<projectId>` URL paramétert;
- ha az URL-ben lévő projekt nem elérhető, az első hozzáférhető projektet választja;
- projektváltáskor `history.replaceState` segítségével frissíti a `projectId` paramétert.

Ez később közvetlenül összeköthető a globális jobb oldali projektváltóval új adatmodell nélkül.

## 4. Központi Hibajegyzék UI

A korábbi hardcoded `HJ-001`–`HJ-004` mintaadatok kikerültek.

A felület valós időben betölti:

- projektlistát;
- Project Issue Core health állapotot;
- projekt hibajegyeit;
- aktív projekttagokat.

Fő funkciók:

- projektválasztó;
- URL-alapú projektkontextus;
- keresés HJ azonosítóra, címre, felelősre, szakágra és helyszínre;
- státusz szűrő;
- súlyosság szűrő;
- élő összes / nyitott / lejárt / javítás statisztika;
- inline státuszmódosítás;
- inline súlyosságmódosítás;
- inline felelősválasztás aktív projekttagokból;
- inline határidő-módosítás;
- részletező panel;
- cím szerkesztés;
- helyszín szerkesztés;
- szakág szerkesztés;
- leírás szerkesztés;
- belső megjegyzés szerkesztés;
- forrás megjelenítés;
- audit metaadatok és aktuális verzió megjelenítés;
- jogosultság szerint szerkeszthető vagy csak olvasható mód.

Támogatott forráscímkék:

- Drive Compare
- Terepi hibafelvétel
- Kézi hibajegy
- Értekezlet
- Import

## 5. Jogosultság

A V2.1-ben bevezetett jogosultságmodell változatlan:

- `issue.read`
- `issue.write`

OWNER / PROJECT_MANAGER / CONTRIBUTOR:

- issue.read
- issue.write

REVIEWER / VIEWER:

- issue.read
- nincs issue.write

A kliensfelület a `/api/projects` által visszaadott permission listából állapítja meg a szerkeszthetőséget. A szerveroldali PATCH külön is kötelezően ellenőrzi az `issue.write` jogosultságot.

## 6. Project Issue Core V0.2

Új RPC:

`project_issue_update_atomic(project_id, issue_id, expected_version, patch, actor_user_id, actor_name)`

Módosítható mezők:

- title
- description
- location
- discipline
- severity
- status
- responsibleUserId
- dueAt
- note

Támogatott státuszok:

- NEW
- IN_PROGRESS
- FIXED
- VERIFIED
- CLOSED
- REOPENED

Támogatott súlyosságok:

- LOW
- MEDIUM
- HIGH
- URGENT

Védelem:

- projektizolált issue keresés;
- `FOR UPDATE` sorzár;
- kötelező `expectedVersion`;
- stale verzió esetén `PROJECT_ISSUE_VERSION_CONFLICT` / HTTP 409;
- csak aktív projekttag lehet felelős;
- szerveroldali státusz-, súlyosság- és dátumvalidáció;
- üres cím tiltott;
- mezőhossz-korlátok;
- minden sikeres mentés `version + 1`;
- updated_by / updated_by_name / updated_at frissítés;
- Project Core audit esemény minden sikeres módosításkor.

Audit event:

`PROJECT_ISSUE_UPDATED`

## 7. API

Meglévő:

- `GET /api/projects/[projectId]/issues`
- `GET /api/projects/[projectId]/issues/health`

Új:

- `PATCH /api/projects/[projectId]/issues/[issueId]`

A health API V0.2-ben:

- version: `0.2.0`
- schema: `0.2.0`
- bootstrap: `project-issue-core-v020-20260815`

## 8. Migráció

Migráció:

`supabase/migrations/20260815164500_project_issue_core_v020.sql`

Bootstrap:

`supabase/DIMPRO_PROJECT_ISSUE_CORE_V020_BOOTSTRAP.sql`

SHA-256 mindkét fájlnál:

`8fdf059cf100998a2f873c42cc48fe1f4a3c776c7d25b591280c2c7c4031579e`

DEV Supabase projekt:

`pbgyuznivqvestuksvif`

Migration result:

- BEGIN
- CREATE FUNCTION
- REVOKE
- GRANT
- schema marker update
- COMMIT

Aktív marker:

`project-issue-core|0.2.0|2|project-issue-core-v020-20260815`

Migrációs sorrend:

- 41 SQL migráció
- 18 dependency check
- V0.1 megelőzi V0.2-t
- V0.2 a jelenlegi sorrend végén

## 9. Backup

Pre-V2.2 artifact:

`/srv/dimpro-dev/artifacts/central-issue-register-v220-pre-20260815T163539+0200`

Teljes DEV DB dump:

`supabase-dev-pre-v220.dump`

DB dump SHA-256:

`1b02442d038bb08a4102ba94d58045d65462a3076a9cd9486ddbb295e3bc18de`

Pre-V2.2 source bundle SHA-256:

`842c71af4c8b71cf4501493c440462327db077f53fa5ef01ff7c29d3857ddb04`

A DB dump `pg_restore -l` ellenőrzést kapott.

## 10. Valós DEV E2E

QA projekt:

`project-drive-compare-rc1-qa`

QA hibajegy:

- id: `project-issue-39bf809d99d245c1`
- serial: `HJ-00001`
- source: `COMPARE_FINDING`

E2E induló üzleti állapot:

- status: NEW
- severity: URGENT
- responsible: qa-drive-rc1
- version: 1
- due: 2026-08-22T12:00:00Z

Tesztelt folyamat:

1. auth nélküli PATCH → HTTP 401;
2. health → HTTP 200 / 0.2.0;
3. eredeti HJ-00001 snapshot mentése;
4. többmezős update → HTTP 200;
5. version 1 → version 2;
6. status NEW → IN_PROGRESS;
7. severity URGENT → HIGH;
8. cím, leírás, helyszín, szakág, felelős, határidő, note módosítás;
9. stale expectedVersion=1 PATCH → HTTP 409;
10. error code: `PROJECT_ISSUE_VERSION_CONFLICT`;
11. reload → version 2 tartósan visszaolvasható;
12. eredeti üzleti snapshot visszaállítása;
13. restore → HTTP 200 / version 3;
14. minden üzleti mező összehasonlítva, visszaállítás PASS;
15. DB-ben pontosan 2 `PROJECT_ISSUE_UPDATED` audit esemény;
16. végállapotban HJ-00001 üzleti értékei megegyeznek az E2E előtti állapottal.

A version 3 és a két audit event szándékosan megmarad, mert a tesztfrissítés és visszaállítás is auditált valódi DEV művelet volt.

## 11. Statikus és regressziós kapuk

- TypeScript: PASS
- ESLint: PASS, 0 error / 103 meglévő warning
- `git diff --check`: PASS
- Central Issue Register V2.2: `46/46 PASS`
- Compare Findings V2.1: `45/45 PASS`
- Compare Findings V2.0: `30/30 PASS`
- teljes Drive/Compare: `206/206 PASS`
- BENJADMIN P10.2: `50/50 PASS`
- Ármin AI Developer Space V1: `40/40 PASS`
- migration order: PASS

A V2.1 contractot kompatibilissé tettük a magasabb Issue Core V0.2 verzióval: továbbra is ellenőrzi a V0.1 konverziós funkcionalitást, de nem követeli, hogy a V0.1 legyen a legutolsó séma.

## 12. Build

Feature candidate build:

`UbTJv03kPAc2z0QKqAzuZ`

Végleges aktív operator-worktree release build:

`WmSckw0g-juU3zh5b3tGX`

Release könyvtár:

`.next-central-issue-register-v220`

Standalone asset ellenőrzés:

- 245 statikus chunk PASS

A már ismert Next/Turbopack NFT warning továbbra is megjelenik a `next.config.ts` / infrastructure-summary trace miatt, de buildhibát nem okoz.

## 13. Candidate és cutover

Feature candidate:

- port 3210
- build `UbTJv03kPAc2z0QKqAzuZ`
- restart 0

Exact active-worktree candidate:

- port 3220
- build `WmSckw0g-juU3zh5b3tGX`
- restart 0
- standalone `.dimprover` link a helyes operator központi adattárra mutat

Cutover előtti aktív pointer:

`.next-benjadmin-ai-space-v1`

Cutover előtti aktív Ármin build:

`Qxt3wN0-DmPiMZfe8xvBf`

Új aktív pointer:

`.next-central-issue-register-v220`

Új aktív build:

`WmSckw0g-juU3zh5b3tGX`

A 3100-as runtime 3 másodpercen belül teljesítette egyszerre:

- Issue Core 0.2.0 / databaseReady=true
- Compare Findings 2.0.0 / databaseReady=true

PM2:

- process: `dimpro-benjadmin-operator-ui-v2-dev`
- cwd: helyes operator worktree
- port: 3100
- unstable restart: 0

## 14. Migráció és régi runtime közötti átmeneti állapot

A V0.2 DB migráció után, de a V2.2 release cutover előtt a korábbi V2.1 runtime health szándékosan 503-at adott:

- runtime expected version: 0.1.0
- actual DB version: 0.2.0

Ez fail-closed schema marker viselkedés volt, nem adatvesztés vagy DB-hiba. A HJ-00001 rekord végig sértetlen maradt. A V2.2 candidate és release elkészülte után a 3100-as cutover helyreállította a health-et 0.2.0 / ready=true állapotra.

## 15. Élő DEV acceptance

Külön 16 pontos élő 3100-as acceptance futott:

1. Hibajegyzék publikus route login gate és projectId megőrzés;
2. login oldal HTTP 200;
3. issue lista auth nélkül HTTP 401;
4. Issue Core schema 0.2.0;
5. databaseReady=true;
6. QA projekt elérhető;
7. issue.read jogosultság;
8. issue.write jogosultság;
9. HJ-00001 listázható;
10. forrás COMPARE_FINDING;
11. üzleti status NEW visszaállítva;
12. severity URGENT visszaállítva;
13. audit version v3;
14. aktív QA projekttag feloldható;
15. pontosan két V2.2 update audit esemény;
16. Compare Findings 2.0.0 regresszió health.

Eredmény:

`16/16 PASS`

Acceptance log:

`/srv/dimpro-dev/artifacts/central-issue-register-v220-pre-20260815T163539+0200/live-acceptance-v220.txt`

SHA-256:

`18f769ea1afaf06fe51f852a3b9583b5bbaeafbc08bd97140a180f77e49c3030`

A webes DEV token nem kerül felhasználásra web-login megkerülésére: tokennel a Hibajegyzék oldal továbbra is `/login` felé irányít. A token csak az erre engedélyezett API DEV auth útvonalon működik.

## 16. Cleanup

A sikeres cutover után törölve:

- `dimpro-central-issue-register-v220-candidate` / 3210
- `dimpro-central-issue-register-v220-active-candidate` / 3220

Csak a fő 3100-as DEV runtime maradt aktív.

## 17. Biztonsági határok

Ebben a körben:

- PROD nem kapott kódot;
- PROD DB migráció nem történt;
- PROD restart nem történt;
- PROD konfiguráció nem változott;
- SmartSync fejlesztés nem indult;
- Private Vault fejlesztés nem indult;
- web-login auth megkerülés nem készült;
- secret/token érték nem került dokumentációba;
- általános SQL executor nem készült.

## 18. Következő logikus fejlesztési pont

A közös Project Issue Core V0.2 és a központi Hibajegyzék most már működik. A következő logikus integrációs szelet:

**Terepi hibafelvétel → Project Issue Core**, hogy a terepen létrehozott hibák ugyanabba a központi `HJ-xxxxx` nyilvántartásba kerüljenek, mint a Drive Compare findingből létrehozott hibajegyek.

Ezt követően külön szeletként jöhet:

- finding → jegyzőkönyvi pont;
- finding → DokuBOX kapcsolat;
- hibajegy komment-/státusztörténet;
- hibajegy PDF/XLSX riport;
- értesítési workflow.
