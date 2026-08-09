# DIMPRO Ingatlanfelmérő v0.3.1 – Dinamikus külső falmotor, mágneses illesztés és hosszú nyomás

Dátum: 2026-07-27

## Kiadás

- Modul: **DIMPRO Ingatlanfelmérő**
- Verzió: **v0.3.1**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Aktív production build: `SfIvjW-iImmO4KwD68e-M`

## Fejlesztési cél

A helyiségek mozgatása és méretváltoztatása után a rendszer automatikusan, kézi újraelemző gomb nélkül kövesse:

- a helyiségek közötti érintkezést;
- a belső és külső falszakaszok változását;
- a külső határoló falhosszakat;
- az alaprajzi külső falméret-feliratokat;
- a falhoz kötött nyílászárók és kézzel megadott falszerkezeti adatok kapcsolatát.

A helyiségek egymáshoz igazítása mágneses illesztéssel történjen, a mentés és a veszélyes törlési/összevonási műveletek pedig 2 másodperces hosszú nyomással legyenek védve.

## Dinamikus külső falmotor

A `reconcileDynamicWallModelForRooms` motor minden geometriai változás után újraépíti az érintett szint falszakaszait.

Automatikus újraszámítást indít:

- helyiség húzása;
- helyiséghossz módosítása;
- keresztméret módosítása;
- Bluetooth-/bridge-mérés alkalmazása;
- új helyiség létrehozása;
- helyiség törlése;
- korábbi v0.3.0 felmérés betöltése/migrációja.

A motor felismeri:

- a teljesen külső helyiségoldalt;
- a teljesen belső közös falat;
- a részben belső, részben külső faloldalt;
- az átrendezés után megszűnő vagy létrejövő helyiségkapcsolatot.

Az aktív szint összesítőjében külön megjelenik:

- teljes külső falhossz méterben;
- automatikus külső falszakaszok száma;
- alaprajzon szakaszonként a külső falhossz méretfelirata.

## Adatmegőrzés újraszámításkor

A dinamikus falmotor a lehető legnagyobb geometriai átfedés alapján megőrzi:

- a kézzel beállított faltípust és rétegrendet;
- a falvastagságot;
- a fal megjegyzését;
- a kézi szakaszhatárokat;
- a falra helyezett nyílászárókat.

A nyílászáró az új falszakaszhoz kerül át, a faloldalon elfoglalt globális helyének megtartásával.

## Mágneses helyiségillesztés

Helyiség húzásakor a rendszer 16 rajzi egységen belül megkeresi a közeli helyiségfalakat.

Az illesztés feltételei:

- a falak függőleges vagy vízszintes iránya megegyezik;
- az egymásra vetített falszakaszok legalább 10 rajzi egység hosszon átfednek;
- a két fal közötti távolság nem nagyobb a mágneses küszöbnél.

Sikeres illesztéskor:

- a helyiség pontosan a másik helyiség falára ugrik;
- zöld segédvonal jelzi a közös falszakaszt;
- `MÁGNESES ILLESZTÉS` felirat jelenik meg;
- az alsó állapotsáv zöldre vált;
- támogatott eszközön rövid haptikus rezgés történik;
- elengedés után a belső/külső falszakaszok és külső falhossz azonnal újraszámolódnak.

## Kézi külső falszakasz-finomhangolás

A Szerkezetek munkalapon egy szakasz határa:

- `10 cm-rel rövidebb`;
- `10 cm-rel hosszabb`

gombbal finomítható.

A szomszédos szakasz határa automatikusan együtt mozdul, ezért nem keletkezik hézag vagy átfedés.

Egyetlen teljes helyiségoldal hosszát továbbra is a helyiség hossz- vagy keresztméretével kell módosítani; így a helyiséggeometria és az energetikai falszámítás konzisztens marad.

## Hosszú nyomásos biztonsági gombok

Közös komponens: `HoldActionButton.tsx`.

### Zöld mentés

- 2 másodpercig kell nyomva tartani;
- mozgó zöld kitöltés mutatja a folyamatot;
- korai elengedéskor visszaáll és nem hajt végre műveletet;
- sikeres mentés után `Mentve` visszajelzés jelenik meg.

### Piros törlés és összevonás

- helyiség törlése: 2 másodperces piros hosszú nyomás;
- falszakasz összevonása: 2 másodperces piros hosszú nyomás;
- korai elengedéskor nincs törlés vagy összevonás;
- a gombon mozgó piros folyamatjelző és visszaszámlálás látszik.

A komponens egérrel, pointer eseménnyel, érintőképernyőn és billentyűzettel is használható.

## Érintett fájlok

- `components/property-survey/HoldActionButton.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/PropertySurveyWallPanel.tsx`
- `components/property-survey/propertySurveyBuildingModel.ts`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Biztonsági mentések

Forrásmentés:

- `backups/ingatlanfelmero_v031_dynamic_walls_hold_20260727_135656`

Dokumentációmentés:

- `backups/ingatlanfelmero_v031_docs_20260727_151636`

Production rollback:

- `/root/dimprover/.next_before_ingatlan_v031_20260727_151301`

## Teszteredmények

- érintett fájlok ESLint: 0 hiba, 0 figyelmeztetés;
- teljes futó `app` és `components` forráslint: 0 hiba, korábbi más modulokban 111 figyelmeztetés;
- TypeScript: sikeres;
- candidate production build: sikeres, exit code 0;
- standalone statikus chunk: 122 ellenőrizve;
- candidate assetaudit: 12/12;
- éles főoldali assetaudit: 13/13;
- éles Ingatlanfelmérő assetaudit: 12/12;
- mágneses segédvonal és aktív állapot: sikeres;
- pontos falra ugrás: sikeres;
- külső falhossz 20,00 m → 16,00 m: sikeres;
- kétoldali belső falszakasz létrehozása: sikeres;
- külső falméret-feliratok frissítése: sikeres;
- 10 cm-rel rövidebb/hosszabb szakasz: sikeres;
- rövid mentési nyomás megszakítása: sikeres;
- 2 másodperces mentés: sikeres;
- rövid helyiségtörlési nyomás megszakítása: sikeres;
- 2 másodperces helyiségtörlés: sikeres;
- rövid falszakasz-összevonási nyomás megszakítása: sikeres;
- 2 másodperces falszakasz-összevonás: sikeres;
- desktop/tablet/mobil: nincs vízszintes overflow;
- éles JavaScript- és hálózati hiba: nincs;
- PM2 `dimprover`: online.

A beépített globális `npm run lint` a projektgyökérben lévő nagy mennyiségű archív ZIP-, backup- és munkafájl miatt eléri a Node 2 GB-os heapkorlátját. A tényleges futó forrásállományok kötegelt lintje hibamentesen lefutott.

## Ismert korlátok

- a helyiségek továbbra is téglalap alapúak;
- ferde, poligonális és íves falgeometria még nincs;
- a mágneses illesztés jelenleg vízszintes és függőleges falélekre működik;
- nincs még undo/redo előzmény a helyiségmozgatáshoz;
- nincs még szerveres projektmentés;
- a külső falhosszból számított bruttó/nettó falterület és WinWatt-tábla következő fejlesztési kör.

## Következő fejlesztési javaslat

1. Bruttó külső falfelület számítása: külső falhossz × belmagasság.
2. Nyílászárófelület automatikus levonása és nettó külső falfelület.
3. Szintenkénti és tájolásonkénti WinWatt-beviteli összesítő.
4. Undo/redo a helyiségmozgatás és méretváltoztatás műveleteihez.
5. Ferde és poligonális helyiség-/falmodell.
