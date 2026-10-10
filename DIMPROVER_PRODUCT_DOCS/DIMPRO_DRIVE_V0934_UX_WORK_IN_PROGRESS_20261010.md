# DIMPRO Drive V0.9.34 – UX fejlesztési részállapot

Állapot: SOURCE PREPARED / NOT BUILT / NOT DEPLOYED; PROD DENY.

## Elkészült
- A DrivePreviewDrawer fájlmegjelenítőn belüli lebegő előző/következő nyilak, bal/jobbra billentyűgombok, dokumentumszámláló; a meglévő átméretezés megmarad.
- Az aktuális látható mappa-/kedvenc-/keresési halmaz böngészőben előnézhető dokumentumaira épülő navigáció. A táblázat belső rendezési állapotával való teljes sorrendszinkron, speciális szűrők és PDF billentyűütközések regressziós ellenőrzése még hátravan.
- Az egyedi megjelenítési név szerkesztőjében a tényleges korábban megadott név, hiányában a kiterjesztés nélküli fájlnév az alapérték. Mentésig csak a szerkesztőállapot változik.
- A Tervellenőrzés fájltípus szerinti szűrése a ténylegesen előforduló kiterjesztésekből, reset funkcióval.
- A Tervellenőrzés szakág- és témakörcellája közvetlenül a Részletek megfelelő választóját nyitja meg.

## Ellenőrzések
- TypeScript: PASS
- ESLint érintett TSX fájlokra: PASS
- git diff --check: PASS
- BUILD01/02 build és bejelentkezett böngészős QA: még nem történt.

## Következő fejlesztés
- Központi AUTH profilfotó: a mostani fejlécek csak inicialés avatart használnak. Közös profil/asset API és jogosultság, képoptimalizálás, megjelenítés kell.
- Követett dokumentumok és értesítések: közös, ACL-ellenőrzött, auditált event+digest tervezés és implementáció.
- A központi Projektadatlap és szerepkörök/jogosultsági profilok kiterjesztése külön migrációs tervvel.
- UI-regressziós QA és tábla belső szűrése/rendezése szerinti nézegetési sorrend javítása.
