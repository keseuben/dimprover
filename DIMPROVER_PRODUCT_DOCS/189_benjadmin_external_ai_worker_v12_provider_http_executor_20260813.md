# 189 — BENJADMIN Külső AI Worker V1.2 — OpenAI / Anthropic provider HTTP executor alap

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–188  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A provider registry és a fail-closed run coordinator után elkészült a valódi külső provider HTTP transport réteg szerveroldali implementációja.

Ez a checkpoint **nem kapcsolja be a külső AI futást**. Nincs valódi OpenAI vagy Anthropic hálózati futás, mert a DEV-ben nincs teljes provider-konfiguráció és a global execution gate nincs bekapcsolva.

## Új provider executor

Új modul:

`app/lib/dev-center/ai-worker/provider-executor.ts`

Támogatott transportok:

- OpenAI Responses API;
- Anthropic Messages API.

A transport szerveroldali. Provider secret nem kerül kliensoldalra, API read-modelbe vagy worklogba.

## OpenAI transport

A szerveroldali request contract:

- endpoint: `POST https://api.openai.com/v1/responses`;
- `Authorization: Bearer <server secret>`;
- body: model, input, max_output_tokens;
- `store = false` adatminimalizálási szabály;
- 300 másodperces timeout;
- redirect tiltott.

A response parser kezeli:

- response ID;
- model;
- szöveges output blokkok;
- input token;
- output token;
- total token;
- response státusz.

## Anthropic transport

A szerveroldali request contract:

- endpoint: `POST https://api.anthropic.com/v1/messages`;
- `x-api-key: <server secret>`;
- `anthropic-version: 2023-06-01`;
- content-type JSON;
- body: model, max_tokens, user message;
- 300 másodperces timeout;
- redirect tiltott.

A response parser kezeli:

- message ID;
- model;
- text content blokkok;
- input token;
- output token;
- stop reason.

## Explicit HUF árszabály

A BENJADMIN nem hardcode-ol providerárakat és nem talál ki aktuális díjakat.

A külső futás előtt explicit HUF / 1 000 000 token árszabás szükséges:

OpenAI:

- `DIMPRO_EXTERNAL_AI_OPENAI_INPUT_HUF_PER_MTOKEN`
- `DIMPRO_EXTERNAL_AI_OPENAI_OUTPUT_HUF_PER_MTOKEN`

Anthropic:

- `DIMPRO_EXTERNAL_AI_CLAUDE_INPUT_HUF_PER_MTOKEN`
- `DIMPRO_EXTERNAL_AI_CLAUDE_OUTPUT_HUF_PER_MTOKEN`

Ha a pricing nincs konfigurálva, a provider nem READY.

## Provider readiness szigorítás

A provider probe most külön jelzi:

- `secretConfigured`;
- `modelConfigured`;
- `pricingConfigured`;
- `executionGateEnabled`;
- `executionImplemented`;
- `ready`.

A provider csak akkor READY, ha egyszerre teljesül:

1. a transport implementált;
2. a szerveroldali secret megvan;
3. explicit model ID megvan;
4. explicit HUF token pricing megvan;
5. `DIMPRO_EXTERNAL_AI_PROVIDER_EXECUTION_ENABLED=true`.

A mock adapter továbbra sem választható valódi AUTO futás providerének.

## Biztonsági szabályok

- provider secret csak process envből olvasható;
- secret nem része a probe response-nak;
- provider HTTP hiba raw body-ja nem kerül vissza a felhasználónak;
- OpenAI requestnél `store=false`;
- redirect követés tiltott;
- globális execution gate OFF esetén a függvény hálózati hívás előtt leáll;
- pricing hiány esetén hálózati hívás előtt leáll;
- model/prompt hiány esetén hálózati hívás előtt leáll.

## UI

A `PROVIDER / KÖLTSÉG KAPU` panel most külön láthatóvá teszi:

- provider konfiguráltság;
- executor készültség;
- model ID vagy hiány;
- konkrét readiness detail.

A jelen DEV állapot továbbra is `KÜLSŐ FUTÁS ZÁRVA`.

## Contract acceptance

Provider HTTP executor pure contract:

- OpenAI endpoint/body/header contract PASS;
- Anthropic endpoint/body/header contract PASS;
- OpenAI output/usage parser PASS;
- Anthropic output/usage parser PASS;
- HUF token pricing számítás PASS;
- global gate OFF hálózat előtti fail-closed PASS.

Eredmény: **6/6 PASS**.

Adapter + budget contract:

- secret/model nélkül fail-closed;
- mock nem választódik AUTO valódi provider helyett;
- fake, teszt célú secret/model/pricing/gate állapotban OpenAI adapter READY;
- ugyanebben a mesterséges contract környezetben Anthropic adapter READY;
- AUTO valódi READY providert választ;
- 75/90/100 budget policy megmaradt.

Eredmény: **13/13 PASS**.

A tesztben használt értékek kizárólag lokális contract fixture értékek; nem kerültek a DEV runtime konfigurációjába.

## Következő gate

A következő lépés a safe provider prompt + output artifact réteg, majd a JIT workspace handoff integráció.

A tényleges provider hálózati futás csak explicit szerveroldali konfiguráció után aktiválható. Addig a run coordinator továbbra is BLOCKED és nem nyit M.Forge sessiont/worktree-t.
