# DIMPRO Drop GyorsSend / Gyorskép v1.2.12 · DEV aktiválási checkpoint

Dátum: 2026-08-17
Környezet: DEV
Állapot: aktiválva
PROD: READ_ONLY / változatlan

## Aktivált működés

A GyorsSend / Gyorskép felület 6 lépéses, sticky stepper alapú workflow-ra állt át. A lépések mobilon is egyszerre láthatók, a korábbi lépésekhez adatvesztés nélkül vissza lehet lépni, és egyszerre egy egyszerű munkalépés jelenik meg. A haladó beállítások alapértelmezetten összecsukva maradnak.

A feltöltés normál kattintásos művelet. A véglegesítés slide-to-confirm vezérlőt használ 85%-os küszöbbel, billentyűzetes alternatívával. A korábbi hosszú nyomásos, 2 másodperces véglegesítési logika eltávolításra került.

A riportküldés külön választás:

- nincs riport;
- riport készítése;
- riport készítése és elküldése.

A feltöltés önmagában nem küld e-mailt. A worker `not_requested` állapotú csomagot nem véglegesít automatikusan; explicit véglegesítésnél a még folyamatban lévő vírusellenőrzés/feldolgozás `pending` retry állapotot kap.

A képkártyák gesztusai:

- balra húzás: törlés, piros háttér, Undo 6 másodpercig;
- jobbra húzás: feltöltésre kész, zöld háttér;
- függőleges scroll-védelem;
- desktopon látható alternatív műveletek.

Az opcionális eszközre mentés Web Share API-t használ, fallbackként letöltési útvonalat.

## DEV release

- közös source commit: `2993748ca098e19704085e0288a6e096c2834902`
- build: `kdYIPMc_9wAXSfHo3W1XN`
- release: `.next-drop-v1212-simple-stepper-2993748`
- rollback: `.next-benjadmin-v14-worker-activity-final`
- ugyanebben a release-ben aktív a BENJADMIN V1.5 parancs → Plus-pull → TESTING-gate fejlesztés is.

## Acceptance

A `scripts/drop-v1212-gyorssend-acceptance.cjs` eredménye: **31/31 PASS**.

További kapuk:

- TypeScript: PASS
- célzott ESLint: 0 error
- Drop DEV HTTP smoke: 200
- BENJADMIN DEV HTTP smoke: 200
- PM2 online, unstable 0

## Biztonsági és koordinációs megjegyzés

A Drop fejlesztés külön worktree-ben készült, majd a BENJADMIN V1.5 commitokra épülő végleges Drop branch fast-forwarddal került az operator worktree-be. A trusted code baseline az aktivált kódcommiton marad. A jelen dokumentáció docs-only commitként készül, ezért nem módosítja az aktív release forrásazonosságát.
