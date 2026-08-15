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
