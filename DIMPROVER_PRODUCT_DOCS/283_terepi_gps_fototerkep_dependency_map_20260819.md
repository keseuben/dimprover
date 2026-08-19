# DIMPRO Terepi GPS fotótérkép – dependency map

Dátum: 2026-08-19
Baseline: `da27974`
Branch: `feature/jazmin-terep-gps-photo-map-20260819`

## Cél

A Terepi GPS fotótérkép külön Terep feature. A lezárt kliensszinkron release-t nem módosítja visszamenőleg. Telefonos GPS alapján tájékoztató fotóazonosító térképet készít; nem geodéziai kitűzési vagy felmérési dokumentum.

## Meglévő, újrahasznosítandó motorok

### 1. Északi nyíl – Ingatlan felmérő

- Képernyős SVG implementáció: `components/viewers/SurveyFloorPlanEngine.tsx`
- Azonosító: `data-survey-north-mark`, `data-survey-north-pointer`, `data-survey-north-mini-arrow`
- Beállítás: `northAngle`
- PDF implementáció: `components/property-survey/propertySurveyBuildingPdf.ts`
- PDF függvény: `drawNorthMark()`

Szabály: a Terepi GPS fotótérkép nem készít új, eltérő északi nyíl dizájnt. A meglévő geometria/vizuális szabály kerül közösíthető helperbe vagy ugyanazon shared render contractra.

### 2. Terep GPS és kamera tájolás

- Típusok: `app/lib/field-capture/types.ts`
- Szenzormotor: `app/lib/field-capture/captureSensors.ts`
- Lokáció: `FieldCaptureLocationRecord`
  - `latitude`
  - `longitude`
  - `accuracyMeters`
  - `capturedAt`
  - `source`
  - `status`
- Kamera irány: `FieldCaptureOrientationRecord`
  - `headingDegrees`
  - `headingAccuracyDegrees`
  - `directionLabel`
  - `capturedAt`
  - `source`
  - `status`
- Offline megőrzés: `app/lib/field-capture/offlineQueue.ts`
- Szerveres szinkron: `app/lib/field-capture/clientSyncService.ts`
- Szerver mapping: `app/lib/field-capture/serverService.ts`, `serverRepository.ts`

A fotótérkép a már eltárolt képi GPS/orientation rekordokat fogyasztja. Nem kér új szenzorengedélyt pusztán a térkép megnyitásakor.

### 3. PDF export

Elsődleges újrahasznosítási irány:
- `pdf-lib` már projektfüggőség.
- Ingatlan felmérő PDF: `components/property-survey/propertySurveyBuildingPdf.ts`
- A4/A3 exportkeret és lapméret-logika további referencia: `components/viewers/PdfPlanViewer.tsx`, `components/viewers/PlanMarkerTypes.ts`.

MVP lapok: A4 és A3, álló/fekvő. Kötelező: cím, projekt, dátum, északi nyíl, jelmagyarázat, GPS pontosság, disclaimer.

### 4. PDF/DXF tervillesztés – későbbi szakasz

- PDF viewer/marker alap: `components/viewers/PdfPlanViewer.tsx`, `pdfDocumentEngine.ts`, `PlanViewerShell.tsx`.
- DXF/vektoros tervillesztés nem része az első MVP-nek.
- Minimum 3 kalibrációs ponttal indul később.

## Adatáramlás MVP

`FieldCaptureItem` → érvényes GPS pontok szűrése → helyi síkkoordináta-vetítés → bounding box/padding → fotópont render → készítési sorrend szaggatott kapcsolat → kamera-heading nyíl → északi nyíl → PDF export.

## Pontossági szabályok

- `READY` és `LOW_ACCURACY` GPS rekord megjeleníthető.
- A pontosságot méterben mindig meg kell őrizni és megjeleníteni.
- A készítési sorrend vonala nem bejárt útvonal.
- A térkép nem geodéziai dokumentum.
- Nagyobb területre vagy geodéziai célra a helyi síkvetítés nem használható mérési bizonyítékként.

## Kalibrációs foundation adatmodell

Ponttípusok:
- `CORNER` – Sarokpont
- `SETTING_OUT` – Kitűzési pont
- `CUSTOM_REFERENCE` – Egyedi referencia

Tervezett rekord:
- id, label, type
- latitude, longitude
- accuracyMeters
- capturedAt
- sampleCount
- samplingDurationMs
- note
- később planX/planY vagy viewer anchor

Minimum 3 pont; 4+ pontnál best-fit és residual/illesztési hiba számítás.

## Következő implementációs blokk

Tiszta, UI-független `gpsPhotoMap` engine:
1. WGS84 → helyi ENU-szerű méter koordináta kis helyszínre.
2. Érvényes fotópontok és készítési sorrend.
3. Bounding box és render-normalizálás.
4. Heading normalizálás.
5. Kalibrációs típusok előkészítése.
6. Célzott numerikus acceptance tesztek.
