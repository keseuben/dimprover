# DIMPRO Ingatlanfelmérő v0.3.0 – Lapformátum, szintek, falszakaszok és falhoz kötött nyílászárók

Dátum: 2026-07-27

## Kiadás

- Modul: **DIMPRO Ingatlanfelmérő**
- Verzió: **v0.3.0**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Aktív production build: `7u4ghjpCZ2oWcpy6uwvST`

## Fejlesztési cél

Az energetikai felmérési alaprajz ne csak egyszintes, helyiségtéglalap-alapú vázlat legyen, hanem kezelje:

- a kiválasztott papírméretet és lapirányt;
- a tényleges léptéket;
- a pince–földszint–emelet hierarchiát;
- a helyiségek oldalankénti faladatait;
- az egy helyiségoldalon belüli eltérő határolású falszakaszokat;
- a falhoz kapcsolt nyílászárókat;
- a nyílászárók automatikus energetikai tájolását.

## Papírméret és lapirány

Támogatott papírméretek:

- A4;
- A3;
- A2.

Mindegyik használható:

- álló;
- fekvő elhelyezéssel.

A lapkeret a választott ISO A-sorozatú arányban jelenik meg. A fejlécben és a rajzlapon látható:

- papírméret;
- lapirány;
- aktív lépték;
- fizikai lapméret milliméterben.

## Lépték

Két működési mód készült:

### Automatikus lépték

A rendszer a helyiségek teljes rajzi kiterjedése és a választott papírméret alapján választ a következő léptékek közül:

```text
1:20, 1:25, 1:50, 1:75, 1:100, 1:125, 1:150, 1:200, 1:250, 1:500
```

Kisebb laphoz szükség esetén nagyobb léptéknevező tartozik. A candidate tesztben ugyanaz az alaprajz:

- A4 álló lapon automatikusan 1:50;
- A2 fekvő lapon automatikusan 1:20

léptéket kapott.

### Kézi lépték

A felhasználó kézzel is kiválaszthatja a léptéket. Ha a rajz nem fér el:

- a vezérlő javasolt léptéket ír ki;
- a lapon megjelenik a túllógási figyelmeztetés;
- a rajz a papírlap határán belül vágódik.

A képernyős transzformáció fizikai léptékből számolódik:

```text
1 m valós méret → 1000 / lépték mm a papíron
```

## Többszintes felmérés

A felmérés szintek szerint tagolható.

Alapértelmezett szint:

- Földszint · FSZ · ±0,00 m.

Új szint létrehozása:

- **Szint fölé**: új emelet a jelenlegi legfelső szint fölé;
- **Pince alá**: új pince a jelenlegi legalsó szint alá.

Alapértelmezett függőleges kiosztás:

- pince: −3,00 m;
- földszint: 0,00 m;
- 1. emelet: +3,00 m;
- további szintek 3,00 m lépésközzel.

A szintek függőleges hierarchiában rendeződnek. Egyszerre mindig csak az aktív szint szerkeszthető és jelenik meg a rajzlapon.

Szintenként külön tárolódik:

- helyiséglista;
- falszakaszlista;
- nyílászárólista;
- rajzi elrendezés;
- szint neve és magassága.

A teljes épület összesítői továbbra is minden szint adatát együtt számolják.

## Régi felmérések migrációja

A v0.2.2 és korábbi felmérések automatikusan migrálódnak:

- minden korábbi helyiség a Földszinthez kerül;
- létrejön az A3 fekvő automatikus lapbeállítás;
- minden helyiség körül létrejönnek a falszakaszok;
- a korábbi HJ hibapontok és helyiségméretek megmaradnak.

A workspace verziója továbbra is kompatibilis a meglévő helyi projektstruktúrával.

## Falszakasz-adatmodell

A falak nem egyszerűen helyiségenként négy szövegmezőként tárolódnak. Minden helyiségoldal egy vagy több falszakaszra osztható.

Egy falszakasz adatai:

- szint;
- helyiség;
- oldal: felső, jobb, alsó, bal;
- kezdőpozíció az oldalon;
- végpozíció;
- számított szakaszhossz;
- határolási mód;
- faltípus / rétegrend;
- falvastagság centiméterben;
- kapcsolódó helyiség;
- megjegyzés;
- automatikus vagy kézzel pontosított állapot.

Határolási módok:

- külső levegővel határos;
- fűtött helyiségek közötti;
- fűtetlen térrel határos;
- talajjal érintkező;
- szomszédos épület vagy rendeltetési egység.

## Automatikus részleges falhatár-felismerés

A rendszer a téglalap alakú helyiségek érintkező oldalait geometriailag összehasonlítja.

Ha egy helyiségoldalnak csak egy része érintkezik másik helyiséggel, a program automatikusan létrehozza például:

- belső falszakasz: 0,00–2,50 m;
- külső falszakasz: 2,50–5,00 m.

Így a teljes helyiségoldal nem kap tévesen egyetlen belső vagy külső besorolást.

A tesztben egy 5,00 m hosszú oldal 50%-os helyiségátfedésnél automatikusan két részre oszlott:

- 2,50 m belső;
- 2,50 m külső falszakaszra.

## Kézi falszakasz-szerkesztés

A rajzon a falszakaszok közvetlenül kijelölhetők.

A kijelölt falszakasznál módosítható:

- kezdőpont méterben;
- szakaszhossz méterben;
- határolási mód;
- faltípus;
- falvastagság;
- kapcsolódó helyiség;
- megjegyzés.

Műveletek:

- szakasz felezése;
- szakasz összevonása;
- automatikus falhatárok újraelemzése.

A szakaszhatárok hézagmentesek:

- az első szakasz mindig 0,00 m-nél kezdődik;
- az utolsó szakasz a teljes oldal végéig tart;
- közös határ módosításakor a szomszédos szakasz automatikusan igazodik;
- nem keletkezik energetikai számításnál hibás átfedés vagy kihagyott falhossz.

A kézzel módosított falszakaszok védetté válnak. Az automatikus újraelemzés csak az automatikus szakaszokat építi újra.

## Falszakasz megjelenítése

A falszakaszok külön overlay rétegen jelennek meg.

Színjelölés:

- külső fal: narancs;
- belső fal: sötétszürke;
- fűtetlen tér: sárga;
- talajjal érintkező: barna;
- szomszédos épület: lila;
- aktív falszakasz: cián.

A kijelölt falszakasznál megjelenik:

- szakaszhossz;
- falvastagság;
- két végpontjelölés.

## Falhoz kötött nyílászárók

A nyílászáró csak kiválasztott falszakaszra hozható létre.

Munkafolyamat:

1. Nyílászárók munkalap megnyitása.
2. Falszakasz kijelölése a rajzon vagy a listában.
3. `Nyílászáró hozzáadása erre a falra`.
4. Méret és szerkezeti adatok megadása.
5. Elhelyezés beállítása a falon százalékosan vagy csúszkával.

Nyílászáró-típusok:

- ablak;
- ajtó;
- erkélyajtó;
- garázskapu.

Rögzíthető adatok:

- megnevezés;
- szélesség;
- magasság;
- parapetmagasság;
- hely a falszakaszon;
- keret;
- üvegezés / szerkezet;
- U-érték;
- árnyékolás;
- megjegyzés.

A nyílászáró a falon grafikus megszakításként és vonaljelként jelenik meg.

## Automatikus nyílászáró-tájolás

A nyílászáró tájolása nem külön kézi mező.

A rendszer a következőkből számolja:

- a falszakasz helyiségoldala;
- az alaprajz északi szöge.

Példa:

- lap teteje É;
- alsó falszakasz → D · 180°;
- lap teteje K irányra forgatva;
- ugyanaz az alsó falszakasz → Ny · 270°.

Az irány és az azimut azonnal frissül a tájolás módosításakor, így közvetlenül használható WinWatt-adatbevitel előkészítésére.

## Helyiség- és hibapont-regresszió

A papírlap fizikai léptékes transzformációja mellett is megmaradt:

- helyiségek fogd és húzd mozgatása;
- Bluetooth-lézeres méretbevitel;
- automatikus alapterület;
- HJ hibapontok;
- helyiséghez kötött hibapont együttmozgatása;
- tájolási keret;
- mobil/tablet működés.

## Új fájlok

- `components/property-survey/propertySurveyBuildingModel.ts`
- `components/property-survey/PropertySurveyPlanToolbar.tsx`
- `components/property-survey/PropertySurveyWallPanel.tsx`
- `components/property-survey/PropertySurveyOpeningPanel.tsx`

## Módosított fájlok

- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Biztonsági mentés

```text
backups/ingatlanfelmero_v030_floor_wall_opening_20260727_120853
```

Production rollback:

```text
/root/dimprover/.next_before_ingatlan_v030_20260727_133339
```

## Teszteredmények

- TypeScript: sikeres;
- érintett fájlok ESLint: 0 hiba, 0 figyelmeztetés;
- teljes futó `app` és `components` forráslint: 0 hiba, más modulokban korábban meglévő figyelmeztetések;
- production build: sikeres, exit code 0;
- 122 standalone statikus chunk ellenőrizve;
- candidate asset audit: 12/12 sikeres;
- éles főoldali asset audit: 13/13 sikeres;
- éles Ingatlanfelmérő asset audit: 12/12 sikeres;
- v0.2.2 → v0.3.0 helyi adatmigráció: sikeres;
- A4 álló: sikeres;
- A3 fekvő: sikeres;
- A2 fekvő: sikeres;
- automatikus léptékváltás A4 1:50 / A2 1:20: sikeres;
- kézi túl nagy lépték figyelmeztetés és lapvágás: sikeres;
- pince, földszint és emelet sorrendje: sikeres;
- −3,00 / 0,00 / +3,00 m szintmagasság: sikeres;
- szintenkénti helyiségszűrés: sikeres;
- üres emeleti lap: sikeres;
- részleges külső/belső falszakasz automatikus felismerése: sikeres;
- falszakasz típus és 45 cm falvastagság mentése: sikeres;
- falszakasz felezése: sikeres;
- kézi szakaszhatár hézagmentes szomszédigazítása: sikeres;
- falhoz kötött 1,50 × 1,40 m nyílászáró: sikeres;
- nyílászáró grafikus megjelenítése: sikeres;
- automatikus D 180° → Ny 270° tájolásfrissítés: sikeres;
- helyiségmozgatás az új laptranszformációban: sikeres;
- kapcsolt HJ hibapont együttmozgatása: sikeres;
- desktop, tablet és mobil: nincs vízszintes overflow;
- JavaScript- és hálózati hiba: nincs;
- PM2 `dimprover`: online;
- `app.dimpro.hu/ingatlanfelmero`: helyesen loginra irányít.

## Smoke ellenőrzés megjegyzése

A projektgyökérre futó globális `npm run lint` a több száz archív ZIP-, backup- és munkafájl miatt elérte a Node 2 GB-os heapkorlátját.

Ez nem alkalmazáskód-hiba. A tényleges futó `app` és `components` TypeScript/TSX forráskészlet külön, emelt memóriakerettel és kötegelve ellenőrzésre került:

- lint hiba: 0;
- korábban meglévő figyelmeztetések más modulokban maradtak.

## Ismert korlátok

- a helyiségek továbbra is téglalap alapúak;
- ferde, íves és szabad poligonfal még nincs;
- a falvastagság adatként és overlay-vonalvastagságként jelenik meg, még nem készít automatikus belső/külső kettős falsíkot;
- a szintmagasság alapértelmezetten 3,00 m, külön numerikus szerkesztő még nincs;
- a lapbeállítás még nem készít végleges A4/A3/A2 PDF nyomtatási exportot;
- az energetikai nettó falfelület és nyílászáró-levonás összesítője még nincs kész;
- helyiségmozgatás vagy méretváltozás után az automatikus falhatárok a `Falhatárok újraelemzése` gombbal frissíthetők;
- a projekt- és felmérésadatok továbbra is localStorage-ban tárolódnak;
- a közvetlen WinWatt fájlexport még nincs implementálva.

## Következő fejlesztési javaslat

1. Nettó külső falfelület és nyílászáró-levonás automatikus energetikai összesítője.
2. Födém-, padló-, tető- és szintközi határolások szintenkénti modellje.
3. Falvastagságból számított belső és külső falsík.
4. Közös falak kétirányú összekapcsolása a szomszédos helyiségek között.
5. Nyílászárók Bluetooth-lézeres szélesség-, magasság- és parapetmérése.
6. Végleges A4/A3/A2 PDF felmérési lap export.
7. WinWatt adatbeviteli összesítő és exportformátum vizsgálata.
8. Poligonális, ferde és íves helyiségek.
9. Szerveres projekt-, szint-, fal- és nyílászáró-adatbázis.
