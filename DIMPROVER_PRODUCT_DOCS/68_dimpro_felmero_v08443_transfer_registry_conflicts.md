# DIMPRO Felmérő v0.8.4.4.3 – Több tervlapos átadási nyilvántartás és konfliktusvédelem

## Cél

A `v0.8.4.4.2` már át tudta adni egy tervlap jóváhagyott falait és nyílászáróit a központi energetikai modellbe. A `v0.8.4.4.3` ezt biztonságos, több dokumentumra és több oldalra kiterjedő szinkronizálási folyamattá fejleszti.

A fő célok:

- minden PDF-dokumentum minden oldalának külön átadási állapota legyen;
- a tervlapi forrás és a központi modell változásai külön felismerhetők legyenek;
- a központi modellben kézzel módosított elemek ne íródjanak felül automatikusan;
- a kétoldali változás külön konfliktusként jelenjen meg;
- minden átadási, felülírási, elfogadási és eltávolítási művelet auditálódjon;
- az átadott elemek eltávolítása csak egyértelmű megerősítés után történhessen meg.

## Sémakompatibilitás

A fő `.dimpro` séma változatlan:

```text
dimpro.property-survey.v0.8.4.3
```

A tervdokumentációs workspace séma szintén változatlan:

```text
dimpro.property-survey.plan-document.v1
```

Az új `transferRegistry` opcionális, normalizált mezőként kerül a meglévő `plan-document.v1` workspace-be. A régi projektek üres, `version: "1"` átadási nyilvántartással migrálódnak.

## Új domainmodell

A tervdokumentációs workspace új része:

```ts
transferRegistry: {
  version: "1";
  records: Record<pageId, SurveyPlanTransferRecord>;
  auditLog: SurveyPlanTransferAuditEntry[];
  updatedAt: string;
}
```

Minden tervlaphoz egy `SurveyPlanTransferRecord` tartozhat, amely tárolja:

- a dokumentum- és tervlapazonosítót;
- az aktuális átadási állapotot;
- az utolsó művelet típusát;
- az utolsó átadás azonosítóját és időpontját;
- a tervlapi forrás lenyomatát;
- a központi energetikai modell lenyomatát;
- a jóváhagyott forrásfalak és -nyílászárók azonosítóit;
- a központi falak, nyílászárók és hőhidak azonosítóit;
- az átadott elemek darabszámát.

## Átadási állapotok

A nyilvántartás az alábbi állapotokat kezeli:

- `notTransferred` – még nincs átadva;
- `synced` – a tervlap és a központi modell az utolsó elfogadott állapottal megegyezik;
- `sourceChanged` – a jóváhagyott tervlapi forrás megváltozott;
- `modelChanged` – a központi energetikai modell változott meg;
- `conflict` – a tervlap és a központi modell is megváltozott;
- `sourceRemoved` – a korábban átadott forráselemek a tervlapról eltűntek;
- `modelRemoved` – a központi modellből hiányoznak korábban átadott elemek;
- `removed` – az átadás megerősített eltávolítása megtörtént.

## Tartalmi lenyomatok

A rendszer nem csak időbélyeget ellenőriz. Determinisztikus tartalmi lenyomat készül a tervlapi és a központi modell adatairól.

### Tervlapi forráslenyomat

A jóváhagyott falaknál többek között szerepel:

- geometriai kezdő- és végpont;
- hossz, magasság, vastagság;
- tájolás;
- határolástípus;
- rétegrend;
- belső és másik oldali zóna;
- kapcsolt helyiségek.

A jóváhagyott nyílászáróknál szerepel:

- fal- és helyiségkapcsolat;
- típus, méretek, parapet és fal menti hely;
- keret és üvegezés;
- Uw/U-érték és adatforrás;
- g-érték;
- árnyékolás;
- katalógusprofil;
- beépítési hőhíd mód, Ψ-érték és forrás.

### Központi modell-lenyomat

A központi lenyomat tartalmazza:

- a tervlaphoz kapcsolt központi falszakaszokat;
- a mért falgeometriát és tájolást;
- a rétegrend- és zónakapcsolatot;
- a központi nyílászárókat;
- az energetikai nyílászáró-részleteket;
- a kapcsolt lineáris hőhidakat;
- a kézi módosítást jelző zárolási állapotot.

A jelenlegi lenyomat determinisztikus FNV-1a alapú technikai változásjelző. Nem kriptográfiai biztonsági hash és nem dokumentumhitelesítési eszköz.

## Központi modellvédelem

A tervből átadott központi fal vagy nyílászáró kézi szerkesztésekor:

- `planTransferLocked: true` kerül az elemre;
- a központi modell lenyomata megváltozik;
- a tervlap állapota `modelChanged` vagy kétoldali változásnál `conflict` lesz;
- a normál „Energetikai modell frissítése” művelet blokkolódik.

A rendszer ezért nem írja felül automatikusan:

- a kézzel javított falhosszt;
- a megváltoztatott falvastagságot vagy rétegrendet;
- a központi zónakapcsolatot;
- a kézzel pontosított nyílászárót;
- a központi energetikai Uw-, g- vagy hőhíd-adatokat.

## Konfliktusfeloldás

### Központi módosítás megtartása

A felhasználó elfogadhatja a központi modell kézi módosításait új összehasonlítási alapként.

Ekkor:

- a központi értékek változatlanul megmaradnak;
- a tervlap nem írja felül őket;
- új központi modell-lenyomat készül;
- `modelAccepted` auditbejegyzés jön létre;
- az állapot ismét `synced` lesz.

### Tervvel felülírás

A tervlapi forrás csak külön jelölőnégyzetes megerősítés után írhatja felül a központi modellt.

Ekkor:

- a jóváhagyott tervfalak és nyílászárók újra átadásra kerülnek;
- a központi kézi zárolás feloldódik;
- új forrás- és modell-lenyomat készül;
- `forcedOverwrite` auditbejegyzés jön létre;
- az állapot `synced` lesz.

## Több tervlapos nyilvántartási felület

A munkatér Adatok nézetében külön nyilvántartási panel jelenik meg.

A panel összesíti:

- a dokumentumok összes tervlapját;
- a szinkronban lévő oldalak számát;
- a változott oldalak számát;
- a konfliktusos oldalak számát;
- a figyelmet igénylő oldalak számát.

Minden oldalsor mutatja:

- a PDF fájlnevét;
- az oldalszámot és oldalcímkét;
- a kapcsolt szintet;
- az aktuális átadási állapotot;
- a tervfalak és tervnyílászárók számát;
- a központi falak számát;
- az utolsó átadás időpontját.

A sorra kattintva az adott dokumentum és oldal válik aktívvá.

## Auditnapló

Az auditnapló legfeljebb 250 bejegyzést őriz meg a workspace-ben.

Művelettípusok:

- `created` – első átadás;
- `updated` – normál frissítés;
- `forcedOverwrite` – megerősített tervfelülírás;
- `modelAccepted` – központi módosítás megtartása;
- `removed` – megerősített eltávolítás;
- `removalBlocked` – blokkolt eltávolítási kísérlet.

Minden bejegyzés tárolja:

- a tervlap és dokumentum azonosítóját;
- a művelet eredményét;
- az előtte és utána fennálló állapotot;
- a műveletazonosítót;
- a fal-, nyílászáró- és hőhíddarabszámot;
- a forrás- és modell-lenyomatot;
- az időpontot és a rövid leírást.

## Biztonságos eltávolítás

A tervlap átadásának eltávolítása külön előnézeti panelen történik.

A felület előre megmutatja:

- a törlendő falak számát;
- a törlendő nyílászárók számát;
- a törlendő hőhidak számát;
- a kézzel módosított, védett elemek számát.

Alapkövetelmény:

- az eltávolítást külön jelölőnégyzettel meg kell erősíteni.

Ha a központi modell kézzel módosított vagy konfliktusos:

- második, kényszerített eltávolítási megerősítés is szükséges.

Sikeres eltávolításkor:

- a tervlaphoz tartozó központi falak törlődnek;
- a kapcsolt központi nyílászárók törlődnek;
- a kapcsolt energetikai részletek és hőhidak törlődnek;
- a tervlapi javaslatok megmaradnak;
- az érintett helyiségek automatikus falmodellje helyreáll;
- `removed` auditbejegyzés készül.

## Fő érintett fájlok

- `components/property-survey/propertySurveyPlanDocumentTypes.ts`
- `components/property-survey/propertySurveyPlanTransferRegistry.ts`
- `components/property-survey/propertySurveyPlanTransferOperations.ts`
- `components/property-survey/propertySurveyBuildingModel.ts`
- `components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `scripts/test-property-survey-plan-transfer-registry-v08443.cjs`
- `scripts/test-property-survey-plan-document-v0843.cjs`

## Automatikus tesztek

- Történeti és új domain-/integrációs teszt: 517/517.
- Új átadási nyilvántartás domain teszt: 12/12.
- Leica DISTO BLE regresszió: 6/6.
- Candidate PDF tervlap, átadás, konfliktus és eltávolítás E2E: 29/29.
- Candidate energetikai E2E: 40/40 és 42/42.
- Candidate responsive regresszió: 15/15.
- Candidate PDF/DXF export: sikeres.
- Candidate tablet álló és fekvő nézet: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- Candidate build: `wM-Bo1myB7l9fURIOGRmF`.
- Forrásbackup: `backups/property_survey_v08443_transfer_registry_20260731_073102`.

## Korlátok

- A lenyomat nem digitális aláírás és nem dokumentumhitelesítés.
- Az auditnapló jelenleg a `.dimpro` projektállomány része, nem központi többfelhasználós szerveres eseménynapló.
- A konfliktusfeloldás tervlap-szinten működik; mezőnkénti vagy elemenkénti diff még nincs.
- A különböző tervverziók automatikus oldal- és elempárosítása még nincs kialakítva.
- Az OCR továbbra is külön későbbi fejlesztési szint.

## Következő fejlesztési irány

`v0.8.4.4.4` – tervverziók közötti oldal- és elempárosítás, vizuális és táblázatos változás-diff, részleges/elemenkénti elfogadás, valamint a régi és új tervverzió átadási kapcsolatának megőrzése.

A `v0.8.5` továbbra is a tényleges WinWatt-próbához fenntartott verzió.

## Élesítés

- Éles build: `wM-Bo1myB7l9fURIOGRmF`.
- Rollback: `.next_before_property_survey_v08443_20260731_082215`.
- Helyi és HTTPS smoke: 200 / 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles PDF tervlap, átadás, konfliktus és eltávolítás E2E: 29/29.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés és az éles regresszió alatt nem kapott új bejegyzést.
- Éles felület: `https://dimpro.hu/ingatlanfelmero`.
