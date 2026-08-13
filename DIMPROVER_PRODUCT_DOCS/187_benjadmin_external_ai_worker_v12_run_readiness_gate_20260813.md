# 187 — BENJADMIN Külső AI Worker V1.2 — M.Forge futási readiness gate

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–186  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A V1.2 provider executor előtt létrejött az egyetlen fail-closed döntési pont, amely megmondja, hogy az M.Forge külső AI worker ténylegesen indítható-e.

A readiness ellenőrzés **nem indít providert, sessiont, branchet vagy worktree-t**. Csak a már elkészült task/scope/preflight/context/budget/provider állapotot ellenőrzi.

## Új modul

`app/lib/dev-center/ai-worker/run-readiness.ts`

## Új API

`GET /api/dev/ai-worker/tasks/:id/run-readiness?role=MFORGE`

Az endpoint read-only admin jogosultsággal használható.

## Ellenőrzési lánc

A run readiness egyetlen aggregált döntésben ellenőrzi:

1. a task Külső AI Worker V1 task;
2. workflow `PREFLIGHT`;
3. preflight `PASS`;
4. Safe Context Pack létezik;
5. Context Pack path a BENJADMIN DEV context gyökér alatt van;
6. Context Pack fájl 0600;
7. Context Pack SHA-256 egyezik a task metaértékével;
8. `secretContentIncluded=false`;
9. repository és trusted baseline READY;
10. task/workspace repository ID konzisztens;
11. workspace baseline commit nem elavult;
12. Context Pack baseline commit nem elavult;
13. M.Forge worker `ready` és PROD DENY;
14. task/worker/napi/havi/idő/retry budget állapot;
15. provider/model konfiguráció;
16. provider execution global gate;
17. provider executor implementáció.

A readiness csak akkor `READY`, ha nincs blocker és valódi, nem-mock provider adapter választható.

## Context Pack integritás

A readiness újra ellenőrzi a Context Packot közvetlenül a fájlrendszerből.

Ha a DB-ben lévő SHA és a fájl SHA eltér:

- `context.valid = false`;
- readiness `BLOCKED`;
- provider nem indulhat.

Acceptance során a Context Pack SHA-t szándékosan hibás értékre módosítottuk, és a rendszer fail-closed blokkolt.

## Baseline staleness

A run readiness összehasonlítja:

- jelenlegi trusted baseline commit;
- preflight workspace baseline commit;
- Context Pack baseline commit.

Ha közben a BENJADMIN trusted baseline előrelépett, a régi előkészítés nem indulhat el csendben. Új preflight/context pack szükséges.

## Budget gate

A readiness a V1.2 usage ledgerből és budget policyból számol:

- task költség;
- M.Forge költség;
- napi összköltség;
- havi összköltség;
- aktív M.Forge idő;
- retry index.

75/90% állapot warningként jelenik meg. 100% vagy idő/retry hard stop blocker.

Konfigurálatlan napi/havi limit továbbra sem kap kitalált értéket.

## Provider gate

AUTO esetben a BENJADMIN csak ténylegesen READY külső providert fogadhat el.

A mock adapter nem tekinthető valódi futási providernek.

Ha nincs külső provider, külön blocker jelenik meg:

- nincs konfigurált provider + modell;
- global execution gate kikapcsolva;
- provider executor nincs implementálva.

A jelenlegi DEV állapot ezért helyesen:

`M.FORGE FUTÁSI KAPU = BLOCKED`

miközben:

- Context = OK;
- Budget = OK;
- Workspace terv = OK;
- Provider = nincs READY provider.

## Usage ledger bővítés

A meglévő `run-ledger.ts` új task-szintű összesítést kapott:

- task run count;
- task cost;
- input/output/total token;
- wall time;
- active time;
- max retry index;
- M.Forge / V.Guard worker bontás.

Nem jött létre új párhuzamos usage adattár.

## UI

A Context Pack elkészülte után új gomb:

`FUTÁSI ELLENŐRZÉS`

A task kártya új blokkja:

`M.FORGE FUTÁSI KAPU`

Megjelenik:

- READY / BLOCKED;
- Context állapot és fájlszám;
- Budget állapot;
- kiválasztott provider vagy `nincs READY provider`;
- legfeljebb 6 konkrét blocker.

A UI nem állítja, hogy M.Forge dolgozik, amíg tényleges provider futás nincs.

## Acceptance

Valós V1.2 fixture lánc:

`task -> analyze -> YELLOW exclude -> preflight -> Safe Context Pack -> run readiness`

Eredmény:

- API 200;
- readiness = BLOCKED;
- Context = valid;
- Budget = OK;
- provider = null;
- provider/gate/executor blocker mind megjelent;
- response titokmentes;
- workspace terv DEV M.Forge;
- aktív session/worktree nem jött létre;
- UI futási ellenőrzés működik;
- UI blocker lista valós;
- SHA tamper fail-closed;
- laptop horizontal overflow nincs.

Acceptance: **16/16 PASS**.

## Következő gate

A következő V1.2 lépés egy provider-run coordinator fail-closed API és lifecycle, amely:

- mindig lefuttatja a run readiness gate-et;
- BLOCKED esetben sem sessiont, sem worktree-t, sem API-hívást nem indít;
- READY esetben JIT módon nyitja a B3 sessiont/workspace-t;
- provider run ID-t rögzít;
- streameli a futási eseményeket;
- usage eventeket ír;
- budget hard stopnál cancel;
- végén worker output/diff artifactot rögzít;
- session/lock cleanupot garantál.

A tényleges OpenAI/Anthropic hálózati adapter csak provider kiválasztás és szerveroldali secret/model konfiguráció után implementálható.
