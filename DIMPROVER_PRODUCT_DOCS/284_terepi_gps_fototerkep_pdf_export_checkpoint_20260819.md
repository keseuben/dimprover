# DIMPRO Terepi GPS fotótérkép – PDF export checkpoint

Dátum: 2026-08-19
Környezet: DEV-only
Feature branch: `feature/jazmin-terep-gps-photo-map-20260819`
Kiinduló trusted baseline: `da27974`

## Blokk D – PDF export MVP

Elkészült az önálló Terepi GPS fotótérkép A4/A3 PDF exportja.

Fő működés:
- hivatalos cím: `DIMPRO – Terepi GPS fotótérkép`;
- A4 és A3 papírméret;
- MVP-ben fekvő tájolás az olvashatóbb térképi megjelenítéshez;
- projekt neve és generálási dátum a címblokkban;
- GPS-fotópontok sorszámmal és fájlnévvel;
- GPS accuracy érték pontonként;
- kamerairány narancs iránynyíllal, ha rendelkezésre áll;
- a fotók készítési sorrendje szaggatott vonallal;
- jelmagyarázat és kötelező pontossági disclaimer;
- a szaggatott vonal nem tényleges bejárt útvonal;
- a dokumentum nem geodéziai kitűzési vagy felmérési dokumentum.

## Közös északi nyíl

A Terepi GPS fotótérkép PDF-exportja nem saját, párhuzamos északjel-motort használ. Az Ingatlan felmérő meglévő PDF északjel-renderere közös komponenssé lett kiemelve:

- `components/viewers/drawSurveyNorthMarkPdf.ts`

Ezt használja:
- `components/property-survey/propertySurveyBuildingPdf.ts`
- `app/lib/field-capture/gpsPhotoMapPdf.ts`

A képernyős Terepi GPS fotótérkép továbbra is a közös `SurveyNorthMark` SVG-komponenst használja.

## Fő módosított fájlok

- `app/lib/field-capture/gpsPhotoMapPdf.ts`
- `components/viewers/drawSurveyNorthMarkPdf.ts`
- `components/property-survey/propertySurveyBuildingPdf.ts`
- `components/field-capture/GpsPhotoMapPanel.tsx`
- `components/field-capture/FieldCaptureShell.tsx`
- `scripts/field-capture-gps-photo-map-pdf-contract.mjs`
- `scripts/field-capture-gps-photo-map-pdf-e2e.ts`

## Acceptance / regresszió

- GPS geometry engine: 14/14 PASS
- GPS photo map UI: 11/11 PASS
- GPS PDF contract: 12/12 PASS
- valódi A4/A3 PDF generálás: 2/2 PASS
- upload-rules proxy: 6/6 PASS
- client sync: 14/14 PASS
- staging: 14/14 PASS
- P8 user Drive: 14/14 PASS
- P7 server capture: 14/14 PASS
- Terep regresszió: 66/66 PASS
- GyorsSend regresszió: 44/44 PASS
- `npx tsc --noEmit`: PASS
- célzott ESLint: PASS
- `git diff --check`: PASS

A generálási E2E által visszaolvasott lapméretek:
- A4 fekvő: kb. 842 × 595 pt
- A3 fekvő: kb. 1191 × 842 pt

## Következő blokk

Blokk E – kalibrációs pont foundation:
- minimum 3 kalibrációs pont;
- Sarokpont / Kitűzési pont / Egyedi referencia;
- GPS koordináta rögzítése gomb;
- 5–10 másodperces többminta-gyűjtés;
- átlagolt koordináta, pontosság, időpont, mintaszám, megjegyzés;
- tényleges PDF/DXF tervillesztés még nem része ennek a blokknak.

PROD változatlan, nem történt PROD alkalmazásmódosítás.
