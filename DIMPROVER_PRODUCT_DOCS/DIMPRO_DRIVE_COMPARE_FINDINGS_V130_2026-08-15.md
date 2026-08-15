# DIMPRO Drive Compare Findings V1.3.0 – DEV fejlesztési és acceptance jegyzőkönyv

Dátum: 2026-08-15

## Cél

A Drive Compare eltérési hőtérkép `Δ1…Δ5` zónáiból kézzel felvehető, ember által státuszolható és megjegyzéssel ellátható helyi eltérési jegyzék létrehozása.

A V1 nem hibajegykezelő és nem automatikus szakmai minősítő rendszer. A hőtérkép csak technikai vizuális eltérést jelez; a finding alapállapota mindig `ELLENŐRIZENDŐ`, a felhasználó dönthet `ELFOGADOTT ELTÉRÉS` vagy `JAVÍTANDÓ` státuszról.

## V1 adatszerkezet

Minden finding saját snapshotot tartalmaz:

- projektazonosító / Compare context;
- A dokumentum neve, dokumentum ID, verzió ID, verziószám, revízió;
- B dokumentum neve, dokumentum ID, verzió ID, verziószám, revízió;
- PDF oldalszám;
- forrás Δ-zóna;
- helyi eltérés százaléka;
- mismatch/ink pontszám;
- normalizált zónakoordináták;
- Auto Align X/Y eltolás;
- egységes skála;
- forgatás;
- Auto Align forrás;
- confidence score;
- finding státusz;
- felhasználói megjegyzés;
- létrehozási és módosítási idő.

## Státuszok

- `REVIEW` → ELLENŐRIZENDŐ
- `ACCEPTED_DIFFERENCE` → ELFOGADOTT ELTÉRÉS
- `FIX_REQUIRED` → JAVÍTANDÓ

Nincs automatikus státuszváltás.

## Működés

1. Auto Align javaslat készül.
2. Visual Quality Score és Difference Heatmap kiszámolja a helyi Δ-zónákat.
3. A felhasználó kiválaszt egy zónát.
4. `Δn jegyzékbe` gombbal explicit módon findingot hoz létre.
5. A finding saját snapshotot kap.
6. A státusz és a műszaki megjegyzés kézzel szerkeszthető.
7. A finding újrafókuszálható a terven.
8. A finding saját nagyított A/B inspector nézetet kap a mentett alignment snapshot alapján.
9. Az Auto Align `Alkalmazás` nem törli a findingot.
10. A finding külön törölhető a helyi jegyzékből.

## V1 perzisztencia

A V1 kizárólag kliensoldali Compare munkameneti állapotot használ.

Szándékosan nincs:

- új findings adatbázistábla;
- új szerveres findings API;
- automatikus hibajegy-létrehozás;
- automatikus jegyzőkönyvi pont;
- automatikus DokuBOX elem.

Más A/B dokumentum- vagy verziópárra váltás új, tiszta findings munkamenetet indít.

## Export

Két helyi export készülhet:

- JSON: teljes snapshot struktúra;
- UTF-8 BOM-os, pontosvesszős CSV: táblázatos feldolgozáshoz.

A V1 export böngészőoldali Blob letöltés, nem küld finding adatot új szerveres végpontra.

## Acceptance

### Contract / statikus kapu

- Drive/Compare acceptance: **206/206 PASS**
- TypeScript: PASS
- célzott ESLint: PASS
- `git diff --check`: PASS

### Compare Findings browser acceptance

A meglévő Difference Heatmap smoke kibővített Findings változata:

- **78/78 PASS**

Ellenőrzött tételek:

- findings panel megjelenik;
- alaplista üres;
- aktív Δ-zóna kézzel felvehető;
- első finding létrejön;
- alapstátusz REVIEW;
- emberi felelősség/disclaimer látható;
- ugyanaz a zóna nem duplikálódik;
- státusz JAVÍTANDÓ-ra állítható;
- műszaki megjegyzés megmarad;
- finding refókuszálható;
- mentett finding inspector működik;
- JSON/CSV export gomb aktív;
- második Δ-zóna külön tételként felvehető;
- tétel külön törölhető;
- Auto Apply előtt finding újrafókuszálható;
- finding túléli az Auto Apply-t;
- státusz túléli az Auto Apply-t;
- megjegyzés túléli az Auto Apply-t;
- mentett zóna overlay és inspector Apply után is elérhető;
- browser pageerror nincs;
- 1366 px nézeten nincs globális overflow.

## Következő szint

A V1.3 után külön döntés alapján jöhet a szerveres Compare Finding adatmodell és workflow-kapcsolat:

- hibajegy létrehozása findingból;
- jegyzőkönyvi pont létrehozása;
- DokuBOX / lebegő felvetés kapcsolat;
- felelős / határidő / prioritás;
- többfelhasználós audit és státusztörténet;
- PDF/Excel eltérési jegyzék export.


## Végleges aktív DEV állapot

A Findings feature az időközben elkészült BENJADMIN P10.1 read-only PROD connector fejlesztéssel együtt került az aktív DEV buildbe.

Forrás:

- `a7a091a feat(drive): add compare findings review list`
- ezt követően a P10.1 dokumentációs checkpoint: `9d4e51b docs(benjadmin): checkpoint P10.1 PROD connector activation`

Aktív DEV build:

- **`LpY1sHLXS6rxcU91NpiFl`**
- PM2: `dimpro-benjadmin-operator-ui-v2-dev`
- cwd: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- port: 3100
- Runtime Identity Guard: **20/20 PASS**

Aktív DEV browser acceptance:

- Compare Findings V1.3: **78/78 PASS**
- artifact: `/srv/dimpro-dev/artifacts/jazmin-drive-compare-findings-2026-08-15T11-22-48-489Z`

Kapcsolódó végső kapuk:

- Drive/Compare contract: **206/206 PASS**
- Drive Security V0.5: **47/47 PASS**
- Drive Security Backfill V0.5.1: **34/34 PASS**
- Vector Segments V1.2: **12/12 PASS**
- Drive Workspace/Core: **22/22 + 24/24 PASS**
- Project Core: **19/19 PASS**
- BENJADMIN P10 PROD readiness: **40/40 PASS**
- BENJADMIN P10.1 read-only connector: **42/42 PASS**
- BENJADMIN P9 Security: **55/55 PASS**
- teljes ESLint: **0 error / 104 meglévő warning**
- TypeScript: **PASS**
- Drive storage: `active`
- ClamAV: `PONG`, engine 1.5.3
- `activationSafe=true`

Rollback pontok:

- source backup branch: `backup/benjadmin-pre-compare-findings-integration-20260815_125917`
- P10.1 runtime előtti backup: `/srv/dimpro-dev/backups/benjadmin-p101-pre-runtime-20260815T131550`

A V1.3 Findings továbbra is kizárólag kliensoldali Compare munkameneti review-lista. A következő szerveres perzisztencia-lépés külön adatmodell- és workflow-döntést igényel.
