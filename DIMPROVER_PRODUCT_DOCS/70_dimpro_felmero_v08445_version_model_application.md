# DIMPRO Felmérő v0.8.4.4.5 – Elfogadott tervverzió-változások átvezetése a központi energetikai modellbe

## Cél

A `v0.8.4.4.4` tervverziónként párosította a PDF-oldalakat, helyiségeket, falakat és nyílászárókat, majd elemenként elfogadási vagy elutasítási döntést rögzített. A `v0.8.4.4.5` az alkalmazott döntéseket ellenőrzötten átvezeti a központi DIMPRO helyiség-, fal-, nyílászáró-, energetikai nyílászáró- és hőhídmodellbe.

## Alapelvek

- Csak `applied` állapotú tervverzió-összehasonlítás vezethető át.
- Függőben lévő változás esetén az átvezetés blokkolt.
- `unchanged` és `accepted` elemek vehetnek részt az átvezetésben.
- `rejected` változásnál a korábbi központi elem marad meg.
- Párosított fal és nyílászáró központi azonosítója megmarad.
- Új elfogadott elem új központi rekordot kap.
- Elfogadott törlés csak külön megerősítéssel hajtható végre.
- A kézzel módosított, `planTransferLocked` központi elem blokkolja a csendes migrációt.
- Minden sikeres alkalmazás előtt teljes rollback-pillanatkép készül.
- Az ismételt alkalmazás idempotens, nem készít duplikált elemeket.
- Ugyanazon összehasonlítás ismételt futtatása nem írja felül az eredeti rollback-pontot.

## Függőségi szabályok

- Céloldali fal csak akkor migrálható, ha legalább egy kapcsolt célhelyiség is átvezethető.
- Céloldali nyílászáró csak akkor migrálható, ha a kapcsolt célfal is átvezethető.
- Elutasított helyiséghez tartozó fal vagy nyílászáró nem migrálódik önállóan.
- Ilyenkor nem blokkoló szakmai figyelmeztetés készül, és a régi központi elem marad meg.

## Előnézet

Az előnézet külön számolja:

- helyiség létrehozás, frissítés és törlés;
- fal létrehozás, frissítés és törlés;
- nyílászáró létrehozás, frissítés és törlés;
- létrejövő és törlődő hőhidak;
- stabil központi ID-val megőrzött falak és nyílászárók;
- blokkoló hibák és figyelmeztetések.

A törlést tartalmazó előnézetnél külön jelölőnégyzet szükséges az alkalmazási gomb engedélyezéséhez.

## Helyiségmigráció

- Párosított helyiség megtartja a központi `room.id` értékét.
- Frissül a név, funkció, terület, belmagasság, geometria, fűtöttség és tervforrás.
- A `planDocumentId`, `planPageId` és `planSuggestionId` az új tervverzióra vált.
- Elfogadott új helyiség determinisztikus új központi ID-val jön létre.
- Elfogadott törölt helyiség eltávolításra kerül.
- Elutasított törölt helyiség a korábbi tervforrással megmarad.

## Fal- és nyílászáró-migráció

- Párosított fal és nyílászáró a régi központi ID-val frissül.
- Az átvezetés előtt a lecserélendő régi forráselemek ideiglenesen kikerülnek, így azonos ID-val nem keletkezhet duplikáció.
- A célverzió geometriája és energetikai adatai a meglévő PDF → energetikai modell motorral készülnek el.
- A nyílászáró központi részletrekordja azonos ID-val követi a migrált nyílászárót.
- A hőhidak nyílászáró-, fal-, helyiség-, zóna- és tervforrás-kapcsolatai együtt frissülnek.
- Az elutasított régi fal, nyílászáró és kapcsolt hőhíd változatlanul megmarad.

## Transfer registry

- Az átvezetett céloldal új vagy frissített `synced` átadási rekordot kap.
- A lecserélt korábbi tervlap átadási rekordja törlődik.
- Forrás- és modell-lenyomat készül az új céloldalhoz.
- A tervlap átadási auditnaplója külön bejegyzést kap.

## Modellátvezetési nyilvántartás

A meglévő `SurveyPlanVersionComparisonWorkspace` visszafelé kompatibilis bővítése:

- `modelApplications` – összehasonlításonkénti alkalmazási rekordok;
- `modelApplicationAudit` – alkalmazás, blokkolás és rollback auditnapló;
- állapotok: `preview`, `applied`, `rolledBack`, `blocked`;
- műveletek: `apply`, `rollback`, `blocked`.

A régi `plan-document.v1` projektek automatikusan üres nyilvántartást kapnak.

## Rollback

A sikeres alkalmazás előtt pillanatkép készül az alábbiakról:

- helyiségek;
- falszakaszok;
- falnyílások;
- energetikai zónamunkatér;
- energetikai nyílászáró- és hőhídmunkatér;
- tervlap-átadási nyilvántartás.

A rollback csak külön megerősítéssel fut. Visszaállítja a korábbi tervforrásokat, központi rekordokat, energetikai kapcsolatokat és átadási registryt. A felmérő saját automatikus segédfal-reconcile folyamata a helyiségek alapján nem tervből származó segédfalakat újragenerálhat; a rollback hitelességét a tervforrás-azonosítók, központi ID-k és registry igazolják.

## Felület

Új panel: **Elfogadott tervváltozások átvezetése**.

Tartalma:

- műveleti számlálók;
- stabil központi ID-k száma;
- blokkoló hibák és figyelmeztetések;
- törlési megerősítés;
- alkalmazási gomb;
- alkalmazási állapot;
- teljes rollback megerősítés;
- auditnapló.

A fejléc verziója: `v0.8.4.4.5 · Tervverzió → központi modell átvezetés`.

## Érintett fő fájlok

- `components/property-survey/propertySurveyPlanDocumentTypes.ts`
- `components/property-survey/propertySurveyPlanVersionModelApplication.ts`
- `components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx`
- `components/property-survey/PropertySurveyPage.tsx`
- `scripts/test-property-survey-plan-version-model-application-v08445.cjs`
- `scripts/test-property-survey-plan-version-model-application-v08445-e2e.cjs`

## Kompatibilitás

- `.dimpro` séma: változatlanul `dimpro.property-survey.v0.8.4.3`.
- Tervdokumentációs séma: változatlanul `dimpro.property-survey.plan-document.v1`.
- WinWatt csomag- és exportstruktúra: változatlan.
- A `v0.8.5` továbbra is a tényleges WinWatt-próbához fenntartott verzió.

## Ellenőrzések

- Teljes domain- és integrációs regresszió: 544/544.
- Új modellátvezetési domain teszt: 13/13.
- Leica DISTO regresszió: 6/6.
- Candidate tervverzió → energetikai modell E2E: 16/16.
- Korábbi teljes PDF tervlap E2E: 29/29.
- Történeti energetikai E2E: 40/40 és 42/42.
- Responsive E2E: 15/15.
- PDF/DXF export: sikeres.
- Tablet álló és fekvő nézet: sikeres.
- Candidate assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.

## Korlátok

- A párosítás és átvezetés determinisztikus, nem AI-alapú tervértelmezés.
- Bizonytalan vagy OCR-ből származó geometriáknál emberi ellenőrzés szükséges.
- A rollback helyi `.dimpro` projektállományban tárolódik; központi többfelhasználós tranzakciókezelés még nincs.
- A teljes rollback-pillanatkép növeli a projektállomány méretét.
- Több egymást követő új tervverzió szerveres verziógráfja későbbi fejlesztési szint.

## Következő fejlesztési irány

`v0.8.4.4.6` – több egymást követő tervverzió verziógráfja, alkalmazási előzmények közötti navigáció, rollback-pontok kezelése és projektállomány-méretoptimalizálás.

A `v0.8.5` továbbra is kizárólag a valós WinWatt-próbával indulhat.

## Élesítés

- Éles build: `4Jd7MtGX5AqFxW9Ewzp5t`.
- Rollback: `.next_before_property_survey_v08445_20260731_112403`.
- Helyi és HTTPS smoke: 200 / 200.
- PM2: online.
- Nginx konfiguráció: hibamentes.
- Éles tervverzió → energetikai modell E2E: 16/16.
- Éles korábbi teljes PDF tervlap E2E: 29/29.
- Éles történeti energetikai E2E: 40/40 és 42/42.
- Éles responsive regresszió: 15/15.
- Éles PDF/DXF export: sikeres.
- Éles tablet álló és fekvő teszt: sikeres.
- Éles assetaudit: 15/15.
- Böngészőkonzol- és oldalhiba: 0.
- A PM2 hibanapló az élesítés és az éles regresszió alatt nem kapott új bejegyzést.
- Éles felület: `https://dimpro.hu/ingatlanfelmero`.
