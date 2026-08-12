# 182 — BENJADMIN Külső AI Worker V1.1 — automatikus technikai scope

Dátum: 2026-08-12/13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180, 181  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A felhasználónak továbbra sem kell fájlt, mappát, branchet, worktree-t vagy API route-ot kiválasztania. A BENJADMIN a terméknyelvű feladatból automatikusan javasolt technikai scope-ot állít elő.

A V1.1 jelen checkpointja **scope discovery + policy + secret guard + UI preview**. Külső AI provider és M.Forge futás továbbra sem indul.

## Scope Analyzer

Új modul:

`app/lib/dev-center/ai-worker/scope-analyzer.ts`

Működés:

1. feladatcím, cél és opcionális modul normalizálása;
2. modulhint és releváns keresőtoken képzése;
3. kizárólag Git által követett fájlok felderítése;
4. path-egyezések pontozása;
5. `git grep` alapú tartalmi egyezések;
6. a legerősebb source találatok közvetlen relatív importfüggőségeinek feltárása;
7. checksum, backup és generált melléktermékek kizárása;
8. maximum 24 releváns jelölt rangsorolása;
9. minden jelölt GREEN / YELLOW / RED besorolása;
10. csak GREEN scope kerülhet automatikusan a végrehajtható task scope-ba.

A rendszer nem használ `rg` binárist, mert a DEV hoston az nem garantált. A repository-felderítés a minden esetben rendelkezésre álló Git eszközt használja.

## Kockázati policy

### GREEN

Közvetlen modulkomponens, route, lokális teszt vagy dokumentáció, amely nem érint érzékeny core területet.

Döntés:

`AUTO_APPROVED`

### YELLOW

Példák:

- `app/lib/**` közös service/core;
- `components/ui/**` vagy shared UI;
- `supabase/**` adatbázisréteg;
- közös type/schema;
- projekt-szintű dependency/config;
- BENJADMIN Development Center API.

Döntés:

`NEEDS_REVIEW`

A task READY lehet scope review-ra, de a V1.1 preflight még nem automatikus.

### RED

Példák:

- `.env`;
- secret/credential/private-key terület;
- auth core;
- middleware/proxy core;
- infra/production/deploy/restart terület;
- `next.config.*`;
- veszélyes üzemeltetési script.

Döntés:

`DENIED`

Bármely releváns PIROS találat esetén:

- workflow marad `DRAFT`;
- engine status `blocked`;
- végrehajtható `task.scope = []`;
- külön BENJADMIN döntés nélkül nincs továbbhaladás.

Ez szándékosan fail-closed.

## Secret scanner

Új modul:

`app/lib/dev-center/ai-worker/secret-scanner.ts`

Path-védelem:

- `.env*`;
- secret / credential / private-key;
- `.pem`, `.p12`, `.pfx`;
- `id_rsa`, `id_ed25519`.

Tartalmi minták:

- private key blokk;
- generikus API key / password / token assignment;
- Bearer token.

Érzékeny path tartalmát a scope analyzer eleve nem olvassa. Ha normál fájlban érzékeny tartalomminta jelenik meg, az evidence jelzi, hogy context packba nem adható.

## Projektkapu valós próba

Tesztfeladat:

`A Projektkapuban a dokumentumverziók mellett lehessen megnyitni és összehasonlítani az előző verziót.`

Az analyzer releváns találatai között megjelent többek között:

- `app/api/projects/[projectId]/drive/documents/[documentId]/versions/route.ts`;
- `app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/review/route.ts`;
- Projektkapu route-ok;
- kapcsolódó Drive dokumentum API-k;
- kapcsolódó termékdokumentáció.

A Supabase bootstrap fájlok YELLOW besorolást kaptak, tehát nem kerülnek automatikusan írható scope-ba.

Eredmény:

- overall risk: YELLOW;
- review szükséges;
- RED: 0;
- automatikus preflight: false.

Ez megfelel a normatív elvnek: közös/adatmodell réteg BENJADMIN vizsgálatot igényel.

## Veszélyes scope próba

Tesztfeladat explicit auth/.env módosítást kért.

A `worker-auth.ts` PIROS / DENIED találat lett.

Eredmény:

- `scopeAnalysisState = BLOCKED_RED`;
- workflow `DRAFT`;
- engine `blocked`;
- végrehajtható scope: üres.

## API

Új endpoint:

`POST /api/dev/ai-worker/tasks/:id/analyze`

Csak admin mutációs jogosultsággal használható.

Az eredmény a meglévő `dev_center_tasks` rekordban tárolódik:

- `scopeAnalysisState`;
- `scopeAnalysis`;
- `scopeAnalyzedAt`;
- task `scope` kizárólag auto-approved GREEN pathokkal.

Audit esemény:

`AI_WORKER_SCOPE_ANALYZED`

## UI

A meglévő `AI Workerek` drawer bővült:

- `SCOPE ELEMZÉS` művelet;
- ELLENŐRZÉS blokkban aktuális risk és állapot;
- review/tiltott találatszám;
- valódi `Scope megtekintése` lenyitható lista;
- fájlonként GREEN / YELLOW / RED;
- AUTO_APPROVED / NEEDS_REVIEW / DENIED;
- rövid policy indok.

A felhasználónak továbbra sem kell technikai scope-ot beállítania.

## Acceptance

- pure scope/security contract: **10/10 PASS**;
- V1.1 API/runtime/browser acceptance: **16/16 PASS**;
- normál Projektkapu scope releváns verzió/Drive API-kat talált;
- Supabase nem auto-GREEN;
- checksum/backup kizárás PASS;
- approved scope kizárólag GREEN PASS;
- secret/auth RED blokk PASS;
- PIROS task scope üres fail-closed PASS;
- 1366 px drawer horizontal overflow: PASS;
- TypeScript: PASS;
- aktív DEV build: **`GnJ-OIhHp8V1iDU9wrzvR`**;
- PROD: nem módosult.

## Következő V1.1 checkpoint

A scope discovery után következik:

1. ScopeExpansionRequest read/write modell;
2. YELLOW döntési workflow;
3. preflight állapotmodell;
4. task rollback/checkpoint;
5. Worker Context Pack meta;
6. M.Forge külső worker identity és DEV-only policy;
7. izolált branch/worktree előkészítés;
8. meglévő B3 scope-lock újrahasznosítás.

Külső provider csak ezek után, külön V1.2 gate-ben kapcsolható be.
