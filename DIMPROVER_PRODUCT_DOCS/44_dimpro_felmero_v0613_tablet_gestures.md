# DIMPRO Felmérő v0.6.1.3 – tablet pinch-zoom és stabil helyiségmozgatás

Dátum: 2026-07-29

## Fejlesztési cél

A v0.6.1.3 a közös DIMPRO alaprajzi motor tablet- és érintéskezelését javítja. A korábbi verzióban a rajz nagyítása tableten csak a képernyős `+` és `−` gombokkal működött, a natív kétujjas nagyítás nem. Egyujjas helyiséghúzáskor a böngésző natív oldalmozgatása megszakíthatta a pointer eseménysorozatot, továbbá a rajz minden koordinátaváltozás után újra középre illesztette a teljes alaprajzot. Ez minimális, pontatlan vagy ugró helyiségmozgatást okozhatott.

## Elkészült érintéskezelés

- kétujjas pinch-zoom 45% és 400% között;
- a két ujj középpontját követő nagyítás;
- kétujjas pásztázás a nagyítással egy időben;
- egyujjas helyiségmozgatás alapnagyításon;
- egyujjas helyiségmozgatás nagyított rajzon;
- egyujjas üresrajz-pásztázás;
- a `Teljes rajz` paranccsal visszaállítható 100%-os, középre rendezett nézet;
- az egérgörgős és a `+`/`−` gombos nagyítás változatlanul használható.

## Natív tabletgörgetés kizárása

A rajzfelület a következő védelmet kapta:

- `touch-action: none`;
- `overscroll-behavior: contain`;
- nem passzív `touchmove` eseménykezelő;
- touch pointerek capture-fázisú nyilvántartása;
- pinch indulásakor az esetleges egyujjas rajzi művelet biztonságos megszakítása.

A rajzfelületen végzett érintés nem görgeti el az oldalt vagy a teljes képernyős munkateret. A rajzon kívüli panelek továbbra is külön görgethetők.

## Stabil rajzi koordinátarendszer

A helyiségek `x`/`y` mozgatása közben a közös alaprajzi motor már nem számolja újra automatikusan a teljes rajz középre illesztését. A rajzi transzformáció stabil marad a húzás teljes időtartama alatt és a húzás befejezése után is.

Automatikus újraillesztés csak olyan szerkezeti változásnál történik, amely módosítja a helyiségek számát vagy méretét. Kézi újraillesztéshez a `Teljes rajz` gomb használható.

## Koordináta-átváltás

A képernyőpont és az SVG rajzi koordináta közötti átváltás az SVG aktuális képernyőmátrixából történik. Ez figyelembe veszi:

- a tablet képpontsűrűségét;
- az álló vagy fekvő tájolást;
- a CSS teljes képernyős módot;
- a pinch-zoomot;
- a pásztázási eltolást;
- a rajzlap tényleges SVG-méretét.

## Felhasználói jelzés

A rajz alján megjelenő súgó szövege:

```text
Egy ujjal helyiségmozgatás · két ujjal nagyítás és pásztázás
```

## Érintett fájlok

```text
components/viewers/SurveyFloorPlanEngine.tsx
scripts/test-property-survey-tablet-touch.cjs
DIMPROVER_PRODUCT_DOCS/02_modulok_es_funkciok.md
DIMPROVER_PRODUCT_DOCS/05_verziotortenet.md
```

## Teszteredmények

Production candidate build:

```text
Y2VYmPGILjMDzP-OxmxP-
```

Sikeres ellenőrzések:

- célzott ESLint;
- TypeScript `npx tsc --noEmit`;
- production standalone build;
- tablet álló érintésteszt: 834 × 1194 px;
- tablet fekvő érintésteszt: 1194 × 834 px;
- egyujjas helyiséghúzás alapnagyításon;
- kétujjas nagyítás 100%-ról 215%-ra;
- kétujjas pásztázás;
- oldalelgördülés pinch közben: 0 px;
- helyiségmozgatás 215%-os nagyítás mellett;
- kétujjas kicsinyítés 215%-ról 118,3%-ra;
- vízszintes tablet-overflow: nincs;
- teljes v0.6.1 regresszió;
- v0.6.1.2 rajzlap/PDF regresszió;
- PDF, DXF, WinWatt JSON/CSV, `.dimpro` és fotó-ZIP export;
- metszet, átfedésjavítás és ipari HATCH regresszió;
- candidate assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.

## Backup

```text
backups/ingatlanfelmero_v0613_tablet_gesture_20260729_055318
```

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: Y2VYmPGILjMDzP-OxmxP-
PM2 process: dimprover
Állapot: online
Rollback: .next_before_ingatlan_v0613_20260729_063151
```

Éles ellenőrzések:

- HTTP 200;
- tablet álló érintésteszt: sikeres;
- tablet fekvő érintésteszt: sikeres;
- éles pinch-zoom és nagyítás utáni helyiségmozgatás: sikeres;
- éles oldalelgördülés: 0 px;
- éles assetaudit: 13/13 HTTP 200;
- PM2 folyamat: online.
