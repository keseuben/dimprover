# DIMPRO Energetikai Anyag- és Terméktörzs – MAT-0.1/MAT-0.2

Dátum: 2026-07-29

## Cél

A fejlesztés eredménye egy közös, több DIMPRO-modul által később használható anyagdomain alapja:

> DIMPRO Anyag- és Terméktörzs

Az első kiadás kizárólag domainmodell, forrás- és licenckezelés, fejlesztési tesztkatalógus, keresés, validáció és számítási pillanatkép. Nem központi kereskedelmi anyagadatbázis.

## Anyag és termék elkülönítése

Objektumtípusok:

```text
generic              Generikus anyag
manufacturerProduct  Gyártói termék
userDefined           Felhasználói saját anyag
```

A gyártói termékhez később gyártó, termékkód, műszaki adatlap, teljesítménynyilatkozat, érvényesség és termékverzió tartozik.

## Adatszintek

A rendszer külön kezeli:

1. **nyers anyagtulajdonság** – például sűrűség, fajhő, λ, μ;
2. **rétegadat** – például anyagverzió és vastagság;
3. **szerkezeti eredmény** – például R, Sd, U és páratechnikai eredmény.

A szerkezeti eredmény nem kerül anyagállandóként a katalógusba.

## Státuszdiagram

```text
Anyagrekord:
draft → reviewRequired → approved → published
                        ↘ deprecated → withdrawn

Importrekord:
uploaded → parsed → mappingRequired → reviewRequired → approved
                           ↘ validationFailed          ↘ rejected

Fejlesztési tesztanyag:
importStaging + private + draft + unverified
→ központi publikálás technikailag és licenc alapján tiltott
```

## Katalógusok és láthatóság

Katalógus scope-ok:

```text
dimproCentral
organization
user
project
importStaging
```

Láthatóság:

```text
private
organization
project
public
```

Felhasználói vagy WinWatt-import nem emelhető automatikusan központi katalógusba.

## Forrás- és licencmodell

Minden anyagverzióhoz kötelező `sourcePackageId` tartozik.

Licencállapotok:

```text
unknown
internalOnly
userOwned
permissionRequested
licensed
openLicense
publicationProhibited
```

Központi publikálás csak akkor engedhető, ha egyszerre teljesül:

```text
redistributionAllowed = true
commercialUseAllowed = true
licenseStatus = licensed vagy openLicense
```

A MAT-0.2 fejlesztési forráscsomag:

```text
licenseStatus = internalOnly
redistributionAllowed = false
commercialUseAllowed = false
```

Ezért a tesztadatok nem publikálhatók.

## Három elkülönített adatfolyam

```text
A. Saját felhasználói import
   Privát felhasználói vagy szervezeti katalógus.

B. DIMPRO fejlesztési minta
   Tesztelésre, importStaging scope-ban, publikálás tiltva.

C. DIMPRO központi katalógus
   Csak igazolt forrással, licenccel és szakmai jóváhagyással.
```

## Import staging terv

```text
Fájl feltöltése
→ karantén
→ MIME és kiterjesztés
→ hash
→ vírusellenőrzés
→ parser
→ nyers staging
→ mezőtérkép
→ egységkonverzió
→ validáció
→ duplikációvizsgálat
→ emberi ellenőrzés
→ privát vagy engedélyezett katalógus
```

Az ismeretlen mezők a `rawData`/`rawProperties` blokkban megmaradnak, de automatikusan nem kerülnek számításba.

## Kategóriafa

Az első kategóriafa 20 fő és alkategóriát tartalmaz, többek között:

- beton és vasbeton;
- falazóanyagok;
- pórusbeton;
- mészhomoktégla;
- vakolat és habarcs;
- esztrich;
- EPS és grafitos EPS;
- XPS;
- ásványgyapot;
- PIR/PUR;
- fa és faalapú lap;
- gipsztermék;
- burkolat;
- feltöltés;
- talaj;
- légréteg;
- vízszigetelés;
- fém;
- üveg;
- egyéb anyag.

## Fejlesztési tesztkatalógus

JSON-adatforrás:

```text
components/materials/catalog/data/developmentMaterials.json
```

Tartalma:

- 25 fiktív/fejlesztési rekord;
- `developmentOnly = true`;
- minden megnevezés „Fejlesztési minta” előtagú;
- minden rekord privát, draft és unverified;
- minden értékhez figyelmeztetés tartozik;
- energetikai szakmai számításhoz nem használható.

A számértékek kizárólag a keresés, validáció, verziózás és pillanatkép automatikus tesztelését szolgálják.

## Kereső és szűrő

Támogatott:

- ékezetfüggetlen névkeresés;
- termékkód és alternatív név;
- kategória;
- anyagtípus;
- ellenőrzöttség;
- λ minimum és maximum;
- pontos anyag- és verzióazonosító keresése.

## Validáció

Rekordszint:

- név;
- kategória;
- anyag–verzió kapcsolat;
- gyártói terméknél gyártó;
- publikációs státusz és láthatóság.

Tulajdonságszint:

- pozitív λ;
- pozitív sűrűség;
- pozitív fajhő;
- pozitív μ;
- kötelező forráscsomag;
- unverified adat számítási figyelmeztetése.

Forrásszint:

- forrásnév;
- licencállapot;
- publikációs jog;
- kötelező forrásmegjelölés.

## Megváltoztathatatlan számítási pillanatkép

A `freezeMaterialSnapshot()` rögzíti:

- anyag- és verzióazonosítót;
- megjelenített nevet;
- gyártót és termékkódot;
- sűrűséget és fajhőt;
- felhasznált λ-értéket és forrását;
- μ-értéket;
- forráscsomagot;
- ellenőrzöttséget;
- rögzítés időpontját.

A pillanatkép `Object.freeze()` segítségével megváltoztathatatlan.

λ-felülírás esetén kötelező az indoklás. A pillanatkép `lambdaSource = custom` jelölést kap.

## Rétegrendi kompatibilitás

A meglévő `SurveyAssemblyLayer` visszafelé kompatibilisen bővült:

```text
materialId?
materialVersionId?
materialSnapshot?
lambdaOverrideReason?
```

A régi, csak szöveges anyagnevet és λ-értéket tartalmazó projektek továbbra is megnyílnak.

## Későbbi Prisma-modell terv

```text
MaterialCatalog
MaterialCategory
MaterialManufacturer
MaterialRecord
MaterialVersion
MaterialSourcePackage
MaterialSourceDocument
MaterialLicenseGrant
MaterialImportBatch
MaterialImportRow
MaterialAlias
MaterialAuditEntry
ProjectCustomMaterial
EnergyMaterialSnapshot
```

Adatbázis-szabályok:

1. kiadott anyagverzió nem írható felül;
2. módosításkor új verzió készül;
3. régi számítás a korábbi verzióra mutat;
4. törlés helyett archiválás vagy visszavonás;
5. forrás és licenc kötelező;
6. privát import nem publikálható automatikusan;
7. gyártói termék megszűnése nem töri el a régi projektet.

## Érintett fájlok

```text
components/materials/domain/*
components/materials/catalog/*
components/materials/validation/*
components/materials/versioning/*
components/materials/adapters/*
components/energy/materials/*
components/property-survey/propertySurveyEnergyModel.ts
scripts/test-energy-material-domain.cjs
```

## Automatikus tesztek

A MAT-0.2 domain teszt jelenleg 16 ellenőrzést futtat:

- alap energetikai beállítás;
- évnormalizálás;
- jelentős felújítás figyelmeztetés;
- tanúsítvány-előkészítés korlátozása;
- szabálycsomag számítás nélküli állapota;
- 25 rekordos katalógus;
- publikálás tiltása;
- privát/draft/unverified státusz;
- ékezetfüggetlen keresés;
- kategóriaszűrés;
- λ-szűrés;
- számítási figyelmeztetés;
- hiányzó λ blokkolása;
- megváltoztathatatlan snapshot;
- indoklás nélküli λ-felülírás tiltása;
- indokolt λ-felülírás rögzítése.

## Ismert korlátok

- nincs központi PostgreSQL/Prisma katalógus;
- nincs katalógus admin UI;
- nincs CSV/XLSX import;
- nincs WinWatt-import;
- nincs gyártói termékcsomag;
- nincs szakmailag ellenőrzött generikus alapkatalógus;
- nincs nyilvános anyagadat;
- nincs végleges U-érték-motor;
- nincs automatikus gyártói PDF-feldolgozás;
- nincs AI-alapú tulajdonságkitöltés.

## Következő fejlesztési kör

```text
MAT-0.3 – Katalógus és anyagválasztó UI
```

Tervezett kimenet:

- hárompaneles katalógus;
- kategóriafa;
- kereshető/szűrhető anyagtábla;
- részlet-, forrás- és verziópanel;
- rétegrendi MaterialPicker;
- saját anyag létrehozása;
- meglévő anyag másolása;
- kedvencek és legutóbb használt anyagok.

## Candidate eredmények

```text
Production candidate build: tm7qdRVfJJNOhOs0mViBL
Domain teszt: 16/16
Fejlesztési JSON-rekord: 25
Candidate assetaudit: 13/13 HTTP 200
```

A tesztek igazolták a publikációs tiltást, az ékezetfüggetlen keresést, a kategória- és λ-szűrést, a hibás tulajdonság blokkolását, a verzióhivatkozást, a megváltoztathatatlan pillanatképet és az indoklásköteles λ-felülírást.

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: tm7qdRVfJJNOhOs0mViBL
PM2 process: dimprover
Dev Center verzió ID: version_b50297be-afc
Állapot: online
Rollback: .next_before_energy_v070_mat02_20260729_071452
```

Éles ellenőrzések:

- HTTP 200;
- energetikai munkatér E2E: 16/16;
- `.dimpro` séma és mentés: sikeres;
- v0.6.x migráció: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.
