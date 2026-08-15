# DIMPRO Drive Compare Findings V2.0 – DEV aktiválás

**Dátum:** 2026-08-15  
**Státusz:** DEV AKTÍV / E2E LEZÁRVA  
**Környezet:** kizárólag DEV  
**PROD:** nem érintett  
**SmartSync / Private Vault:** ebben a körben nem fejlesztve

## 1. Aktiválási összefoglaló

A Compare Findings V2.0 tartós, auditált eltérési jegyzéke sikeresen aktiválva lett a DIMPRO DEV környezetben. Az aktiválás a kötelező fail-closed sorrendben történt:

1. aktuális source/runtime ellenőrzés;
2. source + teljes DEV adatbázis backup;
3. migration target guard;
4. kizárólag DEV Supabase migráció;
5. schema health;
6. V2 integráció az aktív BENJADMIN operator source-ba;
7. TypeScript, ESLint, production build és contract kapuk;
8. külön candidate runtime;
9. valós DEV create → reload → update → concurrency conflict → soft delete → audit E2E;
10. worktree-kompatibilis release build;
11. pointer-alapú 3100-as DEV cutover;
12. post-cutover acceptance.

## 2. Forrás és runtime

Aktív operator worktree:

`/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`

Aktiválás előtti aktív source head:

`5bcc66968a62c8245385b05c7453a9406c62ecaf`

Compare Findings V2 source az aktív operator ágba integrálva:

- `c398b15` – `feat(drive): persist compare findings workflow`
- `2f67a60` – `docs(drive): record compare findings V2 release candidate`

Aktiválás előtti biztonsági Git referencia:

`backup/benjadmin-pre-compare-findings-v200-cutover-20260815_150939`

Aktív PM2 folyamat: `dimpro-benjadmin-operator-ui-v2-dev`  
PM2 cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`  
DEV port: `3100`

A PM2 runtime identity változatlan maradt; cross-worktree runtime nem lett aktiválva.

## 3. DEV adatbázis és migration gate

Az aktív DEV alkalmazás Supabase Cloud projektet használ:

`pbgyuznivqvestuksvif`

A migrációhoz a már meglévő, root-only PostgreSQL credential útvonal került használatra. Titkos érték nem került naplóba vagy dokumentációba.

Migráció:

`supabase/migrations/20260815133000_drive_compare_findings_v200.sql`

SHA-256:

`1ffe37b0b71e52a90225c19fa680294d80d033f3b256153d22ad486799487b6c`

A migration gate előtt a V2 táblák hiányoztak, miközben az összes kötelező Project Core / Drive Core előfeltétel létezett. A migráció `ON_ERROR_STOP` módban, tranzakciósan futott és `COMMIT`-tal zárult.

Schema health után:

- schema version: `2.0.0`
- migration count: `1`
- bootstrap ID: `drive-compare-findings-v200-20260815`
- `drive_core_compare_findings`: aktív
- create/update/delete atomic RPC-k: aktívak
- service-role CRUD: engedélyezett
- authenticated közvetlen SELECT: tiltott
- `compare_finding` audit/change-feed entity type: engedélyezett

## 4. Backup és rollback

Pre-migration / pre-cutover artifact:

`/srv/dimpro-dev/artifacts/drive-compare-findings-v200-pre-20260815T150805+0200`

Teljes Supabase DEV DB dump: `supabase-dev-pre-v200.dump`

DB dump SHA-256:

`65de1acfeabf6d842c444bb4e4690a987e632f6e76e1033fc559e8a15083eb85`

Git source bundle SHA-256:

`9bf23cbb422a03c415b21c797f5c8b1e345bd9a79a2c8c519c607505935b9ecd`

A dump `pg_restore -l` ellenőrzést, a source bundle `git bundle verify` ellenőrzést kapott.

Az aktiválás előtti runtime build továbbra is megvan az alap `.next` könyvtárban:

`5iwMCf_Q5ecibQLwSK1ls`

A V2 release pointer: `.dimprover/active-next-release`  
Aktív érték: `.next-drive-compare-findings-v200`

Rollback esetén az aktiválás előtti pointer állapot `ABSENT` volt. Visszaállítási logika:

1. `active-next-release` eltávolítása;
2. `dimpro-benjadmin-operator-ui-v2-dev` kontrollált restart;
3. health + `/drive` acceptance.

## 5. Build és statikus kapuk

Végleges, aktív operator worktree-ben készült V2 release:

`.next-drive-compare-findings-v200`

Build ID:

`znPHH1zVZ-k4bKwzPXZ6s`

Ellenőrzések:

- TypeScript: PASS
- ESLint: PASS, 0 error; meglévő projekt warningok nem blokkolók
- `git diff --check`: PASS
- production Turbopack build: PASS
- standalone assets: PASS
- 245 statikus chunk ellenőrizve
- Compare Findings V2 contract: `30/30 PASS`
- teljes Drive/Compare contract: `206/206 PASS`
- BENJADMIN P10.2 regresszió contract: `50/50 PASS`

A build során a már ismert Next/Turbopack NFT warning megjelent a `next.config.ts` / infrastructure-summary trace környezetében, de buildhibát nem okozott.

## 6. Valós DEV E2E

QA projekt: `project-drive-compare-rc1-qa`  
QA felhasználó: `qa-drive-rc1` – aktív OWNER

Tesztelt A/B verziópár:

- dokumentum: `drive-document-14d4c844f0ac`
- A / Rev.01: `drive-version-f136d665ded7`
- B / Rev.02: `drive-version-b869ad66ab4d`

E2E finding:

`drive-finding-v200-e2e-20260815153324`

Eredmény:

- health: HTTP 200, schema `2.0.0`
- kezdeti lista: HTTP 200
- create: HTTP 201, version 1
- reload: HTTP 200, finding visszatöltve
- update: HTTP 200, version 2, `FIX_REQUIRED`, `HIGH`
- stale concurrent update: HTTP 409, `DRIVE_COMPARE_FINDING_VERSION_CONFLICT`
- soft delete: HTTP 200, version 3
- post-delete list: finding már nem jelenik meg
- DB-ben soft-deleted rekord megmaradt
- Project Core audit: create/update/delete mind 1 db
- Drive change feed: create/update/delete mind 1 db

Ez igazolja a tartós perzisztenciát, az optimista concurrency-védelmet, a soft delete-et és az auditálhatóságot.

## 7. Candidate és cutover

Első candidate:

- port `3210`
- külön integrációs worktree
- V2 API/E2E: PASS

A build artifact egyszerű cross-worktree másolása két alkalommal fail-closed módon visszagördült, mert a runtime identity guard helyesen elutasította a másik worktree `.dimprover` symlinkjét. A 3100-as szolgáltatás mindkét esetben visszaállt a korábbi stabil buildre.

A végleges megoldás az aktív operator worktree-ben, `NEXT_DIST_DIR=.next-drive-compare-findings-v200` célra készített release lett.

Exact active-worktree candidate:

- port `3220`
- build `znPHH1zVZ-k4bKwzPXZ6s`
- PM2 restart: 0
- `.dimprover` symlink: helyes operator worktree cél
- `/drive`: 307 → `/login`
- auth nélküli Findings API: 401
- health: 200 / `2.0.0`
- findings list: 200

Ezután pointer-alapú cutover történt a 3100-as runtime-on. A V2 health 3 másodpercen belül PASS lett.

## 8. Post-cutover acceptance

Aktív release: `.next-drive-compare-findings-v200`  
Aktív build: `znPHH1zVZ-k4bKwzPXZ6s`

Post-cutover eredmények:

- PM2: online
- PM2 cwd: helyes operator worktree
- unstable restarts: 0
- port 3100: LISTEN
- lokális `/drive`: 307 → `/login`
- publikus `https://app.dev.dimpro.hu/drive`: 307 → `/login`
- publikus `/login`: HTTP 200
- auth nélküli Findings API: HTTP 401
- hitelesített health: HTTP 200 / schema `2.0.0`
- hitelesített findings list: HTTP 200
- Compare Findings V2 contract: `30/30 PASS`
- teljes Drive/Compare contract: `206/206 PASS`
- BENJADMIN P10.2 contract: `50/50 PASS`

A 3210 és 3220 ideiglenes candidate PM2 folyamatok a sikeres cutover után törölve lettek. Csak a 3100-as fő DEV runtime maradt aktív.

## 9. Biztonsági határok

Ebben a fejlesztési körben:

- PROD nem kapott kódot, migrációt, restartot vagy konfigurációmódosítást;
- SmartSync fejlesztés nem indult;
- Private Vault fejlesztés nem indult;
- közvetlen általános SQL executor nem készült;
- Supabase service-role kulcs és PostgreSQL jelszó nem került dokumentációba;
- a migráció kizárólag a már meglévő, kontrollált DEV PostgreSQL credential útvonalon futott.

## 10. Következő fejlesztési pont

A Compare Findings V2.0 DEV aktiválása és E2E lezárása kész.

A következő külön fejlesztési körben javasolt V2.1/V2.2 témák:

- finding → hibajegy konverzió;
- finding → jegyzőkönyvi pont;
- finding → DokuBOX / lebegő felvetés kapcsolat;
- státusztörténet és kommentfolyam;
- projektkalendárium határidő-kapcsolat;
- PDF/XLSX eltérési jegyzék riport;
- csoportos műveletek és szűrés;
- lezárt finding audit/visszakeresés.

SmartSync és Private Vault továbbra is külön fejlesztési kör marad.
