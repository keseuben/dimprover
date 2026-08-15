# DIMPRO Drive Compare – Vector Segments V1.2.0

Dátum: 2026-08-15

## Cél

A Drive Compare Auto Align a korábbi zárt `vectorContours` mellett a PDF.js operatorlistből származó **nyitott CAD/PDF vektorvonalakat** is használja. Ez elsősorban műszaki rajzoknál fontos, ahol falélek, tengelyek, rasztervonalak, vezetéknyomvonalak és más rajzi elemek önálló stroke/open path formában szerepelnek, ezért nem alkotnak zárt kontúrt.

## Architektúra

A PDF operator parser továbbra is kizárólag a közös `components/viewers/pdfDocumentEngine.ts` modulban marad. A Drive nem kap külön PDF parser réteget.

A `SharedPdfPageAnalysis` új mezője:

- `vectorSegments: SharedPdfVectorSegment[]`

A szegmens tárolja:

- normalizált A/B végpont;
- normalizált hossz;
- 0–180° közötti irányszög;
- `openPath` / `closedPath` eredet;
- path index;
- szegmens index.

A parser kvantált végpont-aláírással deduplikálja az azonos vektorvonalakat. A feature-lista felső biztonsági korlátja 12 000 szegmens.

## Auto Align – VECTOR_SEGMENTS

Új Auto Align source:

- `VECTOR_SEGMENTS`

A Drive kizárólag a megfelelő hosszúságú `openPath` szegmenseket veszi fel az új matcherbe.

A felismerés RANSAC-szerű:

1. hosszú nyitott szegmensekből seed A/B vonalpárokat választ;
2. a seedből similarity hipotézist számol: egységes skála + forgatás + X/Y eltolás;
3. a hipotézist további szegmensekkel ellenőrzi;
4. egyezési kapuk: középponti pozíció, irányszög és vonalhossz;
5. egy A vagy B vonal egy proposalon belül csak egyszer használható;
6. minimum 3 konzisztens szegmensegyezés szükséges;
7. minimum térbeli szórás szükséges, hogy közeli/repetitív vonalak ne adjanak instabil igazítást;
8. a legjobb 2/3 távoli referencia-pár kerül a meglévő similarity solverbe.

A korábbi források megmaradnak:

- `TEXT_LABELS`;
- `GEOMETRIC_NODES`;
- `VECTOR_CONTOURS`.

A `VECTOR_SEGMENTS` új alternatíva, nem helyettesíti ezeket.

## Geometriai csomópontok

A geometriai metszéspont-detektor már a közös `vectorSegments` adatait is használhatja. Emiatt külön open path-ok valódi belső kereszteződései is referencia-csomóponttá válhatnak. Ha nincs `vectorSegments` adat, a korábbi kontúrél fallback továbbra is működik.

## UI

A Compare külön jelzi az új forrást:

- `nyitott CAD/PDF vektorvonalak`

Referencia-pár kártyán:

- `Vektorvonal`

Sikertelen automatikus illesztés diagnosztikája a szöveg- és kontúrszám mellett a felismert nyitott vektorvonalak számát is megjeleníti.

## Biztonsági elv

Az új felismerés sem alkalmaz automatikusan transzformációt.

Megmarad:

- 70–130% automatikus skálakorlát;
- ±500 px eltolási korlát;
- RMS ellenőrzés;
- candidate preview;
- vizuális fedési score;
- eltérés-hőtérkép;
- referencia-pár review és kézi csere;
- külön `Alkalmazás` emberi jóváhagyás.

A vectorSegments eredmény geometriai segédjavaslat, nem szakmai tervminősítés.

## Elsődleges acceptance

Statikus Drive contract:

- **189/189 PASS**
- új vectorSegments contractok: 174–189.

Algoritmikus synthetic acceptance:

- **12/12 PASS**;
- kizárólag nyitott vektorvonalak, szöveg és kontúr nélkül;
- 7 konzisztens evidence;
- 3 referencia-pár;
- visszanyert similarity: 1,045× scale, 6,5° rotation, X 0,035 / Y -0,028 normalizált eltolás;
- két vonalból nem készül proposal;
- csak `closedPath` vonalak nem indítják el a `VECTOR_SEGMENTS` proposal-t.

## Korlátok

V1.2.0 nem teljes CAD szemantikai értelmező. A PDF-ben geometriailag kinyerhető stroke/path szegmenseket használja, de nem olvas DWG/DXF layer-, block- vagy objektumszemantikát. A nagyon repetitív raszter/tengelyrendszereknél továbbra is szükséges a több evidencia, a vizuális preview és az emberi jóváhagyás.


## Valódi PDF.js böngészős acceptance

A parser és a Compare közös működését két tényleges, PDF-libbel előállított, kizárólag nyitott stroke/path vonalakat tartalmazó PDF-párral ellenőriztük.

Tesztgeometria:

- B terv: 8 önálló nyitott vektorvonal;
- A terv: ugyanaz a geometria 1,025× skálával, 4,2° forgatással és kontrollált X/Y eltolással;
- nincs szöveges referencia;
- nincs zárt vektoros kontúr.

Az első böngészős futás fontos edge case-et tárt fel: a shared engine a régi `>=12` vektorszegmenses küszöb miatt a mindössze 8 vonalas, tisztán vektoros PDF-et tévesen `raster` contentKind értékkel jelölte. A parser maga ekkor is helyesen jelentett **8 + 8 nyitott vektorvonalat**. A besorolás javítása után már bármely tényleges vector path/szegmens vektortartalomnak számít; raster image jelenléte esetén továbbra is `mixed` lehet.

Végleges böngészős eredmény:

- **23/23 PASS**;
- artifact: `/srv/dimpro-dev/artifacts/jazmin-drive-vector-segments-2026-08-15T09-15-59-704Z`;
- 8/8 open path felismerés;
- Auto Align source: `nyitott CAD/PDF vektorvonalak`;
- automatikus javaslat létrejött szöveg és zárt kontúr nélkül;
- emberi Apply előtt a B terv identity transzformációban maradt;
- referencia feature megnevezése: `Vektorvonal`;
- Apply után a várt ~102,5% skála és ~4,2° forgatás érvényesült;
- 1366 px nézetben nincs horizontális overflow;
- browser pageerror: 0.

## Regresszió

Ugyanezen forrásverzión:

- Geometric Nodes: **22/22 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-geometric-nodes-2026-08-15T09-16-23-843Z`;
- Auto Pair Review: **38/38 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-auto-pair-review-2026-08-15T09-16-33-999Z`;
- Visual Quality Score: **47/47 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-visual-quality-score-2026-08-15T09-16-46-113Z`;
- Difference Heatmap: **58/58 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-difference-heatmap-2026-08-15T09-16-58-953Z`;
- Visual Compare: **34/34 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-visual-compare-2026-08-15T09-17-12-678Z`;
- Historical Revision Selector: **20/20 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-revision-selector-2026-08-15T09-17-27-035Z`.

A böngészős forrásteszt idejére a külön feature worktree Next.js DEV szerverén ideiglenesen engedélyezve volt a `license.dimpro.hu` dev origin. Ez kizárólag tesztkonfiguráció volt, a `next.config.ts` a teszt után visszaállt, és nem része a feature commitnak.


## Végleges DEV build és cutover

Integrált BENJADMIN commit:

- `f4331e3 feat(drive): align revisions from open vector segments`
- eredeti feature commit: `141cad7`.

Az integráció a közben elkészült BENJADMIN P9 destructive approval commitokra épült, konfliktus nélkül.

Végleges Turbopack build:

- **`bYVOdiYac5eZKANDt_efN`**;
- standalone statikus chunk ellenőrzés: **245 PASS**;
- a build külön `.next-drive-vector-segments-v120` release könyvtárban készült, ezért a régi DEV runtime a build teljes ideje alatt online maradt.

Rollback pont:

- `/srv/dimpro-dev/backups/drive_vector_segments_v120_runtime_20260815_113450`;
- előző aktív build: `ITkECuMZrrOgi89fg8q_y`;
- forrás backup branch: `backup/benjadmin-pre-vector-segments-integration-20260815_112112`;
- korábbi feature-start backup: `backup/benjadmin-pre-vector-segments-20260815_104334`.

Aktív runtime a cutover után:

- PM2: `dimpro-benjadmin-operator-ui-v2-dev`;
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`;
- port: 3100;
- build: `bYVOdiYac5eZKANDt_efN`;
- runtime identity guard: PASS;
- admin DEV console: HTTP 200;
- publikus Drive: a meglévő auth-flow szerint HTTP 307.

### Exact production build acceptance

A végleges Turbopack buildet cutover előtt külön port 3210 candidate-en ellenőriztük:

- Vector Segments valós PDF acceptance: **23/23 PASS**;
- artifact: `/srv/dimpro-dev/artifacts/jazmin-drive-vector-segments-2026-08-15T09-33-20-640Z`;
- Geometric Nodes: **22/22 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-geometric-nodes-2026-08-15T09-33-43-883Z`;
- Auto Pair Review: **38/38 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-auto-pair-review-2026-08-15T09-33-54-092Z`;
- Difference Heatmap: **58/58 PASS** — `/srv/dimpro-dev/artifacts/jazmin-drive-difference-heatmap-2026-08-15T09-34-04-281Z`.

### Aktív DEV post-cutover acceptance

Ugyanaz a nyitott-vonalas teszt közvetlenül az aktív 3100 runtime-on:

- **23/23 PASS**;
- artifact: `/srv/dimpro-dev/artifacts/jazmin-drive-vector-segments-2026-08-15T09-35-23-043Z`.

A Drive biztonsági réteg a Compare engine módosítása után is változatlanul egészséges:

- storage mode: `active`;
- objektum letöltés: engedélyezett a CLEAN release-gate szerint;
- ClamAV: `PONG`;
- engine: ClamAV 1.5.3;
- `activationSafe=true`.

### Végső forráskapuk

- Drive/Compare contract: **189/189 PASS**;
- Vector Segments algoritmikus acceptance: **12/12 PASS**;
- Drive Security V0.5: **47/47 PASS**;
- Drive Security Backfill V0.5.1: **34/34 PASS**;
- Drive Workspace: **22/22 PASS**;
- Drive Core V0.30: **24/24 PASS**;
- Project Core: **19/19 PASS**;
- BENJADMIN P9 Security: **55/55 PASS**;
- Runtime Identity Guard: **20/20 PASS**;
- TypeScript: PASS;
- teljes lint: PASS, **0 error / 104 meglévő warning**;
- production Turbopack build: PASS.

A V1.2.0 fejlesztési kör lezárásakor a `VECTOR_SEGMENTS` felismerés az aktív DEV Compare része, miközben a korábbi szöveg-, geometriai csomópont-, kontúr-, manuális 2/3 pontos, vizuális score- és hőtérkép workflow-k regresszió nélkül megmaradtak.
