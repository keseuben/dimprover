# DIMPRO Ingatlanfelmérő v0.2.2 – Helyiségméretek, mozgatás és Bluetooth mérésfogadás

Dátum: 2026-07-27

## Kiadás

- Modul: **DIMPRO Ingatlanfelmérő**
- Verzió: **v0.2.2**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Aktív production build: `XHJyumZkzA_EMat6DOl8f`

## Fejlesztési cél

A helyiség alaprajzi téglalapja ne csak közelítő rajzi alakzat legyen, hanem pontos helyszíni mérési adatokat fogadjon:

- külön hosszméret;
- külön keresztméret;
- külön belmagasság;
- automatikus alapterület-számítás;
- Bluetooth-lézeres mérési munkafolyamat;
- közvetlen helyiségmozgatás az alaprajzon;
- a helyiséghez kapcsolt hibapontok együttmozgatása.

## Helyiségméretek

Minden helyiséghez külön rögzíthető:

- **Hossz – vízszintes oldal** méterben;
- **Keresztméret – függőleges oldal** méterben;
- **Belmagasság** méterben.

A helyiség alapterülete automatikusan számolódik:

```text
alapterület = hossz × keresztméret
```

A méret módosításakor automatikusan frissül:

- a helyiség alapterülete;
- a helyiség rajzi szélessége és mélysége;
- a helyiség középpont körüli elhelyezése;
- a helyiségben megjelenő méretszöveg;
- a kijelölt helyiség külső méretvonala.

A kijelölt helyiségnél a rajzon külön megjelenik:

- vízszintes méretvonal;
- függőleges méretvonal;
- hossz × keresztméret felirat;
- alapterület;
- belmagasság.

## Korábbi helyiségek kompatibilitása

A korábban létrehozott helyiségek nem vesznek el akkor sem, ha még nincs külön `lengthMeters` és `widthMeters` mezőjük.

A rendszer a meglévő:

- alapterület;
- rajzi szélesség;
- rajzi mélység

alapján visszaszámítja a kezdeti hossz- és keresztméretet. A pontos adat első módosításkor vagy Bluetooth-méréskor külön mezőként mentődik.

## Mérési források

A hossz, keresztméret és belmagasság külön forrásadatot tárolhat:

- alaprajzon felrajzolva;
- kézzel megadva;
- Bluetooth billentyűzet módból;
- Bluetooth / DIMPRO natív bridge-ből;
- LiDAR / RoomPlan mérésből;
- importált alaprajzból.

Mezőnként tárolható:

- mérési forrás;
- mérés időpontja;
- mérőeszköz neve.

## Bluetooth-lézeres méretbevitel

### 1. Célmező kiválasztása

Választható cél:

- Hossz;
- Kereszt;
- Belmagasság.

A helyiségadatlap minden méretmezője mellett külön Bluetooth gomb található. A gomb megnyomása kiválasztja az adott célmezőt és elindítja a mérésfogadást.

### 2. Bluetooth billentyűzet mód

Az olyan távolságmérők, amelyek a mért számot Bluetooth billentyűzetként továbbítják, közvetlenül használhatók a fogadómezővel:

1. célméret kiválasztása;
2. `Mérés fogadása` aktiválása;
3. mérés indítása a lézeres távolságmérőn;
4. az érték a fókuszált DIMPRO mezőbe kerül;
5. Enter megnyomásával az érték alkalmazódik.

A mező magyar tizedesvesszőt és tizedespontot is elfogad.

### 3. DIMPRO natív bridge

A webes modul figyeli a következő böngészőeseményt:

```text
dimpro:property-survey-measurement
```

Az esemény adatmezői:

- `valueMeters`;
- opcionális `target`;
- opcionális `deviceName`;
- opcionális `measuredAt`.

Ezt később a következő adapterek használhatják:

- iPad/iOS RoomPlan segédalkalmazás;
- Android DIMPRO mérőadapter;
- Bosch gyártói adapter;
- Leica gyártói adapter;
- egyéb BLE vagy Bluetooth mérőkapcsolat.

### 4. Web Bluetooth eszközválasztó

Támogatott böngészőn megnyitható a böngésző saját Bluetooth-eszközválasztója. Az eszköz kiválasztása nem jelent automatikus gyártói protokolltámogatást; a mérési adat kiolvasásához továbbra is gyártói vagy DIMPRO adapterprofil szükséges.

Az iPad/Safari felületen a modul nem jelez hamis közvetlen Web Bluetooth kapcsolatot. Ott a Bluetooth billentyűzet mód vagy a későbbi natív iOS bridge használható.

## Helyiségmozgatás

A helyiségek közvetlenül mozgathatók:

1. koppintás vagy egérlenyomás a helyiségen;
2. a helyiség húzása;
3. felengedés a kívánt pozícióban.

Működési szabályok:

- a helyiség a rajzi munkaterületen belül marad;
- a háttér húzása továbbra is alaprajzi pan művelet;
- helyiségrajzolási és hibapont-elhelyezési módban a helyiségmozgatás nem indul el;
- a kijelölt helyiség `cursor-move` viselkedést és mozgatási jelzést kap;
- a rajz alján külön rövid használati súgó jelenik meg.

## Kapcsolt hibapont együttmozgatása

Ha a helyiséghez HJ hibapont tartozik, a helyiség mozgatásakor a hibapont is ugyanazzal az eltolással mozdul.

A hibapont továbbra is normalizált százalékos koordinátában tárolódik, ezért az alaprajz átméretezése és exportja során is stabil marad.

## Adatmodell

A `SurveyRoom` új opcionális mezői:

- `lengthMeters`;
- `widthMeters`;
- `dimensionSource`;
- `measuredAt`;
- `measurementDevice`;
- `lengthSource`;
- `widthSource`;
- `heightSource`;
- `lengthMeasuredAt`;
- `widthMeasuredAt`;
- `heightMeasuredAt`;
- `lengthDevice`;
- `widthDevice`;
- `heightDevice`.

JSON export séma:

```text
dimpro.property-survey.v0.2.2
```

## Új fájlok

- `components/property-survey/PropertySurveyMeasurementPanel.tsx`
- `components/property-survey/propertySurveyRoomDimensions.ts`
- `components/property-survey/propertySurveyMeasurementBridge.ts`

## Módosított fájlok

- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Biztonsági mentés

```text
backups/ingatlanfelmero_v022_dimensions_bluetooth_20260727_111811
```

Production rollback:

```text
/root/dimprover/.next_before_ingatlan_v022_20260727_115254
```

## Teszteredmények

- TypeScript: sikeres;
- érintett fájlok ESLint: 0 hiba, 0 figyelmeztetés;
- teljes futó `app` és `components` forráslint: 0 hiba, más modulokban korábban meglévő figyelmeztetések;
- candidate production build: sikeres, exit code 0;
- 123 standalone statikus chunk ellenőrizve;
- candidate asset audit: 12/12 sikeres;
- éles főoldali asset audit: 13/13 sikeres;
- éles Ingatlanfelmérő asset audit: 12/12 sikeres;
- 4,00 × 3,00 m korábbi helyiségméret visszaszámítása: sikeres;
- kézi hosszbevitel 5,00 m-re: sikeres;
- automatikus 15,00 m² alapterület: sikeres;
- Bluetooth billentyűzetes 3,50 m keresztméret: sikeres;
- automatikus 17,50 m² alapterület: sikeres;
- DIMPRO natív bridge 2,85 m belmagasság: sikeres;
- mérési forrás és eszköznév mentése: sikeres;
- helyiség húzással mozgatása: sikeres;
- HJ-001 hibapont együttmozgatása: sikeres;
- vízszintes és függőleges méretvonal megjelenítése: sikeres;
- desktop, tablet és mobil: nincs vízszintes overflow;
- JavaScript- és hálózati hiba: nincs;
- PM2 `dimprover`: online;
- `app.dimpro.hu/ingatlanfelmero`: helyesen a login oldalra irányít.

## Smoke ellenőrzés megjegyzése

A beépített `npm run lint` a projektgyökérben található nagy mennyiségű ZIP-, backup- és munkafájl vizsgálata miatt elérte a Node 2 GB-os heapkorlátját. Ez nem alkalmazáskód-hiba.

A tényleges futó `app` és `components` TypeScript/TSX forráskészlet külön, emelt memóriakerettel és kötegelve ellenőrzésre került. Eredmény: 0 lint hiba.

## Ismert korlátok

- a közvetlen Bosch- és Leica-adatprotokoll még nincs implementálva;
- az iPad közvetlen mérésátviteléhez natív iOS bridge szükséges;
- a Web Bluetooth eszközválasztás csak eszközkiválasztást végez, nem automatikus méréskiolvasást;
- a kézi helyiség jelenleg téglalap alakú;
- nincs még külön falszakasz-, átló- vagy többpontos mérési mód;
- a helyiség méretének grafikus sarokfogantyús átméretezése későbbi fejlesztés;
- a projektadatok továbbra is localStorage-ban működnek.

## Következő fejlesztési javaslat

1. Bosch és Leica adapterprofilok műszaki vizsgálata és prototípusa.
2. iOS/Android DIMPRO Measurement Bridge.
3. Falszakasz, átló, nyílászáró és belmagasság mérési sorozat.
4. Automatikus következő célmező: hossz → kereszt → belmagasság.
5. Sarokfogantyús helyiség-átméretezés.
6. Helyiségek illesztése, közös fal és mágneses csomópontok.
7. Több szint és teljes épületkontúr.
8. Szerveres projekt- és mérési adatbázis.
