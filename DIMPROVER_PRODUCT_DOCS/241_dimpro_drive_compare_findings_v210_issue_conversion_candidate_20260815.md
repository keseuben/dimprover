# DIMPRO Drive Compare Findings V2.1 – Finding → Hibajegy candidate

**Dátum:** 2026-08-15  
**Státusz:** DEV candidate / migration és E2E előtt  
**Környezet:** kizárólag DEV  
**PROD:** nem érinthető ebben a körben

## Cél

A Compare Findings V2.0 tartós eltérési jegyzék következő szelete: egy ember által `JAVÍTANDÓ` (`FIX_REQUIRED`) státuszra állított findingből tartós projekt-hibajegy hozható létre úgy, hogy az eredeti finding változatlanul megmarad és a két objektum között `CREATED_FROM` kapcsolat jön létre.

A rendszer továbbra sem minősít automatikusan vizuális eltérést hibának.

## Project Issue Core V0.1

Új szerveres alap:

- `project_core_issues` – projektizolált hibajegyek;
- `project_core_issue_sequences` – projektenkénti `HJ-00001` sorszám;
- `project_issue_schema_meta` – issue schema marker;
- állapotok: `NEW`, `IN_PROGRESS`, `FIXED`, `VERIFIED`, `CLOSED`, `REOPENED`;
- súlyosság: `LOW`, `MEDIUM`, `HIGH`, `URGENT`;
- források: `COMPARE_FINDING`, `FIELD_CAPTURE`, `MANUAL`, `MEETING`, `IMPORT`;
- felelős, határidő, leírás, helyszín, szakág, note, metadata, version és audit mezők.

A V0.1 a közös backend magot készíti el. A jelenlegi Hibajegyzék UI és Terepi hibafelvétel később erre a közös core-ra köthető; ebben a candidate-ben még nem kerül teljesen átállításra.

## Finding → hibajegy szabály

Konverzió csak akkor engedett, ha:

1. a finding létezik és nincs archiválva;
2. a finding projektazonosítója egyezik;
3. a finding státusza `FIX_REQUIRED`;
4. a felhasználónak `issue.write` projektjogosultsága van.

Az issue a findingből örökli:

- felelőst;
- határidőt;
- prioritásból képzett súlyosságot;
- műszaki megjegyzést;
- A/B dokumentum- és verzióazonosítókat;
- oldalszámot és zónaazonosítót;
- a finding verzióját és a `humanClassification=FIX_REQUIRED` snapshotot.

Prioritás → súlyosság:

- LOW → LOW
- MEDIUM → MEDIUM
- HIGH → HIGH
- CRITICAL → URGENT

## Idempotencia és kapcsolatok

Egy aktív Compare Findingből egy aktív hibajegy készülhet. Ismételt konverziós kérés nem duplikál, hanem a már létező hibajegyet adja vissza.

Kapcsolat iránya:

`issue --CREATED_FROM--> compare_finding`

A Compare repository a V2.1-től bejövő és kimenő entity linkeket is feloldja, ezért az eltérési kártyán a kapcsolt hibajegy `HJ-xxxxx` azonosítója megjeleníthető.

## Jogosultságok

Új projektjogosultságok:

- `issue.read`
- `issue.write`

OWNER / PROJECT_MANAGER / CONTRIBUTOR: read + write.  
REVIEWER / VIEWER: read only.

## API

- `GET /api/projects/[projectId]/issues/health`
- `GET /api/projects/[projectId]/issues`
- `POST /api/projects/[projectId]/drive/compare-findings/[findingId]/convert-to-issue`

Sikeres új konverzió: HTTP 201.  
Már létező issue esetén: HTTP 200.  
Nem `FIX_REQUIRED` finding: HTTP 409.

## Audit

Konverziókor készül:

- `PROJECT_ISSUE_CREATED_FROM_COMPARE_FINDING` Project Core audit az issue objektumon;
- `DRIVE_COMPARE_FINDING_CONVERTED_TO_ISSUE` Project Core audit a finding objektumon;
- `COMPARE_FINDING_ISSUE_CREATED` Drive change-feed esemény.

## UI

Az Eltérési jegyzék fejléc V2.1-re frissül. A finding kártyán megjelenik a Hibajegy létrehozása művelet.

- `REVIEW` vagy `ACCEPTED_DIFFERENCE`: gomb tiltott, „Előbb: JAVÍTANDÓ” állapot;
- `FIX_REQUIRED`: konverzió engedett;
- már kapcsolt issue: a `HJ-xxxxx` azonosító jelenik meg, újabb konverzió nem indítható.

## Migráció

`supabase/migrations/20260815161000_project_issue_core_v010.sql`

Bootstrap:

`supabase/DIMPRO_PROJECT_ISSUE_CORE_V010_BOOTSTRAP.sql`

A két SQL fájl byteazonos. A migráció csak kontrollált DEV backup és target guard után alkalmazható.

## Candidate statikus contract

- Compare Findings V2.1 issue conversion: `45/45 PASS`
- Compare Findings V2.0 regresszió: `30/30 PASS`
- DIMPRO Supabase migration order: PASS

## Következő kötelező lépések

1. TypeScript + ESLint;
2. DEV DB backup és target guard;
3. Project Issue Core V0.1 migration kizárólag DEV-re;
4. schema health;
5. production candidate build;
6. valós DEV E2E: REVIEW blokkolás → FIX_REQUIRED → create 201 → idempotens repeat 200 → issue list → entity link → audit/change feed;
7. aktív operator integráció és külön release build;
8. 3100-as DEV pointer cutover;
9. post-cutover acceptance;
10. PROD továbbra is érintetlen.
