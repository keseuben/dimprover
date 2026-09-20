# BENJADMIN Developer Grid v0.1.60 – Task Inspector olvashatósági patch

Dátum: 2026-09-20  
Környezet: DEV ONLY · PROD DENY

## Cél

A fizikai v0.1.59 Windows E2E során az `Aktuális Task`, `Task Kontextus` és `Checkpoint` task-specifikus modálok 80%-os alkalmazászoom mellett túl kicsi és túl világos törzsszöveggel jelentek meg. A v0.1.60 kizárólag ezt az olvashatósági problémát javítja; új task/session/TASK_LAUNCH logikát nem vezet be.

## UI szabályok

- Task Inspector normál label: 11 px körüli minimum.
- Task Inspector értékmező: 11.5 px, emelt kontraszt és 600-as font-weight.
- Monospaced ID / branch / HEAD / hash érték: 10.5 px.
- Forrásutasítás / Context összefoglaló / Checkpoint report `pre`: 11 px, 1.62 line-height.
- Szekciócím: 12 px.
- Másodlagos szöveg és statebar: legalább 9.5–10 px.
- A világos téma külön sötétebb navy/szürkéskék kontrasztot kap.
- A változás az `Aktuális Task`, `Kontextus` és `Checkpoint` nézetre közös.

## Biztonsági és működési invariánsok

- PROD továbbra is DENY.
- A Task Inspector továbbra sem hoz létre új taskot vagy TASK_LAUNCH-ot.
- Conversation rebind, auth isolation és Windows Bridge logika nem változik.
- A v0.1.59 artifact immutable marad; a v0.1.60 új verzióként készül.
- Work first-party surface továbbra is fail-closed; tervezett külön aktiválási verzió: v0.1.61.

## Acceptance

Új Desktop acceptance ellenőrzés védi:
- 11 px label;
- 11.5 px value;
- 11 px / 1.62 monospaced hosszú szöveg;
- világos témában sötét `#143b50` értékszín.

A teljes Desktop regression check a patch után PASS.
