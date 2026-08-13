# 195 — BENJADMIN Fejlesztői Konzol + működési nézet UX V1.4

Dátum: 2026-08-13  
Környezet: DEV

## Változások

- A közös BENJADMIN személyprofil-kártya `Esc` billentyűvel bezárható, ezért minden olyan adminfelület, amely ezt a közös profilt használja, automatikusan megkapja az ESC-zárást.
- A működési és infrastruktúra nézet AI-finanszírozási popovere `Esc` billentyűvel bezárható.
- A Fejlesztői Konzol drawer rétegei (Parancstár, Fejlesztési Tár, AI Workerek, Csapat, Telepítés) `Esc` billentyűvel bezárhatók.
- Az Alapítói fókusz üzenettár drawer `Esc` billentyűvel bezárható.
- A működési és infrastruktúra nézet három külön témát kapott: `Világos`, `Sötét`, `Sunlight`. A választás helyben megmarad.
- A világos nézet teljes világos vászon lett; megszűnt a korábbi sötét háttér + szürkés középkártyák hibrid megjelenése.
- A Sunlight külön, nagy környezeti fényre optimalizált meleg világos megjelenés.
- A Fejlesztői Konzol `Ctrl+Alt+1` gyorsbillentyűvel megnyitható. A megnyitott, névvel azonosított popup a rendelkezésre álló képernyőméretet kéri és maximális használható méretre méretezi magát.
- Ugyanez a gyorsbillentyű a konzolablakban a popupot háttérbe küldi és a nyitó BENJADMIN ablakra adja vissza a fókuszt. Böngészőből natív Windows `minimize()` API nincs; ezért ez a biztonságosan támogatott böngészős „tálcára/háttérbe” viselkedés.
- A Fejlesztői Konzol avatar artwork képei körül megszűnt a második, CSS-sel rajzolt elforgatott hexagon keret. Az eredeti hexagon artwork önmagában jelenik meg; az állapotot kis státuszpont jelzi.
- Az alsó BenjAdmin composer-identitás önálló kártya lett. Desktopon az avatár 140×140 px, az előző 70×70 px méret kétszerese. A nagyobb composer függőlegesen a feladat/munkatér területéből vesz el helyet.

## Biztonság / viselkedés

- PROD változtatás nem történt.
- A Ctrl+Alt+1 nem ad új jogosultságot; a meglévő BENJADMIN admin session ellenőrzése marad.
- Popup blokkolás esetén a meglévő router fallback továbbra is működik.

## Acceptance

- Új UX browser acceptance: **14/14 PASS**.
- TypeScript: PASS.
- full lint: **0 error / 104 meglévő warning**.
- DEV build: `xGu_0K-tifv6j3ZBdDQZK`.
