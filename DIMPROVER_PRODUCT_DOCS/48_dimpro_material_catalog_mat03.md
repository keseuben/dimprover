# DIMPRO Anyag- és Terméktörzs MAT-0.3 – Katalógus és rétegrendi anyagválasztó

Dátum: 2026-07-29
Dev Center verzió ID: version_9b335fc6-878

## Cél

A MAT-0.3 a korábbi anyagdomainre hárompaneles katalógus-UI-t és a Felmérő rétegrendjeibe kapcsolt MaterialPickert épít.

A központi alapelv változatlan:

> Nem minden beolvasott adat válik központi DIMPRO-adattá.

A 25 fejlesztési minta továbbra is privát, draft, unverified, `importStaging` adat. Nem publikálható, és nem tekinthető szakmai anyagadatbázisnak.

## Projektanyag-munkatér

Új projektkapcsolt rekord:

```text
MaterialWorkspaceState
```

Tartalma:

- projekt saját katalógusa;
- projekt saját anyagai;
- saját forráscsomagok;
- kedvencek;
- legutóbb használt anyagok;
- séma- és időbélyeg.

A projektkatalógus `projectId` mezője automatikusan az aktuális Felmérő-projekthez igazodik. A v0.6.x projektek automatikusan üres, projektkapcsolt anyagteret kapnak.

## Hárompaneles katalógus

### Bal panel

- ékezetfüggetlen kereső;
- összes anyag;
- kedvencek;
- legutóbb használt;
- projekt saját anyagok;
- kategóriafa;
- saját anyag létrehozása.

### Középső panel

- találati lista;
- anyagnév;
- kategória;
- λ-érték;
- ellenőrzöttségi állapot;
- projektanyag vagy fejlesztési adat jelölése.

### Jobb panel

- anyag- és terméknév;
- típus;
- státusz;
- láthatóság;
- ellenőrzöttség;
- λ, sűrűség, fajhő, μ és alapvastagság;
- verzió;
- forráscsomag;
- licencállapot;
- továbbadási jogosultság;
- kedvenc;
- saját másolat;
- réteghez kiválasztás.

## Saját projektanyag

Kötelező mezők:

- név;
- kategória;
- pozitív λ-érték;
- adatforrás vagy becslési megjegyzés.

Opcionális:

- alapvastagság;
- sűrűség;
- fajhő;
- μ.

A rekord:

```text
kind = userDefined
visibility = project
publicationStatus = draft
verificationStatus = unverified
licenseStatus = userOwned
redistributionAllowed = false
```

Hiányos név, kategória, λ vagy forrásmegjelölés domain-szinten is elutasításra kerül.

## Saját másolat

Bármely használható λ-értékű katalógusrekord projektmásolata létrehozható. A másolat:

- új anyag- és verzióazonosítót kap;
- projektláthatóságú;
- unverified;
- saját, `userOwned` forráscsomagot kap;
- nem módosítja az eredeti rekordot;
- nem válik központi katalógusadattá.

## Rétegrendi MaterialPicker

A rétegrend minden rétegén megjelenik az **Anyagtörzs** gomb.

Kiválasztáskor a rétegbe kerül:

```text
materialId
materialVersionId
materialSnapshot
material
lambdaWmK
alapértelmezett vastagság, ha a réteg vastagsága még 0
```

A `materialSnapshot` megváltoztathatatlanul tárolja az alkalmazott anyagverziót és a kiválasztáskori tulajdonságokat.

## λ-felülírás

Ha a rétegen kézzel megadott λ eltér a kiválasztott anyagpillanatkép λ-értékétől:

- kötelező indoklásmező jelenik meg;
- indoklás nélkül a mező hibás állapotú;
- a Szerkezetek lépés hiányos marad;
- az indoklás a réteggel együtt mentődik;
- új anyag kiválasztásakor a korábbi felülírási indoklás törlődik.

## Mentés és migráció

A teljes `materialWorkspace` a `PropertySurveyDraft` része, ezért mentődik:

- LocalStorage munkatérbe;
- `.dimpro v0.7.1` munkafájlba;
- DIMPRO Drive projektverzióba;
- automatikus mentésbe.

A v0.6.x és v0.7.0 projektek anyagtér nélkül is megnyílnak, majd automatikusan projektkapcsolt alapállapotot kapnak.

## Responsive működés

- desktopon három oszlop;
- tableten és mobilon egymás alá rendezett panelek;
- külön belső görgetés desktopon;
- teljes oldalas, érintésbarát modal;
- minimum 40–44 px műveleti vezérlők;
- keresés, kiválasztás és sajátanyag-űrlap érintéssel használható.

## Érintett fájlok

```text
components/materials/domain/materialWorkspaceTypes.ts
components/materials/domain/materialTypes.ts
components/materials/ui/MaterialCatalogWorkspace.tsx
components/materials/adapters/materialToEnergyLayer.ts
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/PropertySurveyStructuresPanel.tsx
components/property-survey/PropertySurveyPage.tsx
scripts/test-material-workspace-mat03.cjs
scripts/test-property-survey-energy-v071-mat03.cjs
```

## Automatikus domain teszt

A projektanyag-munkatér 10 tesztje ellenőrzi:

- projektkapcsolt alapállapot;
- saját anyag státuszai;
- pozitív λ kötelezettsége;
- saját másolat;
- kedvenc ki- és bekapcsolása;
- legutóbbi lista sorrendje és egyedisége;
- migrációs normalizálás;
- pontos anyagverzió-pillanatkép;
- projektanyag kereshetősége;
- saját forrás és továbbadási tiltás.

A korábbi 16 MAT-0.2 domain teszt változatlanul fut.

## Ismert korlátok

- nincs szerveres PostgreSQL/Prisma katalógus;
- nincs többfelhasználós szervezeti katalógus;
- nincs admin jóváhagyási felület;
- nincs CSV/XLSX/WinWatt import UI;
- nincs gyártói termékcsomag;
- nincs szakmailag ellenőrzött központi generikus katalógus;
- a fejlesztési tesztanyagok energetikai eredményhez nem tekinthetők hiteles adatnak.

## Következő verzió

```text
MAT-0.4 – Import staging és admin ellenőrző felület
```

A MAT-0.4 csak fájlkaranténnal, forrás/licenc ellenőrzéssel, mezőtérképpel, duplikációvizsgálattal és emberi jóváhagyással készülhet.

## Candidate eredmények

```text
Production candidate build: BD5ZcvrDec8Ujku949Qa5
Projektanyag-domain teszt: 10/10
Korábbi anyagdomain teszt: 16/16
Összevont UI E2E: 15/15
Candidate assetaudit: 13/13 HTTP 200
```

Igazolt működés:

- hárompaneles katalógus;
- ékezetfüggetlen keresés és kategóriaszűrés;
- kedvencek és legutóbb használt anyagok;
- saját projektanyag és saját másolat;
- pontos anyagverzió-pillanatkép;
- indoklásköteles λ-felülírás;
- projektazonosítóhoz kötött anyagtér;
- v0.6.x automatikus migráció;
- ponttal és vesszővel megadott decimális λ;
- nyitott katalógus overflow nélkül 1194, 834 és 390 px szélességen;
- `.dimpro v0.7.1` mentés és újratöltés.

## Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: BD5ZcvrDec8Ujku949Qa5
PM2 process: dimprover
Állapot: online
Rollback: .next_before_energy_v071_mat03_20260729_084055
```

Éles ellenőrzések:

- HTTP 200;
- összevont v0.7.1/MAT-0.3 E2E: 15/15;
- `.dimpro v0.7.1` és geometriai séma: sikeres;
- saját anyag magyar tizedesvesszővel: sikeres;
- anyagkatalógus 1194, 834 és 390 px szélességen: sikeres;
- v0.6.x migráció: sikeres;
- tablet álló és fekvő érintésteszt: sikeres;
- éles assetaudit: 13/13 HTTP 200;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0.
