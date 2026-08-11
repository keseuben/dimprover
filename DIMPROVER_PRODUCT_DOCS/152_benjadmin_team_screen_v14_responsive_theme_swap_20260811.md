# BENJADMIN csapatképernyő v1.4 – laptop-reszponzív, világos/sötét mód és swap monitoring

Dátum: 2026-08-11

## Normatív alap

A fejlesztés továbbra is a BENJADMIN B3, B3.1 Control Plane és B3.2 Partner Development Plane közös szabályai szerint készült.

PROD módosítás ebben a körben nem történt.

## Laptop-reszponzív javítás

A felhasználói visszajelzés alapján a 1366×768 körüli laptop-kijelzőn a csapatkártyák képei és szövegei túl közel kerültek egymáshoz.

Új célzott breakpoint:

- `min-width: 1181px` + `max-height: 860px`;
- alacsonyabb fejléc;
- kompaktabb középső panel;
- rövidebb, de nem 12 px alatti működési szöveg;
- csökkentett kártyapadding és sortávolság;
- AI finanszírozási blokk 170 px-es laptopmagasságon;
- középső csapatkártyák arányának külön laptop-optimalizálása.

Acceptance 1366×768-on:

- személyi kártya overflow: 0;
- teljes oldali vízszintes overflow: 0;
- a teljes csapatképernyő egy viewportban marad.

## Jobb oldali diagramok

A zavaró, túlméreteződő üres `Activity` ikon vizuális hibája javítva.

Az üres vonaldiagram állapot ikonja explicit 22×22 px maximumot kapott.

A korábbi `Vezérlési pulzus` kártya eltávolításra került a csapatképernyőről.

A jobb oldali oszlop fő szerepe most tisztán az időbeli működési trend:

1. rendszerterhelési trend;
2. elérési válaszidő;
3. fejlesztési aktivitás.

A vonaldiagramok X-tengelyén hosszabb idősornál csak kezdő / középső / utolsó címke jelenik meg, hogy laptopon se csússzanak össze az időbélyegek.

## Világos / sötét mód

A BENJADMIN fő admin felület felső sávja külön világos/sötét mód kapcsolót kapott.

A `Ctrl+Alt+0` / `D` csapatképernyő:

- mindig a fő BENJADMIN admin aktuális témájában nyílik meg;
- saját témaikont is tartalmaz;
- a saját témaikon ugyanazt a közös `dimpro-admin-theme` állapotot módosítja;
- bezárás után a fő admin ugyanabban az új témában marad.

A világos csapatképernyő külön enterprise palettát kapott:

- világos szürke-kék háttér;
- fehér kártyák;
- navy elsődleges szöveg;
- cyan/türkiz állapotkiemelések;
- változatlan funkcionális és információs hierarchia.

## Swap monitoring

A működési és infrastruktúra nézet bal oldali szerverkártyái új `Swap használat` sávot kaptak.

### BENJADMIN DEV VPS

A meglévő `/api/license/server-status` memória read modelből közvetlenül használja:

- `swapTotalBytes`;
- `swapUsedBytes`;
- `swapFreeBytes`;
- `swapUsagePercent`.

Aktuális DEV mintában kb. 510 MB swap áll rendelkezésre.

### DB VPS

A read-only infrastruktúra snapshot adatmodell új swap mezőkkel bővült:

- `swapTotalBytes`;
- `swapUsedBytes`;
- `swapFreeBytes`;
- `swapPercent`.

A jelenlegi read-only DB mérés:

- teljes swap: 534 769 664 byte (~510 MB);
- használt swap: 0 byte;
- swap kihasználtság: 0%.

### PRODUCTION / ÉLES VPS

A PRODUCTION kártyán is megjelent a `Swap használat` sáv, de a jelenlegi snapshot még nem tartalmaz PROD swap mezőt.

Ezért a felület nem talál ki 0%-ot vagy kapacitást, hanem korrekt módon ezt mutatja:

`Read-only swap minta még nem érhető el.`

A végleges adatot a B3.1 dedikált read-only Control VPS collector fogja tölteni. PROD-on emiatt nem történt módosítás.

## Infrastruktúra API

`/api/dev/engine/infrastructure-summary`

A szerver read model új mezője:

`swap`

Séma:

- `usagePercent`;
- `totalBytes`;
- `usedBytes`;
- `availableBytes`.

Ha egy read-only mintában nincs swap telemetria, a mező `null` marad.

## Acceptance

Frissített teszt:

`scripts/benjadmin-team-screen-acceptance.mjs`

Eredmény:

**41/41 PASS**

Új ellenőrzések többek között:

- PRODUCTION és DB swap mező API-szinten rendelkezésre áll;
- DEV / PROD / DB mindhárom kártyán `Swap használat` mező látható;
- üres diagram óriás pulzus ikon nincs;
- sötét téma öröklődik;
- 1366×768 laptopon nincs személyi kártya tartalom-overflow;
- 1366×768 horizontal overflow nincs;
- fő admin felső témakapcsoló látható;
- világos módból megnyitott `Ctrl+Alt+0` képernyő világosan nyílik;
- csapatképernyő témaikonja a közös témát váltja;
- tablet/mobil regresszió rendben.

## Regresszió

- TypeScript: PASS a cél DEV worktree-ben;
- full lint: 0 error / 108 meglévő warning;
- Operator UI: 30/30 PASS;
- B3.2 P5: 53/53 PASS;
- `git diff --check`: PASS;
- PM2 DEV runtime: online.

## DEV build

Aktív build:

`q_X3C24_Gz7QBC0UWmNN3`

## Következő fejlesztési pont

1. az öt eredeti nagy felbontású, átlátszó hexagon asset közvetlen cseréje, amint fájlként/ZIP-ként elérhető;
2. PRODUCTION swap read-only collector bekötése a B3.1 Control VPS felől;
3. Drive / Drop Hetzner S3 teljes DIMPRO keretértékének konfigurálása, hogy a foglalt érték mellett százalékos tárhelyterhelés is mérhető legyen;
4. tartós CPU / RAM / swap / lemez idősor a jobb oldali működési diagramokhoz.
