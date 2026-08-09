# DIMPRO Ingatlanfelmérő v0.4.0 – Energetikai szerkezetek, fotópontok és gépészeti elhelyezés

Dátum: 2026-07-27

## Kiadás

- Modul: **DIMPRO Ingatlanfelmérő**
- Verzió: **v0.4.0**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Candidate build: `dJ3ccpGQa8rtkBD7ZOxbI`

## Fejlesztési cél

A v0.4.0 célja az alaprajzi felmérés energetikai adatmodelljének továbbfejlesztése:

- a metsző és átfedő helyiségek falbesorolásának javítása;
- a fűtött és fűtetlen terek közötti falak automatikus megkülönböztetése;
- helyiségburkolatok és álmennyezeti adatok felvétele;
- szerkeszthető hőhatár;
- lábazat-, fal-, padló- és födémrétegrendek;
- falvastagsággal arányos alaprajzi megjelenítés;
- ajtó és ablak külön kezelése;
- nyílászárók falon történő mozgatása;
- gépészeti berendezések helyiséghez és alaprajzi ponthoz kötése;
- számozott fotópontok elhelyezése az alaprajzon.

## Helyiségátfedés és falbesorolás

A falmotor már nem csak az egymással pontosan találkozó helyiségéleket vizsgálja. Ha egy helyiség fala egy másik helyiség területén halad keresztül, a keresztezett szakaszt a rendszer felismeri.

Besorolási szabály:

- fűtött tér és fűtött tér között: **belső fal**;
- fűtött tér és fűtetlen tér között: **fűtetlen térrel határos fal**;
- külső térrel érintkező maradék szakasz: **külső fal**.

A helyiségátfedés külön piros figyelmeztetést kap. Az energetikai falbesorolás frissül, de a geometriai átfedést a felhasználónak mágneses illesztéssel célszerű megszüntetnie.

## Helyiségburkolatok és álmennyezet

Helyiségenként rögzíthető:

- padlóburkolat;
- falburkolat vagy falfelület;
- mennyezeti felület;
- teljes belmagasság;
- álmennyezet megléte;
- álmennyezet belógása.

A rendszer számítása:

```text
Hasznos belmagasság = teljes belmagasság − álmennyezet belógása
```

Az energetikai helyiségtérfogat a hasznos belmagassággal számolódik.

## Szerkeszthető hőhatár

A Szerkezetek munkalapon külön Hőhatár fül készült.

Módok:

- automatikus, csak fűtött helyiségek alapján;
- automatikus, minden helyiség alapján;
- kézi téglalap.

Beállítható:

- hőhatár eltolása centiméterben;
- kézi bal és felső pozíció;
- kézi szélesség és magasság;
- automatikus újraillesztés az aktuális helyiségekhez.

A zöld szaggatott hőhatár az alaprajzon azonnal követi a módosítást.

## Rétegrendek

Közös rétegrend-adatmodell készült az alábbi kategóriákhoz:

- lábazat;
- fal;
- padló;
- födém vagy tető.

Minden réteghez rögzíthető:

- anyag;
- vastagság centiméterben;
- opcionális λ-érték;
- megjegyzés.

A rendszer automatikusan összesíti a rétegrend teljes vastagságát.

Hozzárendelés:

- falrétegrend közvetlenül a falszakaszhoz;
- lábazat-, padló- és födémrétegrend a kiválasztott helyiséghez.

Falrétegrend kiválasztásakor a falszakasz neve és vastagsága átvehető a rétegrendből.

## Falvastagság alaprajzi megjelenítése

A falvonal vizuális vastagsága a rögzített falvastagsággal arányos.

- külső fal: erősebb narancssárga;
- belső, fűtött terek közötti fal: világosabb szürke;
- fűtetlen térrel határos fal: szaggatott sárgás jelölés;
- kijelölt fal: cián kiemelés.

A 45 cm-es falszerkezet a tesztben a 10 cm-es belső falnál egyértelműen vastagabban jelent meg.

## Ajtók és ablakok

A Nyílászárók munkalapon külön művelet készült:

- **Ablak hozzáadása**;
- **Ajtó hozzáadása**.

Alapértékek eltérnek:

- ablak: parapetmagasság 0,90 m;
- ajtó: parapetmagasság 0,00 m.

A nyilvántartás és az összesítő külön számolja az ablakokat és az ajtókat.

## Nyílászáró mozgatása falon

A kijelölt nyílászáró:

- a jobb oldali csúszkával;
- vagy közvetlenül az alaprajzon megfogva

végigtolható a saját falszakaszán.

A mozgatás vetítéssel történik a fal tengelyére, ezért a nyílászáró nem hagyhatja el a falat. A rendszer figyelembe veszi a nyílászáró saját szélességét is.

## Gépészeti berendezések

A Gépészet munkalapon elhelyezhető:

- kazán vagy hőtermelő;
- hőszivattyú;
- radiátor vagy hőleadó;
- padlófűtés;
- klíma;
- melegvíz-tároló;
- szellőző berendezés;
- napelem vagy napkollektor;
- egyéb gépészeti berendezés.

A berendezés rekordja tartalmazza:

- szint;
- helyiség;
- alaprajzi pozíció;
- típus és megnevezés;
- gyártó és modell;
- teljesítmény vagy kapacitás;
- megjegyzés.

A berendezés helye később módosítható.

## Számozott fotópontok

A Fotók munkalap teljes alaprajzi munkafolyamatot kapott:

1. `Új fotópont az alaprajzon` indítása.
2. Koppintás a fotó készítési helyére.
3. Automatikus helyiségfelismerés.
4. Automatikus sorszám: `F-001`, `F-002`, ...
5. Kameraindítás vagy meglévő kép kiválasztása.
6. Fotó optimalizálása.
7. Ugyanazon F-sorszám megjelenítése az alaprajzon és a fotólistában.

A fotópont tartalmazza:

- szint- és helyiségkapcsolat;
- normalizált alaprajzi koordináta;
- készítés ideje;
- cím és megjegyzés;
- fájlnév és optimalizált előnézet.

A fotópont a közös `PlanHexMarker` motort használja, külön kék fotómegjelenítéssel, hibajegy-jelzés nélkül.

## Adatmigráció

A v0.3.1 felmérések automatikusan bővülnek az új mezőkkel.

Korábbi `photoNames` lista esetén:

- a fájlok `F-001`, `F-002`, ... rekorddá alakulnak;
- az alaprajzi pozíció ellenőrizendő megjegyzést kap;
- az új fotópontok a következő szabad sorszámot használják.

## Érintett fájlok

Új fájlok:

- `components/property-survey/propertySurveyEnergyModel.ts`
- `components/property-survey/PropertySurveyStructuresPanel.tsx`
- `components/property-survey/PropertySurveyPhotoPanel.tsx`
- `components/property-survey/PropertySurveyMechanicalPanel.tsx`

Módosított fájlok:

- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/PropertySurveyOpeningPanel.tsx`
- `components/property-survey/PropertySurveyWallPanel.tsx`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/property-survey/propertySurveyBuildingModel.ts`
- `components/viewers/SurveyFloorPlanEngine.tsx`
- `components/viewers/PlanHexMarker.tsx`

## Biztonsági mentések

- `backups/ingatlanfelmero_v040_structures_photos_mechanical_20260727_192036`
- `backups/ingatlanfelmero_v040_docs_20260727_201130`

## Candidate teszteredmények

- érintett ESLint: 0 hiba, 0 figyelmeztetés;
- teljes `app` és `components` forráslint: 0 hiba;
- TypeScript: sikeres;
- production build: sikeres;
- standalone chunk: 122 ellenőrizve;
- candidate assetaudit: 12/12;
- v0.3.1 adat migráció: sikeres;
- átfedő fűtött helyiségek közötti belső fal: sikeres;
- fűtött–fűtetlen közös fal `unheated` besorolása: sikeres;
- kézi 8,50 × 5,25 m hőhatár: sikeres;
- helyiségburkolat és 0,30 m álmennyezet: sikeres;
- 2,40 m hasznos belmagasság: sikeres;
- fal-, lábazat-, padló- és födémrétegrend: sikeres;
- 45 cm falvastagság arányos megjelenítése: sikeres;
- külön ablak és ajtó: sikeres;
- ajtó falon történő húzása: sikeres;
- gépészeti berendezés elhelyezése: sikeres;
- új F-002 fotópont a migrált F-001 után: sikeres;
- fotófeltöltés és helyiségkapcsolat: sikeres;
- részletes tájolás felfelé nyílása: sikeres;
- desktop, tablet és mobil: nincs vízszintes overflow;
- JavaScript- vagy hálózati hiba: nincs.

## Ismert korlátok

- a hőhatár kézi módja jelenleg téglalap alapú, nem tetszőleges poligon;
- a rétegrend λ-értéke még nem számol automatikus U-értéket;
- a gépészeti ikonok egyszerű 2D jelölők;
- a fotók még localStorage-ban tárolódnak, nem DIMPRO Drive-ban;
- a nyílászárók közötti minimális távolságütközés még nincs automatikusan ellenőrizve;
- a végleges WinWatt export még nem készült el.

## Következő fejlesztési javaslat

1. Szerveres projekt- és felmérésadatbázis.
2. Fotók DIMPRO Drive projektmappába mentése.
3. Tetszőleges poligonális hőhatár.
4. Rétegrendből U-érték és hőátbocsátási ellenállás számítása.
5. Bruttó és nettó külső falfelület szintenként és tájolásonként.
6. WinWatt adatbeviteli táblázat és export.
7. RoomPlan/LiDAR és gyártóspecifikus Bluetooth-adapter.

## v0.4.1 – Marker-méretezés és strukturált címadatok

Dátum: 2026-07-27

### Alaprajzi markerek

Az Ingatlanfelmérő a közös `PlanHexMarker` komponenst továbbra is használja, de a modul saját méretskálát ad át:

- fotópont: `0,58` méretskála;
- hibapont: `0,52` méretskála.

A közös marker alapértelmezett mérete nem változott, ezért a PDF-, IFC- és más tervnéző modulok megjelenítése érintetlen maradt.

Candidate böngészőteszt 100%-os zoomon:

- fotómarker: 42 × 40 px;
- hibamarker: 32 × 51 px.

### Strukturált ingatlancím

Az Ingatlan munkalap címmezői:

- irányítószám;
- település;
- utca / közterület;
- házszám.

A rendszer a mezőkből továbbra is előállítja a teljes `address` értéket az exporthoz és a térképi kereséshez.

Példa:

```text
Irányítószám: 7100
Település: Szekszárd
Utca: Garay tér
Házszám: 1.
Teljes cím: 7100 Szekszárd, Garay tér 1.
```

### Offline irányítószám-törzs

A modul helyi magyar irányítószám–település törzset tartalmaz:

- 3046 irányítószám;
- 3571 településkapcsolat;
- külső hálózati kérés nélkül működik;
- forrás: GeoNames HU postal-code export.

Egy település esetén a település automatikusan kitöltődik. Több településhez tartozó irányítószámnál választó jelenik meg. Ismeretlen kód esetén a település kézzel megadható.

### Régi címek migrációja

A korábbi egymezős címadatok automatikusan felbontásra kerülnek, amennyiben a formátum felismerhető.

Tesztelt példa:

```text
4025 Debrecen, Piac utca 12/A
```

Migrált mezők:

- irányítószám: `4025`;
- település: `Debrecen`;
- utca: `Piac utca`;
- házszám: `12/A`.

A migráció támogatja az egyszerű, perjeles, pontozott és kötőjeles házszámok fő formáit.

### Érintett fájlok

- `components/viewers/PlanHexMarker.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/property-survey/hungarianPostalCodes.ts`

### Candidate build és teszt

- build: `WvPXUsTe4BHJs1ZcXRa1X`;
- production build: sikeres;
- standalone chunk: 122;
- assetaudit: 12/12;
- érintett ESLint: 0 hiba, 0 figyelmeztetés;
- TypeScript: sikeres;
- marker méretskála: sikeres;
- 7100 → Szekszárd kitöltés: sikeres;
- többtelepüléses irányítószám-választó: sikeres;
- teljes cím összeállítása: sikeres;
- régi cím migráció: sikeres;
- desktop, tablet és mobil: nincs vízszintes overflow;
- JavaScript- és hálózati hiba: nincs.
