# DIMPRO Terepi GPS fotótérkép – DEV aktiválás

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** AKTÍV DEV RELEASE

## 1. Aktivált funkció

A Terepi Gyorsrögzítő Mentés lépésében a GPS-adattal rendelkező fotókból önálló **Terepi GPS fotótérkép** készül.

A jelenlegi release tartalma:

- GPS-fotópontok helyi síkkoordinátás megjelenítése;
- fotópont sorszám és fájlnév;
- GPS pontosság megjelenítése;
- rögzített hátlapi kamera irányának jelölése;
- fotók készítési sorrendjének szaggatott összekötése;
- a szaggatott kapcsolat nem tényleges bejárt útvonal;
- közös DIMPRO északi nyíl az Ingatlan felmérő modulból újrahasznosítva;
- A4 és A3 fekvő PDF export;
- projekt/dátum/jelmagyarázat/disclaimer a PDF-en;
- kalibrációs pont foundation minimum 3 ponttal.

A térkép tájékoztató helyszíni fotóazonosító eszköz. Telefonos GPS-adat alapján készül, ezért **nem geodéziai kitűzési vagy felmérési dokumentum**.

## 2. Aktivált runtime

- runtime source: `229c4f5d909a4ea586673559732f5792a958ad24`;
- operator branch: `feat/benjadmin-operator-ui-v2`;
- release: `.next-terep-gps-photo-map-release-229c4f5`;
- build ID: `JZWHdY79muoXk59R06jdM`;
- PM2 processz: `dimpro-benjadmin-operator-ui-v2-dev`;
- port: `127.0.0.1:3100`;
- standalone asset gate: 248 statikus chunk PASS.

## 3. Újrahasznosított közös komponens

Az északi nyíl nem párhuzamos új implementáció. A korábban az Ingatlan felmérőben használt jelölés közös komponenssé lett kiemelve:

- `components/viewers/SurveyNorthMark.tsx` – UI/SVG;
- `components/viewers/drawSurveyNorthMarkPdf.ts` – PDF rajzolás.

Az Ingatlan felmérő és a Terepi GPS fotótérkép ugyanazt a vizuális északi jel identitást használja.

## 4. GPS fotótérkép engine

Fő fájl:

- `app/lib/field-capture/gpsPhotoMap.ts`.

A tiszta, UI-tól független engine kezeli:

- WGS84 fotópontok helyi méterkoordinátás vetítését kis helyszíni kiterjedéshez;
- bounding box és viewport-fit számítást;
- pontsorrendet;
- camera heading adatot;
- accuracy és fájlnév/metaadat megőrzést.

## 5. PDF export

Fő fájl:

- `app/lib/field-capture/gpsPhotoMapPdf.ts`.

Támogatott MVP formátumok:

- A4 landscape;
- A3 landscape.

A PDF tartalmazza a fotópontokat, északi nyilat, kamera-iránynyilat, pontossági adatot, projektinformációt, dátumot, jelmagyarázatot és a GPS-pontossági figyelmeztetést.

## 6. Kalibrációs pont foundation

Fő fájlok:

- `app/lib/field-capture/gpsPhotoMapCalibration.ts`;
- `app/lib/field-capture/gpsPhotoMapCalibrationStore.ts`;
- `components/field-capture/GpsCalibrationPanel.tsx`.

Ponttípusok:

- Sarokpont;
- Kitűzési pont;
- Egyedi referencia.

A felhasználó `GPS koordináta rögzítése` gombbal rögzíthet pontot. A mintavétel 5–10 másodperces tartományban működik, jelenlegi alapértéke 8 másodperc. Több GPS-mintából pontossággal súlyozott koordinátaátlag készül; külön tárolódik a medián accuracy, mintaszám, mintavételi idő, timestamp és opcionális megjegyzés.

A tervillesztési readiness minimum 3 kalibrációs pontnál válik aktívvá.

## 7. Fontos határ

Ebben a release-ben **nincs még tényleges PDF/DXF tervillesztés**. A foundation csak a helyszíni referencia-/kalibrációs pontokat készíti elő.

A következő külön fejlesztési szakaszban tervezhető:

- 3 pontból eltolás + forgatás + méretarány transzformáció;
- 4+ pontnál best-fit illesztés;
- residual / átlagos illesztési hiba kijelzés;
- kézi tervpont-kijelölés PDF-en/DXF-en;
- valós koordinátás DXF esetén későbbi automatizáltabb illesztés.

## 8. Release gate eredmények

### Source / contract

- GPS geometry engine: `14/14 PASS`;
- GPS fotótérkép UI: `11/11 PASS`;
- GPS PDF contract: `12/12 PASS`;
- PDF A4/A3 E2E: `2/2 PASS`;
- GPS calibration engine: `17/17 PASS`;
- calibration UI: `12/12 PASS`;
- upload-rules proxy: `6/6 PASS`;
- client sync: `14/14 PASS`;
- staging: `14/14 PASS`;
- P8 Saját DIMPRO Drive: `14/14 PASS`;
- P7 server: `14/14 PASS`;
- Terep statikus acceptance: `66/66 PASS`;
- GyorsSend regresszió: `44/44 PASS`;
- célzott ESLint: PASS;
- `npx tsc --noEmit`: PASS;
- `git diff --check`: PASS.

### Candidate runtime

A feature candidate és az exact operator release candidate is zöld volt. Az exact operator candidate mobil browser release gate eredménye: `34/34 PASS`.

A 34 ellenőrzés része többek között:

- GPS ±8 m runtime adat;
- kamera Dél / 180°;
- Terepi GPS fotótérkép látható;
- közös északi nyíl látható;
- kalibrációs foundation látható;
- minimum 3 pontos szabály látható;
- A4/A3 PDF exportgomb látható;
- IndexedDB reload regressziómentes;
- pageerror 0;
- console error 0.

### Live 3100 runtime

A DEV cutover után ugyanaz a GPS mobil release gate `34/34 PASS`.

A teljes kliensszinkron browser E2E szintén PASS:

- server status: `SERVER_STORED`;
- asset storage: `STORED`;
- privát staging: true;
- raw capability persistence: false;
- page errors: 0;
- console errors: 0;
- cleanup: capture 0 / package 0.

## 9. Cutover és rollback

Pre-cutover rollback backup:

`/srv/dimpro-dev/backups/terep-gps-photo-map-cutover-20260819T034342+0200`

Git backup ref:

`backup/benjadmin-pre-terep-gps-photo-map-20260819T034342+0200`

A GPS feature branch a `da27974` trusted baseline közvetlen leszármazottja volt, ezért az operator és `integration/benjadmin-dev` handoff konfliktusmentes fast-forwarddal történt.

Az első cutover parancs shell vezérlőkarakter miatt a tényleges váltás előtt leállt; ellenőrzés igazolta, hogy a régi pointer/runtime változatlan maradt. A második, külön validált cutover script pointer + PM2 identity guarddal sikeresen lefutott.

## 10. Adatbázis

Ebben a GPS fotótérkép release-ben új adatbázis-migráció nem történt. A kalibrációs foundation jelenlegi adattárolása a feature saját kliensoldali rétegére épül.

## 11. Záró állapot

A **Terepi GPS fotótérkép A–E blokkja elkészült és aktív DEV release**. A tényleges PDF/DXF tervillesztés külön következő fejlesztési szakasz.

**PROD változatlan, nem történt PROD alkalmazásmódosítás.**
