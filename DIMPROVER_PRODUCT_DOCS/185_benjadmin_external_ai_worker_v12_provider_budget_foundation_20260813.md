# 185 — BENJADMIN Külső AI Worker V1.2 — provider adapter és költségmérési alap

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–184

## Cél

A V1.1 scope/preflight/workspace réteg után a következő lépés a modellfüggetlen provider réteg és a mérhető futás alapjainak kialakítása.

Ez a checkpoint **nem indít külső AI API-hívást**. A cél, hogy a provider bekötése előtt már létezzen:

- közös Worker Model Adapter szerződés;
- provider readiness/probe;
- explicit végrehajtási főkapcsoló;
- költség/idő/retry policy;
- usage ledger read/write modell;
- titokmentes UI státusz.

## Worker Model Adapter registry

A korábbi egyetlen mock adapter providerfüggetlen registryvé bővült.

Adapterek:

- BENJADMIN Mock;
- OpenAI / Codex;
- Anthropic / Claude.

A worker szerepkör és a provider külön fogalom. M.Forge-AI és V.Guard-AI nem modellnév.

Minden adapter probe csak biztonságos státuszt ad vissza:

- configured;
- modelId vagy null;
- execution gate;
- execution implementation;
- ready;
- támogatott worker szerepkörök;
- emberileg olvasható detail.

Secret érték nem kerül a válaszba.

## Fail-closed provider kapu

Valódi külső provider csak akkor lehet később READY, ha együttesen teljesül:

1. szerveroldali secret létezik;
2. explicit modell van kijelölve;
3. `DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED=true`;
4. az adott provider tényleges executor implementációja kész.

A jelen checkpointban az OpenAI és Anthropic executor szándékosan `executionImplemented=false`, ezért külső futás akkor sem indulna, ha véletlenül secret kerülne a környezetbe.

Az `AUTO` provider választás **nem esik vissza mockra** valódi fejlesztési futásként. Ha nincs READY külső adapter, a feloldás null/fail-closed.

## Modell konfiguráció

A BENJADMIN nem hardcode-ol gyorsan változó provider-modellnevet.

A későbbi szerveroldali konfiguráció:

- `DIMPRO_EXTERNAL_AI_OPENAI_MODEL`
- `DIMPRO_EXTERNAL_AI_CLAUDE_MODEL`

Ha nincs modell kijelölve, az adapter nem configured/ready.

## Budget policy

Új modul:

`app/lib/dev-center/ai-worker/budget-policy.ts`

Mért korlátok:

- task költség;
- worker költség;
- napi költség;
- havi költség;
- aktív workeridő;
- retry count.

Threshold:

- 75% → `WARNING_75`;
- 90% → `WARNING_90`;
- 100% → `HARD_STOP`.

A task/worker/idő/retry alapkeretek a normatív V1 defaults értékeihez igazodnak.

Napi és havi keret csak explicit szerverkonfigurációból létezhet:

- `DIMPRO_EXTERNAL_AI_DAILY_BUDGET_HUF`
- `DIMPRO_EXTERNAL_AI_MONTHLY_BUDGET_HUF`

Ha nincs beállítva, a rendszer `null / nincs beállítva` állapotot mutat. Nem talál ki mesterséges Ft-limitet.

## Usage ledger

Új modul:

`app/lib/dev-center/ai-worker/run-ledger.ts`

A V1.2 első ledger verziója a meglévő `dev_center_live_worklog` append-only eseménytárat használja, új párhuzamos naplórendszer helyett.

Terminális usage rekord mezői:

- task ID;
- worker code;
- provider;
- model;
- run ID;
- input/output/total token;
- Ft-költség;
- wall time;
- active worker time;
- retry index;
- changed file count;
- teszt PASS/FAIL darab;
- review result;
- stop reason;
- finishedAt.

Forrásjelölés:

`source = external-ai-worker`

Record type:

`EXTERNAL_AI_RUN_USAGE`

A havi/napi read model ebből számolja a valós usage összesítést. A későbbi nagy volumenű üzemhez külön dedikált usage tábla opcionálisan bevezethető, de a V1.2 nem duplikálja szükségtelenül a már működő worklog infrastruktúrát.

## Konzol UI

Az `AI Workerek` drawer új blokkja:

`PROVIDER / KÖLTSÉG KAPU`

Mutatja:

- OpenAI / Codex adapter státusz;
- Anthropic / Claude adapter státusz;
- modell kijelölés állapota;
- külső futás READY/ZÁRVA;
- mai költség;
- havi költség;
- konfigurált napi/havi limit vagy `nincs beállítva`;
- run darabszám;
- token összesítés.

A jelen valós DEV állapotban külső futás zárva marad.

## Acceptance

- adapter/budget pure contract: **10/10 PASS**;
- usage ledger fixture acceptance: **4/4 PASS**;
- fixture usage rekord a teszt végén törlésre került;
- 75/90/100 policy PASS;
- AUTO mock fallback tiltás PASS;
- külső provider secret/model nélkül fail-closed PASS.

## Következő gate

A tényleges M.Forge provider executor előtt még szükséges:

1. provider kiválasztása;
2. szerveroldali secret biztonságos elhelyezése;
3. pontos provider/model konfiguráció;
4. provider API adapter implementálása hivatalos API contract alapján;
5. context pack safe content builder;
6. run lifecycle start/stream/cancel;
7. budget hard-stop bekötése a futás közbeni usage eseményekre;
8. output diff/artifact rögzítés;
9. fizikai workspace JIT indítás;
10. WORKER_DONE lezárás.

PROD továbbra is teljesen kizárt a külső worker futásból.
