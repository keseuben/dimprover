# DIMPRO Drop · Terep – PWA konszolidáció és P5–P6

Dátum: 2026-08-17  
Állapot: DEV implementáció / release candidate

## Termék- és PWA-döntés

A Terepi Gyorsrögzítő felhasználói neve: **Terep**.

A Terep külön Context Module és külön capture adatmodell marad, de nem kap külön telepítendő PWA-t. A kanonikus felhasználói útvonal:

- DEV: `https://drop.dev.dimpro.hu/terep`
- PROD később: `https://drop.dimpro.hu/terep`

A DIMPRO Drop PWA közös shellje kezeli:

- DIMPRO Send
- Gyors KépSend
- Beküldőkapu
- Terep
- Csomag / Drop Tér

A Drop landing hero részén a `DIMPRO Send` és `Beküldőkapu` mellett külön **Terep** CTA jelenik meg. Mobilon a Drop gyorsmenüben és alkalmazásmenüben is külön Terep belépési pont van. A Drop PROD és DEV manifest Terep shortcutot tartalmaz.

A régi `/field-capture` útvonal kompatibilitási redirectként megmarad és a megfelelő Drop host `/terep` útvonalára irányít. A korábbi külön Field Capture manifest/service-worker nincs többé a route layoutból regisztrálva. A régi statikus asseteket átmenetileg nem töröljük, hogy egy esetleg korábban telepített DEV kliens ne kapjon azonnali 404-et.

## Licenc és azonosítás – MVP

A Terep jelenleg **ugyanazt a DIMPRO Send entitlementet használja**, mint a Send és Gyors KépSend. Nem jön létre külön Terep-licenc.

Belépési folyamat:

`Drop PWA → Terep → meglévő Send-kód → Identity Core verify → rövid életű Send session → Terep shell`

A Drop PWA által korábban megjegyzett Send-kód ugyanabból a meglévő helyi kulcsból használható. A rövid életű Send session token csak memóriában kerül a Terep shellbe, az IndexedDB capture queue nem tárolja.

Később üzleti csomagolás esetén ugyanazon entitlementen külön `canUseFieldCapture` / hasonló feature flag hozzáadható, de ehhez nem szükséges új licencrendszer.

## P5 – GPS adapter

A GPS képenként külön kapcsolható és alapból KI.

Rögzített strukturált mezők:

- latitude
- longitude
- accuracyMeters
- capturedAt
- source
- status
- detail

Forrás MVP-ben: `browser-geolocation`.

A rendszer `enableHighAccuracy: true` beállítást használ. 50 méternél rosszabb pontosság `LOW_ACCURACY` státuszt kap. A felhasználói kártyán például `GPS ±8 m` vagy `GPS ±83 m · gyenge` jelenik meg.

A GPS mérés aszinkron. A kép előbb `LOCAL_ONLY` állapotban bekerül a helyi queue-ba, ezért GPS hiba, permission denial vagy timeout nem akadályozhatja a fénykép mentését.

A képkártyán külön **GPS újramérés** művelet érhető el.

## P6 – tájolás / heading adapter

A tájolás a GPS-től független kapcsoló és alapból KI.

MVP forrás: Device Orientation API:

- `deviceorientationabsolute`
- fallback `deviceorientation`
- iOS/WebKit: `webkitCompassHeading`, `webkitCompassAccuracy`
- iOS permission: `DeviceOrientationEvent.requestPermission()` felhasználói műveletből

Rögzített mezők:

- headingDegrees
- headingAccuracyDegrees
- directionLabel
- capturedAt
- source
- status
- detail

Irányjelölések: É, ÉK, K, DK, D, DNy, Ny, ÉNy.

Példa UI: `ÉK · 43°`. Nem abszolút vagy rossz pontosságú mérés `UNSTABLE` státuszt kap, és a felület bizonytalanságot jelez.

A képkártyán külön **Tájolás újramérés** művelet van.

## Offline és adatbiztonság

A `dimpro-field-capture-v1` IndexedDB queue továbbra is a capture offline source of truth.

Újonnan megőrzi a strukturált location és orientation rekordokat is. Régebbi P0–P4 lokális rekordok visszaállításánál kompatibilis fallback működik.

A queue továbbra sem tárol:

- nyers Send session tokent
- upload capability tokent
- PIN-t

A GPS és tájolás nem kerül source-of-truth adatként EXIF-be; külön capture rekordban marad.

## P0–P6 minőségi kapuk

Forrásoldali kapuk a release előtt:

- Terep acceptance: 51/51 PASS
- TypeScript: PASS
- célzott ESLint: PASS
- `git diff --check`: PASS

Következő kapu: Next build → DEV cutover → Drop/Terep smoke → mobil browser acceptance → fizikai Samsung/PWA acceptance.

## Következő fejlesztési lépések

1. P0–P6 DEV fizikai Samsung/PWA teszt.
2. P7 saját field-capture szerver session/item API.
3. Shared Drop multipart upload adapter bekötése a capture assetekhez.
4. A már elkészített capture schema draft biztonságos migrációs útjának rendezése; automatikus DB futtatás továbbra sincs.
5. P8 Saját DIMPRO Drive külön ownership/reference.
6. P9 Projektkapu Drive külön ownership/reference és projektjogosultság.
7. P10–P12 szerveres sync, audit, riport/export és terepi teljes acceptance.
