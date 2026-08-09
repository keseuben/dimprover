# DIMPRO Felmérő v0.8.4.4.6 – Tervverzió-gráf, alkalmazási előzmények és több rollback-pont

## Cél

A `v0.8.4.4.5` egy tervverzió-összehasonlítás aktuális központi modellátvezetését és egy rollback-pillanatképet kezelt. A `v0.8.4.4.6` ezt több egymást követő tervverzióra és több alkalmazási eseményre bővíti.

A fejlesztés eredménye:

- több PDF tervrevízió közös verziógráfban követhető;
- az `R00 → R01 → R02` és hasonló láncok automatikusan levezethetők;
- a tervverziók közötti elágazások és hibás ciklusok láthatók;
- minden központi modellátvezetés külön előzményrekordot kap;
- korábbi alkalmazási állapot is kiválasztható és visszaállítható;
- a korábbi rollback a kiválasztott pont utáni alkalmazási láncot is lezárja;
- a teljes modellpillanatképek deduplikált snapshot-tárban szerepelnek;
- legfeljebb nyolc aktív rollback-pont marad meg, a régebbi események auditként továbbra is láthatók;
- a projektfájl mérete és a deduplikáció becsült megtakarítása a felületen látható.

## Változatlan sémák

- Fő `.dimpro` séma: `dimpro.property-survey.v0.8.4.3`.
- Tervdokumentációs séma: `dimpro.property-survey.plan-document.v1`.
- A régi projektfájlok automatikus normalizálással nyílnak meg.
- Nincs külön adatbázis-migráció.

## Verziógráf

Új motor:

`components/property-survey/propertySurveyPlanVersionGraph.ts`

A gráf forrásai:

- dokumentum `versionGroupId`;
- dokumentum `supersedesDocumentId`;
- tervverzió-összehasonlítások;
- központi modellalkalmazási előzmények.

A gráfcsomópont megmutatja:

- dokumentum- és revízióazonosító;
- kiadási dátum;
- gráfmélység;
- előd- és utóddokumentumok;
- kapcsolódó összehasonlítások;
- kapcsolódó modellalkalmazások;
- aktuális vagy előzményverzió állapot.

A gráf felismeri:

- lineáris revízióláncot;
- több ágra bomló revíziót;
- hiányzó előddokumentumot;
- körkörös, hibás előzménykapcsolatot.

## Alkalmazási előzmények

A meglévő `modelApplications[comparisonId]` mező megmaradt, és továbbra is az adott összehasonlítás aktuális vagy legutóbbi rekordját tartalmazza.

Új mezők:

- `modelApplicationHistory` – időrendi alkalmazási előzmények;
- `modelSnapshotStore` – deduplikált modellpillanatképek;
- `sequenceNumber` – alkalmazási sorrend;
- `parentApplicationId` – előző alkalmazási esemény;
- `rollbackSnapshotId` – hivatkozás a snapshot-tárra;
- `rollbackSnapshotBytes` – a pillanatkép becsült mérete.

Az alkalmazási állapotok:

- `preview`;
- `applied`;
- `superseded`;
- `rolledBack`;
- `blocked`.

## Snapshot-tár és projektméret-optimalizálás

Új motor:

`components/property-survey/propertySurveyPlanVersionHistory.ts`

A snapshot a következő központi modellállapotot tartalmazza:

- helyiségek;
- falszakaszok;
- nyílászárók;
- energetikai zónák;
- energetikai nyílászáró-részletek;
- hőhidak;
- tervlap-átadási registry.

A snapshot-tár működése:

1. A rendszer stabil tartalmi lenyomatot és becsült JSON-méretet készít.
2. Azonos modellállapot esetén nem jön létre új példány.
3. Az alkalmazási rekord csak a snapshot azonosítóját tárolja.
4. A legutóbbi nyolc visszaállítási pont marad aktív.
5. A régebbi alkalmazási rekordok megmaradnak, de rollback-hivatkozás nélkül audit-only állapotba kerülnek.
6. Legfeljebb negyven alkalmazási rekord és százötven auditbejegyzés marad a munkatérben.

A felület megmutatja:

- alkalmazások számát;
- aktív rollback-pontok számát;
- egyedi snapshotok számát;
- snapshot-tár méretét;
- deduplikáció becsült megtakarítását.

## Régi projektfájlok migrációja

A `v0.8.4.4.5` projektfájlokban a teljes rollback-pillanatkép még közvetlenül az alkalmazási rekordban szerepelhetett.

Normalizáláskor:

1. a beágyazott snapshot érvényessége ellenőrződik;
2. bekerül a deduplikált snapshot-tárba;
3. az alkalmazási rekord `rollbackSnapshotId` hivatkozást kap;
4. a régi `rollbackSnapshot` mező `null` értékre vált;
5. az aktuális alkalmazási rekord bekerül az előzménylistába.

## Történeti rollback

A felhasználó nemcsak a legutóbbi, hanem bármely még aktív visszaállítási pontot kiválaszthatja.

Történeti rollback esetén:

- a kiválasztott snapshot teljes központi modellállapota visszaáll;
- a kiválasztott alkalmazási rekord `rolledBack` állapotot kap;
- minden későbbi aktív alkalmazás `superseded` állapotba kerül;
- az összehasonlításonkénti aktuális rekordok is követik az új állapotot;
- külön rollback-auditbejegyzés készül;
- a dokumentum- és alkalmazási előzmények megmaradnak.

## Felület

A tervdokumentációs munkatér új panelje:

**Tervverzió-gráf és visszaállítási pontok**

Fő felületi markerek:

- `data-plan-version-graph`;
- `data-plan-version-graph-nodes`;
- `data-plan-version-graph-node`;
- `data-plan-version-application-history`;
- `data-plan-version-application-record`;
- `data-plan-version-application-status`.

A dokumentumcsomópont megnyitja a kiválasztott PDF-revíziót. Az alkalmazási rekord kiválasztása aktiválja a hozzá tartozó összehasonlítást és rollback-pontot.

A fejléc verziója:

`v0.8.4.4.6 · Verziógráf és több rollback-pont`

## Tesztek

### Domain- és integrációs tesztek

- Teljes domain- és integrációs regresszió: 556/556.
- Új verziógráf- és rollback-domain teszt: 12/12.
- Korábbi modellátvezetési domain regresszió: 13/13.
- Tervverzió-összehasonlítási regresszió: 14/14.
- Leica DISTO regresszió: 6/6.

### Candidate böngészős tesztek

- Háromverziós gráf és történeti rollback E2E: 9/9.
- Korábbi tervverzió → energetikai modell E2E: 16/16.
- Teljes PDF-tervlap E2E: 29/29.
- Energetikai E2E: 40/40 és 42/42.
- Responsive regresszió: 15/15.
- PDF/DXF export: sikeres.
- Tablet álló és fekvő nézet: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.

## Candidate

- Candidate build: `ZIFcF-QeZPT7QizSq8dZD`.
- Candidate port: 3043.
- Buildazonosító és standalone buildazonosító egyezik.
- Candidate assetaudit: 15/15.
- Candidate futásidejű hiba: 0.

## Korlátok

- A rollback-pillanatképek jelenleg a helyi `.dimpro` projektállományban vannak.
- A megosztott, többfelhasználós szerveres revíziózár és tranzakciós rollback későbbi fejlesztési szint.
- A becsült megtakarítás JSON-karakterszám-alapú, nem tömörített ZIP-fájlméret.
- Nyolcnál régebbi rollback-pont auditként megmarad, de közvetlen visszaállításra már nem használható.

## Következő fejlesztési irány

`v0.8.4.4.7` – verziógráf export, összehasonlítási dokumentumcsomag és szerveres megosztott revíziókezelés előkészítése.

A `v0.8.5` továbbra is kizárólag a valós WinWatt-próbával indulhat.

## Élesítés

- Éles build: `ZIFcF-QeZPT7QizSq8dZD`.
- Rollback: `.next_before_property_survey_v08446_20260731_155354`.
- Helyi és HTTPS smoke: 200 / 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles háromverziós gráf és történeti rollback E2E: 9/9.
- Éles korábbi modellátvezetési E2E: 16/16.
- Éles teljes PDF-tervlap E2E: 29/29.
- Éles energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés és az éles regresszió alatt nem kapott új bejegyzést.
- Éles felület: `https://dimpro.hu/ingatlanfelmero`.
