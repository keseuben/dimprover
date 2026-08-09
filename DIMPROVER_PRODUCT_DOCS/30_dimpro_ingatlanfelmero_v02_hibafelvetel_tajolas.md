# DIMPRO Ingatlanfelmérő v0.2 MVP – Hibafelvevő és egyértelmű tájolás

Dátum: 2026-07-27

## Kiadás

- Modul: **DIMPRO Ingatlanfelmérő**
- Almodul: **Hibafelvevő / alaprajzi hibapontok**
- Verzió: **v0.2 MVP**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Aktív production build: `MGU91fxXemm0_SpcbPgPL`

## Fejlesztési cél

Az energetikai és műszaki ingatlanfelmérés közben a felhasználó tableten egyszerűen tudjon:

- hibát vagy műszaki észrevételt rögzíteni;
- a hiba pontos helyét az alaprajzon megjelölni;
- automatikus HJ sorszámot kapni;
- rövid hibaadatlapot kitölteni;
- hibánként egy helyszíni vagy már jelölt fotót csatolni;
- a hibapontot később áthelyezni;
- a tájolást az alaprajzi keret és a lapoldalak alapján egyértelműen beállítani.

A felület egyszerű marad: új hibapont felvételéhez egy gomb és egy alaprajzi koppintás szükséges.

## Új Hibák munkalap

A felmérési workflow új, 7. lépése:

1. Ingatlan
2. Alaprajz
3. Szerkezetek
4. Nyílászárók
5. Gépészet
6. Fotók
7. **Hibák**
8. Ellenőrzés
9. Export

A Hibák munkalap funkciói:

- `Új hibapont az alaprajzon` indítógomb;
- koppintásos hibapont-elhelyezés;
- automatikus `HJ-001`, `HJ-002`, ... számozás;
- helyiség automatikus felismerése az alaprajzi koordinátából;
- hibapont kiválasztása közvetlenül a rajzon vagy a listából;
- hibapont új helyének kijelölése;
- hibajegy törlése megerősítéssel;
- hibajegyek helyi automatikus mentése.

## Hibajegy-adatlap

Rögzíthető mezők:

- HJ sorszám;
- hiba megnevezése;
- helyiség;
- szakág: építészet, gépészet, elektromos, technológia, egyéb;
- súlyosság;
- státusz;
- rövid leírás;
- rögzítés dátuma;
- rögzítő neve;
- fotó típusa: helyszíni fotó vagy jelölt fotó;
- fotó megjegyzése.

Státuszok:

- Nyitott;
- Folyamatban;
- Ellenőrzésre vár;
- Lezárt.

## Hibafotó

- hibánként egy fotó csatolható;
- mobilon és tableten közvetlen kameraindítás támogatott;
- meglévő jelölt kép is kiválasztható;
- a nagy kép legfeljebb 1600 pixeles oldalhosszra kerül optimalizálásra;
- a helyi MVP mentéshez JPEG előnézeti adat készül;
- a fotó cserélhető vagy törölhető.

A jelenlegi webes MVP localStorage-ban tárolja a fotó előnézetét. A későbbi szerveres változatban a fájl projektmappába vagy DIMPRO Drive tárhelyre kerül.

## Közös marker engine

Nem készült új, párhuzamos hibajelölő motor.

Az Ingatlanfelmérő a meglévő DIMPROVER közös elemeit használja:

- `PlanHexMarker`;
- `PlanMarkerTypes`;
- szakági színezés;
- súlyossági jelzés;
- státuszjelzés;
- normalizált százalékos koordináták.

Az ingatlanfelmérési hibajegy külön adapterrel alakul át közös `PlanIssueMarker` objektummá. Így később ugyanaz a hibapont használható a DIMPROVER hibajegyzékben, PDF-tervnézőben és exportmotorban.

## Tájolási fejlesztés

A csúszka önmagában nem volt elég egyértelmű, ezért új tájolási rendszer készült.

### Alaprajzi keret

Az alaprajz keretén körben megjelenik:

- É;
- ÉK;
- K;
- DK;
- D;
- DNy;
- Ny;
- ÉNy.

A címkék a beállított északi szöggel együtt mozognak.

### Felső lapoldal gyors tájolása

Egy koppintással kiválasztható, hogy az alaprajz felső oldala melyik irányba néz:

- É, ÉK, K, DK, D, DNy, Ny vagy ÉNy.

Példa: felső oldal = K esetén:

- felső oldal: K · 90°;
- jobb oldal: D · 180°;
- alsó oldal: Ny · 270°;
- bal oldal: É · 0°.

### WinWatt oldaltájolások

Külön blokk jeleníti meg a négy alaprajzi oldal:

- égtáját;
- pontos 0–359° azimutját.

A blokk célja a későbbi WinWatt-adatbevitel és energetikai szerkezet-/nyílászáró-tájolás előkészítése.

### Finomhangolás

A korábbi csúszka megmaradt, de csak lenyitható finomhangolási eszközként. A fő beállítás a 8 égtájas gyorsválasztó.

### Rajzterület védelme

A tájolási vezérlő nem az alaprajz fölött lebeg, hanem külön vezérlősávban, az alaprajz alatt található. Emiatt a teljes rajzi terület szabadon koppintható hibapont felvételéhez.

## Mentés és export

- felmérési adatok: `dimpro-property-survey-mvp-v1` localStorage kulcs;
- hibajegyek: `dimpro-property-survey-issues-v1` localStorage kulcs;
- JSON séma: `dimpro.property-survey.v0.2`;
- a JSON export tartalmazza a hibajegyeket, koordinátákat, állapotokat és a hibafotó előnézetét is.

## Érintett fájlok

- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/PropertySurveyIssuesPanel.tsx`
- `components/property-survey/propertySurveyIssueTypes.ts`
- `components/viewers/SurveyFloorPlanEngine.tsx`
- közösen használt, változatlan engine-elemek:
  - `components/viewers/PlanHexMarker.tsx`
  - `components/viewers/PlanMarkerTypes.ts`

## Biztonsági mentések

- `backups/ingatlanfelmero_hibafelvetel_20260727_082253`
- `backups/ingatlanfelmero_tajolas_20260727_084024`

Production rollback:

- `/root/dimprover/.next_before_ingatlan_v02_20260727_091700`

## Teszteredmények

- TypeScript: sikeres;
- érintett fájlok ESLint: 0 hiba, 0 figyelmeztetés;
- teljes futó `app` és `components` forráslint: 0 hiba, 102 korábban meglévő figyelmeztetés más modulokban;
- candidate production build: sikeres, exit code 0;
- standalone statikus chunk: 120 ellenőrizve;
- candidate asset audit: 12/12 sikeres;
- éles főoldali asset audit: 13/13 sikeres;
- éles Ingatlanfelmérő asset audit: 12/12 sikeres;
- 8 tájolási keretcímke: sikeres;
- 8 gyors tájolási gomb: sikeres;
- WinWatt négy oldali tájolás: sikeres;
- gyorsbeállítás K és ÉNy irányra: sikeres;
- 1°-os finomhangolás és localStorage mentés: sikeres;
- HJ-001 és HJ-002 automatikus számozás: sikeres;
- hibapont áthelyezés: sikeres;
- hibafotó optimalizálás és mentés: sikeres;
- rajzi kattintási terület nincs tájolási panellel lefedve;
- desktop/tablet/mobil: nincs vízszintes overflow;
- éles PM2 `dimprover`: online;
- éles `app.dimpro.hu/ingatlanfelmero`: helyesen loginra irányít.

## Ismert korlátok

- a felmérés és a hibajegyek még csak helyi böngészőtárban tárolódnak;
- nincs még szerveres projekt- és felhasználói adatbázis-kapcsolat;
- egy hibához jelenleg egy fotó kapcsolható;
- a jelölt fotó szerkesztése még nem indul közvetlenül a közös DIMPRO képszerkesztőben;
- nincs még hibajegyzék PDF-export és teljes jelölt alaprajz-export;
- nincs még WinWatt-fájl vagy közvetlen WinWatt-import/export kapcsolat;
- nincs valódi RoomPlan/LiDAR és Bluetooth-lézer kapcsolat.

## Következő fejlesztési javaslat

1. Szerveres projekt-, felmérés- és hibajegy-adatmodell.
2. Hibafotók DIMPRO Drive projektmappába mentése.
3. Közös DIMPRO képszerkesztő megnyitása jelölt fotó készítéséhez.
4. Hibajegyzék PDF, fényképes melléklet és jelölt alaprajz export.
5. Hibák átadása a DIMPROVER központi Hibajegyzék modulnak.
6. Fal- és nyílászáró-oldalak automatikus azimutja a WinWatt előkészítéshez.
7. WinWatt adatbeviteli segédtábla vagy kompatibilis exportformátum vizsgálata.
8. RoomPlan/LiDAR és Bosch/Leica Bluetooth mérőkapcsolat.
