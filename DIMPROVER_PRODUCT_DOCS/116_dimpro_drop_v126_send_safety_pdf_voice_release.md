# DIMPRO Drop 1.2.6 – biztonságos feltöltés, PDF/TXT javítás és hangos megjegyzés

Dátum: 2026-08-08  
Állapot: RELEASED – private pilot  
Éles URL: https://drop.dimpro.hu  
Éles release: `.next-v126-release-final`  
BUILD_ID: `RyRkEq_beVb7vBcg-l4NR`  
Közvetlen rollback: `.next-projectgate-shortcut-v0901-release-final`  
Fejlesztési Központ: `version_6b9c95bc-c3b`

## Fő javítások és UX-változások

- a fájlok feltöltése és a küldemény végleges kiküldése két külön művelet lett;
- sikeres feltöltés után a csomag nem finalizálódik automatikusan;
- a feltöltés és a végleges küldés zöld, 2 másodperces nyomva tartásos megerősítést kapott;
- külön „További feltöltés” blokk segíti az azonos vagy másik képcsoportba történő folytatást;
- lebegő képcsoport-kezelőből csoport váltható, létrehozható, átnevezhető és törölhető;
- csoport törlése nem törli a fájlokat, azok csoport nélkül maradnak;
- a letöltőoldalon a címzettek egymás alatt jelennek meg;
- a külön PDF- és TXT-letöltési endpointok bekerültek a Drop host engedélyezett útvonalai közé, ezért a korábbi 404 hiba megszűnt;
- az e-mailben legfeljebb 20 képfájl kap beágyazott előnézetet;
- a „Fájlok megnyitása” CTA az e-mail tetején és alján is megjelenik;
- az e-mailes címzettek soronként jelennek meg;
- az e-mailes kép megnyitása külön böngésző-megnyitást kér (`target=_blank`), de a tényleges ablak/tab viselkedést a levelező és a böngésző szabályozza.

## PDF és ZIP

A csomagriport négy választható elrendezést támogat:

- 1 kép / oldal – részletes;
- 2 kép / oldal – kompakt;
- 4 kép / oldal – áttekintő;
- 6 kép / oldal – gyors áttekintő.

A többképes elrendezések fekvő A4 oldalt használnak. A PDF-be a rendszer külön riportcélú, méretoptimalizált képet ágyaz be az eredeti többmegabájtos fotó helyett.

32 képes benchmark eredmény:

- 1 kép/oldal: 9,46 MiB;
- 2 kép/oldal: 5,09 MiB;
- 4 kép/oldal: 2,99 MiB;
- 6 kép/oldal: 2,16 MiB.

A ZIP készítés előtt külön kiválasztható:

- kerüljön-e PDF a ZIP-be;
- kerüljön-e TXT a ZIP-be;
- PDF esetén melyik 1/2/4/6 képes elrendezés készüljön.

A TXT alapértelmezetten bekapcsolt, a PDF alapértelmezetten kikapcsolt.

## Gyors KépSend hangos megjegyzés

A Gyors KépSend könnyű, készülék-/böngésző-alapú beszéd→szöveg funkciót kapott:

- külön licencmodul: `DROP_QUICK_VOICE_NOTE`;
- képenként legfeljebb 60 másodperc;
- látható visszaszámláló;
- 15 és 5 másodpercnél figyelmeztető állapot;
- 0 másodpercnél automatikus leállás;
- az átirat az adott kép megjegyzéséhez fűzhető;
- a DIMPRO szerver nem tárol hangfájlt ebben a funkcióban;
- AI-s szövegrendezés és műszaki átfogalmazás nem része a Gyors KépSendnek.

A professzionális szerveres beszédfelismerés, AI szövegrendezés, műszaki megfogalmazás és képi annotáció a külön tervezett **DIMPRO Terepi Kontroll** modul feladata lesz.

## Offline működés

A meglévő Drop offline-biztos feltöltési sor továbbra is aktív:

- a kiválasztott fájl Blob formában IndexedDB-be kerülhet;
- a helyi sor nyers tokent, PIN-t vagy Send-kódot nem tárol;
- hálózatvesztéskor a multipart checkpointok megmaradnak;
- kapcsolat-visszatéréskor a feltöltés folytatható / automatikus folytatásra vár;
- az `online` és `offline` böngészőeseményeket a hálózatfigyelő kezeli.

Ez még nem teljes offline-first Send: teljesen offline állapotból új szerveres Send-munkamenet nem hozható létre. A Gyors KépSend 1.2.6 hangfunkciója nem tárol offline hangfájlt; az offline hangqueue és későbbi szerveres átírás a Terepi Kontroll / közös Speech Engine fejlesztési irány része.

## Validáció

- TypeScript: PASS;
- teljes ESLint: 0 error / 108 meglévő warning;
- DROP 1.2.6 contract: 24/24 PASS;
- e-mail + ZIP unit: 3/3 PASS;
- kamera/e-mail regresszió: 58 ellenőrzés PASS;
- private-pilot contract: 99/99 PASS;
- UX regresszió: 12/12 PASS;
- régi licenc-entitlement regresszió: 13 ellenőrzés PASS;
- voice entitlement live ellenőrzés: 5/5 PASS;
- candidate browser E2E: 29/29 PASS;
- teljes valós S3 → ClamAV → finalize → letöltőalbum → külön PDF/TXT → PDF+TXT ZIP E2E: 52/52 PASS;
- immutable release browser E2E: 29/29 PASS;
- production browser E2E: 29/29 PASS;
- production HTTPS `/`, `/send`, `/open`: 200;
- production `https://license.dimpro.hu/drive`: 200;
- production `https://projektkapu.dimpro.hu/`: 200;
- Identity Core: 12/12 READY;
- tesztfixture audit: 0 maradvány a lezárás előtt.

## Release és rollback

Az éles PM2 `NEXT_DIST_DIR` és a központi `.dimprover/active-next-release` egyaránt `.next-v126-release-final` értékre került.

Közvetlen rollback:

1. `.dimprover/active-next-release` → `.next-projectgate-shortcut-v0901-release-final`;
2. PM2 `NEXT_DIST_DIR` → `.next-projectgate-shortcut-v0901-release-final`;
3. koordinált `pm2 restart dimprover --update-env`.

Aktiválási backup helye a `.work_drop_v126_release_activation_backup` fájlban van rögzítve.

## Release besorolás

A DROP 1.2.6 továbbra is private-pilot kiadás. GA nem került megnyitásra.
