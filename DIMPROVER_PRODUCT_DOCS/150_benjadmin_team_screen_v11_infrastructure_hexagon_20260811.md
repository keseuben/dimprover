# BENJADMIN csapatképernyő v1.1 – nagy hexagon emblémák és infrastruktúra-összkép

Dátum: 2026-08-11

## Felhasználói vizuális módosítás

A BENJADMIN csapatképernyő csapattag-emblémái látványosabb méretre nőttek.

A korábban elkészített 96×64 px WebP hexagon képek változatlan forrásfájlként maradnak, de a képernyőn:

- Benjadmin: 126×84 px render;
- Ben-AI: 126×84 px render;
- Ármin-AI: 110×74 px render;
- Jázmin-AI: 110×74 px render;
- Outmin-AI: 110×74 px render.

A megjelenítés `object-fit: contain`, ezért a kész hexagon emblémák nem kapnak négyzetes cropot.

Kanonikus megjelenítési nevek:

- Benjadmin
- Ben-AI
- Ármin-AI
- Jázmin-AI
- Outmin-AI

## Bal infrastruktúra-sáv

A bal oldali oszlopsáv már nem csak a DEV VPS-t mutatja.

Külön blokk készült:

1. BENJADMIN DEV VPS
2. PRODUCTION / ÉLES VPS
3. DB VPS
4. DIMPRO Drive külső objektumtárhely
5. DIMPRO Drop külső objektumtárhely

### DEV VPS

Továbbra is élő helyi rendszeradat:

- memóriaterhelés;
- teljes / használt / szabad RAM;
- lemezfoglaltság;
- teljes / használt / szabad lemez;
- load average;
- PM2;
- Nginx;
- üzemidő.

### PRODUCTION / ÉLES VPS

PROD módosítás nem történt.

Az ellenőrzés két külön adatforrást használ:

- az HTTPS elérhetőség minden csapatképernyő-frissítéskor read-only módon élőben ellenőrzött;
- a RAM/lemez/load érték a Control oldalról read-only módon készített, időbélyeges erőforrásmintából érkezik.

A jelenlegi DEV snapshot készítésekor:

- RAM terhelés: 51,92%;
- lemezfoglaltság: 74%;
- rendszerlemez: kb. 77,7 GB;
- foglalt: kb. 54,4 GB.

A felület mindig kiírja a snapshot időpontját, ezért régi mérési minta nem jelenik meg „élő” adatként megtévesztően.

### DB VPS

A PostgreSQL 5432 port elérhetősége minden csapatképernyő-frissítéskor élő TCP próbával ellenőrzött.

A RAM/lemez/load adatok read-only vezérlőoldali snapshotból érkeznek.

A jelenlegi snapshot készítésekor:

- RAM terhelés: 12,10%;
- lemezfoglaltság: 4%;
- rendszerlemez: kb. 77,7 GB;
- foglalt: kb. 2,5 GB.

## Külső objektumtárhelyek

Új DEV-only read API:

`GET /api/dev/engine/infrastructure-summary`

Hitelesítés:

- BENJADMIN admin;
- read-only reporter a meglévő Development Center szabály szerint.

Az API nem ad vissza S3 access keyt, secretet vagy egyéb érzékeny konfigurációt.

A Drive és Drop S3 kapcsolat tényleges bucket-listázással ellenőrzött.

Megjelenített adatok:

- ONLINE / ellenőrizendő állapot;
- bucket neve;
- aktuális objektumfoglaltság;
- objektumszám;
- listázási truncation jelzés.

A Hetzner managed S3 tárhely mögötti fizikai szerver RAM-terhelését a szolgáltató S3 API-ja nem publikálja. Emiatt a BENJADMIN itt nem generál hamis memóriaadatot, hanem ezt írja ki:

`Nem publikus · managed S3`

A jelenlegi ellenőrzéskor mindkét külső tárhely ONLINE, a DEV bucketek jelenleg 0 objektumot tartalmaznak.

## Erőforrás-snapshot runtime fájl

A PROD és DB rendszererőforrás mintája nem kerül Gitbe és nem tartalmaz titkot.

DEV runtime hely:

`.dimprover/monitor/benjadmin-infrastructure-snapshot.json`

A fájl kizárólag biztonságos rendszertelemetriát tartalmaz:

- mintavételi időpont;
- hostname;
- RAM byte és százalék adatok;
- lemez byte és százalék adatok;
- 1 perces load average.

A jelenlegi snapshot a PROD gépen végzett read-only helyi rendszerlekérdezésből és a DB VPS read-only SSH lekérdezéséből készült, majd kizárólag a DEV runtime-ba került be.

## Következő infrastruktúra-lépés

A végleges B3.1 megoldásban ezt a snapshot-készítést a dedikált BENJADMIN Vezérlő VPS (Control VPS) veszi át.

Ott egy read-only collector időszakosan mintát vesz majd:

- PRODUCTION VPS;
- DEV VPS;
- DB VPS;
- objektumtárhelyek;
- később backup és egyéb infrastruktúra célokról.

Ekkor a jobb oldali CPU / memória / lemez vonaldiagram is folyamatos, valódi idősoros adatot kap. A jelenlegi fejlesztés nem telepített cron/service módosítást PROD-ra.

## Acceptance

A frissített csapatképernyő acceptance:

**25/25 PASS**

Többek között:

- infrastructure summary API: PASS;
- PRODUCTION + DB külön blokk: PASS;
- PRODUCTION + DB RAM/lemez snapshot: PASS;
- Drive + Drop külső tárhely: PASS;
- öt kanonikus csapatnév: PASS;
- öt kész hexagon embléma nagy méretben: PASS;
- bal oldali DEV / PROD / DB memória- és lemezmezők: PASS;
- jobb oldali vonaldiagramok: PASS;
- 1440×900 one-viewport: PASS;
- tablet overflow: PASS;
- mobil overflow: PASS;
- `D`: PASS;
- `Ctrl+Alt+0`: PASS;
- D-embléma dupla kattintás: PASS.

Regresszió:

- Operator UI: 30/30 PASS;
- B3.2 P5: 53/53 PASS;
- TypeScript: PASS;
- full lint: 0 hiba / 108 korábbi warning;
- build: PASS.

Aktív DEV build:

`0T3STS0J5a4Lb9YI6jn-W`

PROD változtatás: **nem történt**.
