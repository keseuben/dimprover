# 186 — BENJADMIN Külső AI Worker V1.2 — Safe Context Pack

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–185  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A providerfüggetlen V1.2 réteg következő eleme a külső modellnek később átadható, biztonságosan szűrt fejlesztési kontextus előállítása.

A jelen checkpoint **nem küld adatot külső AI szolgáltatónak**. A Safe Context Pack kizárólag a DEV szerveren készül és ott marad.

## Forrás

A Context Pack kizárólag sikeres Külső AI Worker V1.1 preflight után készíthető.

Forrása:

- a task végrehajtható `GREEN / AUTO_APPROVED` path scope-ja;
- a preflight által rögzített trusted baseline commit;
- a `repo_dimprover` bare DEV repository.

A tartalom nem az aktuálisan módosuló munkakönyvtárból kerül be, hanem pontosan a preflight baseline commitból. Ez biztosítja az auditálható, reprodukálható bemenetet.

## Biztonsági szűrés

Új modul:

`app/lib/dev-center/ai-worker/context-pack.ts`

Minden scope fájlra kötelező:

1. csak path scope;
2. érzékeny path kizárás;
3. baseline Git objektumból olvasás;
4. maximum 128 KiB / fájl;
5. maximum 768 KiB / teljes pack;
6. secret content scanner;
7. secret találat esetén fájl kizárás;
8. tartalom SHA-256;
9. teljes pack SHA-256.

Érzékeny path példák:

- `.env*`;
- secret / credential / private key;
- PEM/P12/PFX;
- SSH private key minták.

Tartalmi scanner többek között private key, API key/password/token assignment és Bearer token mintákat blokkol.

## Persistálás

A teljes Context Pack kizárólag szerveroldali, korlátozott DEV könyvtárban tárolódik:

`/srv/dimpro-dev/data/benjadmin-ai-worker-context/<taskId>/`

Jogosultság:

- könyvtár: 0700;
- pack fájl: 0600.

A task adatbázis-rekord **nem tartalmaz fájltartalmat**. Csak összefoglaló meta kerül a `contextPackContent` mezőbe:

- pack ID;
- belső szerver path;
- SHA-256;
- version;
- generatedAt;
- baselineCommit;
- fileCount;
- totalBytes;
- excludedCount;
- `secretContentIncluded=false`.

## Pack tartalma

V1.2 formátum:

`1.2-safe`

Felső szintű mezők:

- taskId;
- projectId;
- title;
- goal;
- generatedAt;
- baselineCommit;
- scopeAnalysisState;
- secretContentIncluded;
- totalBytes;
- fileCount;
- excludedCount;
- files;
- excluded.

Minden átadott fájl:

- path;
- baseline tartalom;
- SHA-256;
- byte méret.

Minden kizárt fájlhoz kizárási ok tartozik.

## API

Új endpoint:

`POST /api/dev/ai-worker/tasks/:id/context-pack`

Csak BENJADMIN admin mutációs jogosultsággal hívható.

Előfeltétel:

- `workflowState = PREFLIGHT`;
- `preflight.state = PASS`;
- érvényes trusted baseline;
- legalább egy GREEN path scope.

## Audit

Új audit esemény:

`AI_WORKER_CONTEXT_PACK_READY`

Az audit csak metaadatot és SHA-t tartalmaz, fájltartalmat nem.

## UI

Az `AI Workerek` drawer PREFLIGHT állapotában új:

`CONTEXT PACK`

művelet jelenik meg.

Siker után:

`CONTEXT <N> · WORKSPACE TERV KÉSZ`

A felhasználónak továbbra sem kell fájlt kiválasztania vagy technikai kontextust összeállítania.

## Valós acceptance

Projektkapu dokumentumverzió összehasonlítás fixture:

- scope analysis → PASS;
- YELLOW elemek biztonságosan kizárva;
- preflight → PASS;
- Safe Context Pack → PASS;
- 15 GREEN fájl került a packba;
- 25 773 byte összméret;
- secret tartalom: false;
- pack file mode: 0600;
- SHA-256: ellenőrzött;
- minden pack fájl a task GREEN scope-jában volt;
- minden fájl tartalmi SHA-ja ellenőrzött;
- adatbázis csak summary metát tartalmazott;
- audit esemény létrejött;
- UI `CONTEXT 15 · WORKSPACE TERV KÉSZ` állapotot mutatott;
- browser horizontal overflow: nincs;
- fixture task/checkpoint/context pack a teszt végén törlésre került.

Acceptance: **19/19 PASS**.

## Következő gate

A V1.2 következő biztonságos lépése egy `run readiness` aggregátor, amely a tényleges provider hívás előtt egyetlen fail-closed döntésben ellenőrzi:

1. workflow = PREFLIGHT;
2. Safe Context Pack létezik és SHA-valid;
3. task/worker/idő/retry budget nincs hard stopban;
4. provider adapter configured;
5. provider modell explicit;
6. provider executor implementált;
7. provider execution global gate engedélyezett;
8. M.Forge worker READY;
9. workspace plan érvényes;
10. PROD továbbra is DENY.

A jelen DEV állapotban a tényleges provider futásnak továbbra is BLOCKED eredményt kell adnia, mert külső provider secret/model/executor/gate nincs aktiválva.
