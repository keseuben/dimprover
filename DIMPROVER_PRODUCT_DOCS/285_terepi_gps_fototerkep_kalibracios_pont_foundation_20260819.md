# DIMPRO Terepi GPS fotótérkép – kalibrációs pont foundation

Dátum: 2026-08-19
Környezet: DEV-only
Feature branch: `feature/jazmin-terep-gps-photo-map-20260819`
Kiinduló trusted baseline: `da27974`

## Blokk E – elkészült foundation

A tervillesztéshez szükséges helyszíni referencia-pontok rögzítésének alapja elkészült. A tényleges PDF/DXF geometriai illesztés még nincs bekapcsolva.

### Ponttípusok

- Sarokpont (`CORNER`)
- Kitűzési pont (`SETTING_OUT`)
- Egyedi referencia (`CUSTOM_REFERENCE`)

### GPS mintavétel

A „GPS koordináta rögzítése” művelet kizárólag közvetlen felhasználói gombnyomásra indul.

- `navigator.geolocation.watchPosition` alapú mintagyűjtés;
- engedélyezett időtartam: 5–10 másodperc;
- alapértelmezett terepi mérés: 8 másodperc;
- high accuracy kérés;
- folyamatos mintaszám és aktuális accuracy visszajelzés;
- befejezéskor a watch explicit leáll;
- koordinátaátlag pontossággal súlyozott;
- becsült pontosság a minták medián accuracy értéke;
- mentett metaadat: koordináta, accuracy, időpont, mintaszám, mintavételi idő, ponttípus, név, megjegyzés.

### Minimum három pont

A UI folyamatosan mutatja a `x/3` állapotot. Három rögzített referenciapont után az adatmodell „Alapkalibrációhoz elegendő” állapotot jelez. Ez nem azt jelenti, hogy a terv már georeferált vagy geodéziai pontosságú.

### Tárolás

Az MVP-ben a kalibrációs pontok a helyi Terepi munkamenethez kötött, session-nevesített localStorage rekordban maradnak:

`dimpro.fieldCapture.gpsCalibration.v1.<sessionId>`

Ez külön adat a fotók GPS metaadataitól. Nyers auth-, Send- vagy upload capability nincs benne.

### Tudatos korlátozás

Ebben a blokkban nincs:

- automatikus PDF georeferálás;
- DXF koordinátarendszer felismerés;
- transzformációs mátrix számítás;
- 3 pontos eltolás/forgatás/méretarány alkalmazás;
- 4+ pontos best-fit vagy residual hibaszámítás.

Ezek csak a következő tervillesztési blokkban indulhatnak, a mostani stabil referencia-adatmodellre építve.

## Fő fájlok

- `app/lib/field-capture/gpsPhotoMapCalibration.ts`
- `app/lib/field-capture/gpsPhotoMapCalibrationStore.ts`
- `components/field-capture/GpsCalibrationPanel.tsx`
- `components/field-capture/GpsPhotoMapPanel.tsx`
- `components/field-capture/FieldCaptureShell.tsx`
- `scripts/field-capture-gps-calibration-contract.ts`
- `scripts/field-capture-gps-calibration-ui-contract.mjs`

## Acceptance

- GPS kalibrációs számítási contract: 17/17 PASS
- GPS kalibrációs UI contract: 12/12 PASS
- GPS fotótérkép engine: 14/14 PASS
- GPS fotótérkép UI: 11/11 PASS
- GPS PDF contract: 12/12 PASS
- GPS PDF generálási E2E: 2/2 PASS
- upload-rules proxy: 6/6 PASS
- client sync: 14/14 PASS
- staging: 14/14 PASS
- P8 user Drive: 14/14 PASS
- P7 server capture: 14/14 PASS
- Terep regresszió: 66/66 PASS
- GyorsSend regresszió: 44/44 PASS
- TypeScript: PASS
- célzott ESLint: PASS
- git diff-check: PASS

## Következő lépés

A D+E mérföldkő után teljes candidate build + külön-portos DEV acceptance következik. Tényleges PDF/DXF tervillesztés csak ezután fejleszthető.

PROD változatlan, nem történt PROD alkalmazásmódosítás.
