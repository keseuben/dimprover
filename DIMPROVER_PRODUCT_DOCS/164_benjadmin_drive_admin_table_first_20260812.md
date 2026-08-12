# BENJADMIN táblázat-első DIMPRO Drive admin diagnosztika

Dátum: 2026-08-12
Környezet: DEV
Állapot: checkpoint

## Cél

A korábbi hosszú, kártyás DIMPRO Drive fejlesztői adminoldal átalakítása táblázat-első upload session munkatérré úgy, hogy a token-, cleanup-, Object Storage-, env-, provider- és signed upload diagnosztikai funkciók megmaradjanak.

## Főfelület

Az `/admin/drive` a közös `BenjadminDataWorkspace` komponenst használja.

A fő session tábla oszlopai:

- Session;
- Fájl / útvonal;
- Projekt;
- Státusz;
- Chunk;
- Fogadott / fájlméret;
- Készültség;
- Életkor;
- Frissítés;
- Művelet.

A munkatér keresést, négy session státuszszűrőt, projektmezőt, cleanup életkor mezőt és 25 / 50 / 100 soros lapozást kapott.

KPI-k:

- session összesen;
- aktív session;
- completed session;
- cleanup jelölt;
- fogadott adatmennyiség.

## Session részletező

A session részletei külön jobb oldali panelen nyílnak. Itt látható:

- projekt;
- chunk szám;
- fogadott és teljes fájlméret;
- készültség;
- session életkor;
- létrehozási és frissítési idő;
- ideiglenes upload útvonal;
- cleanup jelöltség.

A session törlése csak itt, külön veszélyes műveletként érhető el, megerősítéssel.

## Drive diagnosztika

Külön `Drive diagnosztika` panelben maradt:

- fejlesztői token lekérés és maszkolt megjelenítés;
- teljes token kézi másolása;
- cleanup terv;
- Object Storage terv és providerlista;
- storage env ellenőrzés;
- storage provider konfiguráció;
- signed upload előkészítő szerződés;
- kézi session törlés.

A token alapértelmezetten nem töltődik be és nem jelenik meg. Az acceptance nem olvasta ki a valódi token értékét; a token-megjelenítési logika csak böngészős fixture-rel tesztelhető.

## Élő DEV állapot

A fejlesztéskor a DEV adatforrás:

- DIMPRO_DEMO upload session: 0;
- cleanup jelölt: 0;
- Object Storage provider: 3;
- S3 ready: igen;
- storage mód: quarantine;
- kiválasztott provider: s3-compatible.

## Acceptance

`scripts/benjadmin-drive-admin-table-first-acceptance.mjs`

Eredmény: 20/20 PASS.

Az acceptance valós read-only API-hívások mellett böngészős fixture-rel ellenőrzi az aktív/completed session státuszokat, 50%/100% készültséget, cleanup jelölést és a session részletezőt. Törlési végpontot nem hív.

Regressziók:

- Release feltöltő: 20/20 PASS;
- Szerver- és tárhelyállapot: 21/21 PASS;
- Vezérlés / Partner V3: 21/21 PASS; az első futáskor a partner runtime átmenetileg PENDING volt, ismételt read-only ellenőrzésen READY és 21/21 PASS;
- TypeScript: PASS;
- lint: 0 hiba;
- diff-check: PASS.

## Következő fejlesztési pont

Az E-mail beállítások oldalon a beállítási űrlapokat meg kell tartani, de a feladóprofilok és a tesztnapló nagyobb adatmennyiségnél táblázat-első kezelést igényel. Következő körben ez a hibrid modell építendő meg.
