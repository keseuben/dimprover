# DIMPRO Felmérő – Leica DISTO D2 közvetlen Bluetooth adapter

## Verzió

`v0.8.4.4.1.1 – Leica DISTO D2 közvetlen BLE-adapter`

## Cél

A DIMPRO Felmérő Androidos Google Chrome alatt közvetlenül fogadja a Leica DISTO D2 Bluetooth Smart mérési értékeit. A mérés nem csak az eszközválasztóig jut el: valódi GATT-kapcsolat jön létre, a mérési karakterisztika értesítéseire feliratkozunk, majd az érkező távolság automatikusan a kijelölt helyiségméret-mezőbe kerül.

## Elkészült funkciók

- Leica DISTO BLE szolgáltatás és távolságkarakterisztika kezelése.
- Web Bluetooth eszközválasztó `DISTO` névelőtaggal és Leica szolgáltatásszűrővel.
- Valódi Bluetooth GATT-kapcsolat létrehozása.
- Mérési szolgáltatás és távolságkarakterisztika megnyitása.
- `characteristicvaluechanged` értesítések fogadása.
- A négybájtos, little-endian `Float32` mérési érték átalakítása méterre.
- Automatikus bevitel a kijelölt Hossz, Keresztméret vagy Belmagasság mezőbe.
- Mérési adatforrás naplózása `Leica DISTO Bluetooth` néven.
- Kapcsolatbontás és `gattserverdisconnected` esemény kezelése.
- Részletes Web Bluetooth hibaüzenetek: megszakított eszközválasztás, jogosultsági hiba, GATT hálózati hiba, nem támogatott szolgáltatás és hibás kapcsolatállapot.
- Web Bluetooth nélküli böngészőn a billentyűzetes és későbbi natív bridge működésének megőrzése.

## Érintett fájlok

- `components/property-survey/bluetooth/leicaDistoBle.ts`
- `components/property-survey/PropertySurveyMeasurementPanel.tsx`
- `components/property-survey/propertySurveyRoomDimensions.ts`
- `components/property-survey/PropertySurveyPage.tsx`
- `scripts/test-property-survey-leica-disto-v084411.cjs`

## Ellenőrzés

- TypeScript: sikeres.
- Célzott ESLint: sikeres.
- Leica DISTO BLE domain- és bekötési teszt: 6/6.
- Az aktív production build tartalmazza a Leica szolgáltatás UUID-jét és a közvetlen csatlakozási kódot.
- Éles felület: HTTP 200.
- Aktív build: `E136JN8RSPqVPyDWRThJR`.

## Használat

1. Androidos tableten Google Chrome-ban meg kell nyitni a `https://dimpro.hu/ingatlanfelmero` felületet.
2. Az Alaprajz munkalapon ki kell választani egy helyiséget.
3. Ki kell jelölni a Hossz, Keresztméret vagy Belmagasság célmezőt.
4. A `Leica csatlakoztatása` gombbal ki kell választani a `DISTO 51575411` eszközt.
5. Sikeres kapcsolat esetén a felület ezt jelzi: `Leica DISTO D2 csatlakoztatva. A DIMPRO közvetlenül fogadja a mérési értéket.`
6. A DISTO mérés gombjának megnyomásakor az érték automatikusan bekerül az aktív célmezőbe.

## Biztonsági megjegyzés

A Web Bluetooth csak HTTPS-környezetben és közvetlen felhasználói gombnyomás után engedélyezi az eszközválasztást. iPad/Safari alatt közvetlen Web Bluetooth kapcsolat nem áll rendelkezésre; ott később DIMPRO natív bridge szükséges.

## Backup

`backups/property_survey_leica_disto_devcenter_20260731_055341`
