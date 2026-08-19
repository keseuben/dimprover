# BENJADMIN Common Chat V2.3 – külső AI címzés és munkaidő

Dátum: 2026-08-20  
Környezet: DEV-only

## Funkció

A Közös Fejlesztői Csevegés composer két címzettcsoportot kezel:

- BELSŐ: BenAI, ÁrminAI, JázminAI, OutminAI.
- KÜLSŐ: M.Forge-AI, V.Guard-AI.

BenjAdmin a DIMPRO / DIMPROVER / BENJADMIN rendszergazdája, fejlesztési vezetője, rendszertulajdonosa és végső emberi döntéshozója. A kézi ChatGPT bridge prompt ezt rögzíti.

M.Forge-AI projekt nélküli chatüzenetet fogadhat. Projekt + bekapcsolt külső fejlesztési task esetén a meglévő Külső AI Worker workflow hoz létre DRAFT taskot. A scope, preflight, Safe Context Pack, provider prompt, izolált DEV JIT worktree és patch validation kapuk megmaradnak.

V.Guard-AI review-only / no-write. A composer nem enged számára új kódolási taskot, a backend pedig fail-closed 409 szabállyal védi. Független review meglévő M.Forge eredményre az AI Workerek workflow-n indul.

## Provider állapot

A külső provider adapterek és M.Forge/V.Guard workflow-k készek, de a DEV-en az élő modellfuttatás jelenleg nincs aktiválva. Ehhez külön provider secret, modell, HUF token-díjszabás és execution gate szükséges.

## Munkafelvétel és visszaadás

ChatGPT/MCP workernél a mérvadó munkafelvétel az első tényleges Plus/MCP pull (`plusBridgeFirstPulledAt`), nem a task előkészítése. Kézi bridge-nél csak a tényleges RUNNING idő számít.

A worker- és taskkártyák mutatják a `MUNKAFELVÉTEL`, `ELTELT`, `MUNKA VISSZAADVA` adatokat és a teljes munkaidőt. A legutóbbi completed/blocked visszaadás 36 órán át látható marad aktív task nélkül is.

A generált worker átadó prompt kötelezővé teszi a chatben:
`MUNKAFELVÉTEL: YYYY.MM.DD. HH:MM`
és lezáráskor:
`MUNKA VISSZAADVA: YYYY.MM.DD. HH:MM`,
továbbá az eltelt idő, taskállapot, fő eredmény és következő lépés közlését.

## Biztonság és ellenőrzés

DEV-only, PROD DENY, V.Guard no-write. Kötelező: V2.3 contract, Common Chat V2 contract, external-worker/V.Guard policy contract, `tsc`, lint, koordinált build és DEV smoke.
