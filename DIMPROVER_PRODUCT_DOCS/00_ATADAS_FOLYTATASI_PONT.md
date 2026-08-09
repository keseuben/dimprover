# 00 Átadás / folytatási pont

## Jelenlegi stabil állapot

A DIMPROVER terepi hibafelvétel modulban elkészült a PDF.js alapú tervi hibajelölés és a HexPin marker export előkészítése.

## Elkészült fő funkciók

- PDF.js alapú közös tervnéző
- DIMPROVER HexPin marker
- szakági színek és opcionális betűjel
- marker drag / finompozicionálás
- marker szerkesztőpanel
- A5 / A4 / A3 exportkeret
- álló / fekvő tervrészlet elhelyezés
- PDF.js canvasból mentett tervrészlet-kép
- hibajegyhez kötött markeradatok
- PDF export előtti hiányzó részletkép figyelmeztetés
- tervkapcsolat panel részletkép státusz
- Export / PDF panel összesített HexPin státusz
- PDF export sablon duplikált CSS tisztítása
- DIMPROVER_PRODUCT_DOCS dokumentációs alapstruktúra

## Fontos érintett fájlok

- `components/viewers/PdfPlanViewer.tsx`
- `components/viewers/PlanHexMarker.tsx`
- `components/viewers/PlanMarkerTypes.ts`
- `components/viewers/viewerTypes.ts`
- `components/minutes/field/FieldMinutePage.tsx`
- `components/minutes/field/FieldPlanLinksPanel.tsx`
- `components/minutes/field/FieldExportPanel.tsx`
- `DIMPROVER_PRODUCT_DOCS/07_hexpin_tervi_hibajeloles_es_pdf_export.md`

## Ellenőrzött állapot

Legutóbbi ellenőrzés:

```bash
npx tsc --noEmit
```

Eredmény: sikeres.

PM2 állapot: `dimprover` online.

## Következő javasolt fejlesztési lépés

Automatikus részletkép-generálás export előtt.

Ez nehézségei:

- a PDF.js canvas jelenleg a viewer komponensben él
- az export indítása a terepi hibafelvétel oldalon történik
- export előtt vagy újra kell renderelni a PDF oldalt háttérben, vagy a viewerben előre kell kötelezővé tenni a részletkép mentését

Javasolt biztonságos irány:

1. Export előtt a rendszer listázza a hiányzó marker/tervkapcsolat párokat.
2. A felhasználó egy gombbal megnyithatja az első hiányos tervet.
3. A tervnézőben kiemelt CTA jelenik meg: `Részletkép mentése exporthoz`.
4. Csak ezután készüljön el a PDF valódi tervrészlet-képekkel.

## Következő modulirány

A HexPin fejlesztési kör után a következő nagyobb üzleti modul a terepi állapotrögzítés lehet.

Fontos termékelv:

- a terepi állapotrögzítésnél a készültség ne teljes projektkészültségként legyen kommunikálva
- helyesen: `Rögzített tételek átlaga`
- PDF exportban legyen lefedettségi figyelmeztetés, ha nem teljes bejárás történt


## Hiányzó HexPin részletképek listázása és gyors megnyitás

Az Export / PDF panel a hiányzó HexPin tervrészlet-képeket már nem csak darabszámmal jelzi, hanem listázza az első néhány hiányos elemet is.

A lista tartalma:

- hibasorszám
- marker sorszám
- tervlap neve

Ha négynél több hiányzó marker van, a panel további darabszámot jelez.

A panelen elérhető az `Első hiányos terv megnyitása` gomb. Ez az első hiányos markerhez tartozó hibára vált, megnyitja a Tervjelölés panelt, kinyitja a tervkapcsolat szekciót, és státuszüzenetet ad.

Ez a lépés biztonságos köztes megoldás az automatikus PDF.js háttérrenderelés előtt.


## PDF teljes lap alapértelmezett nézet

A PDF.js tervnéző alapértelmezésben teljes lapra illeszti a tervet a rendelkezésre álló ablakmérethez. Ez biztosítja, hogy a felhasználó első megnyitáskor mindig a teljes tervlapot lássa, ne egy nagyított részletet.

A felhasználó ezután kézzel nagyíthat vagy válthat szélességhez igazított nézetre. A toolbarban külön `Teljes lap` gomb is elérhető, amely visszaállítja az automatikus teljes-lap illesztést.


## Közös mozgatható exportkeret

A PDF.js HexPin tervnézőben az exportkeret nem egyetlen hibaponthoz kötött. A felhasználó előbb lerakhat több HexPin hibajegyet, majd a közös exportkeretet külön mozgathatja arra a tervrészletre, amelyben több hiba is látszik.

A részletkép generálásakor a rendszer a közös exportkeretben lévő HexPin markereket rajzolja rá a mentett tervrészletre. Így egyetlen exportkép több hibajegyet is tartalmazhat, ha azok ugyanazon a tervrészleten belül vannak.

A tervnéző ablak a böngészőablak méretéhez igazodik, magas z-indexen nyílik, és a felső vezérlősávban elérhető a `Mentés és vissza` gomb, amely bezárja a tervnézőt és visszatér a hiba szerkesztő lapra.


## Képszerkesztő mentés és kijelölt elemek törlése

A terepi fotó / tervfotó képszerkesztő ablak a böngészőablak méretéhez igazodik, magas z-indexen nyílik, és a betöltött fotót alapértelmezésben teljes képre illesztve mutatja. A felhasználó ezután kézzel nagyíthat vagy visszaválthat a `Teljes kép` nézetre.

A rajzolt elemek kijelölhetők és törölhetők. A kijelölt elem törlése gombbal, illetve Delete / Backspace billentyűvel is eltávolítható. A mentési gomb neve `Mentés és vissza`; mentés után a szerkesztő bezáródik és a frissített kép visszakerül a hiba szerkesztő felületre.


## Képszerkesztő bővített eszköztár

A fotó / tervfotó képszerkesztő bővített színpalettát kapott: piros, citromsárga, lila, kék, zöld, narancs, rózsaszín, cián, fekete és fehér színek érhetők el.

A szöveg eszköznél külön háttérszín választható a jobb olvashatóság érdekében. A háttér lehet átlátszó, sárga, fehér, világoszöld, világoskék, rózsaszín vagy sötét.

Az eszköztár gombjain az ikon mellett az eszköz neve is megjelenik. A rajzoló eszközök köre bővült: toll, nyíl, szaggatott kör, téglalap, DIMPROVER hexagon és szöveg.


## PDF HexPin markerpozíció és állapotsáv javítás

A PDF.js tervnézőben a HexPin marker abszolút pozíciója a teljes canvas-overlayhez kötött, ezért a hibajegy lerakásakor és húzásakor X és Y irányban is a tervlaphoz viszonyított helyen marad.

A marker vizuális horgonya középre került, így a lap tetején elhelyezett hibajegyek nem vágódnak le. Az exportkeret áttetsző háttérszíne eltávolításra került, a beolvasott PDF terv nem kap zöldes/cyan takarást.

Az állapotsáv és a bal állapotpanel megjeleníti a lerakott hibakódokat, valamint jelzi, hogy az adott HexPin markerhez van-e mentett részletkép.


## PDF HexPin mozgatás, külön exportkártya és vonalzó

A PDF.js HexPin nézetben a hibajegyek lerakása és az export/részletkép készítés munkafolyamata különválik. A felhasználó előbb elhelyezi és szükség esetén egérrel áthelyezi a hibajegyeket a tervlapon, majd külön exportkerettel készíti el a részletképeket.

A kijelölt marker szerkesztése külön kártyában marad, míg a `PDF export kivágás / részletkép` külön kártyában kezeli az exportkeretet és a részletkép mentést. Az exportkeret jelzi, hogy a kivágott nézetben mely hibakódok láthatók.

A tervlap felső és bal oldalán vizuális vonalzó jelenik meg centiméter jellegű osztásokkal és félosztásokkal. A jelölések zoomoláskor arányosan változnak, hogy a pozíció ellenőrizhető maradjon.

A bal állapotsávban külön blokkban jelennek meg a lerakott hibajegyek, alattuk pedig a mentett részletképek.


## PDF HexPin nagyobb marker és mozgatható kártyák

A HexPin marker vizuális mérete növelve lett, hogy a tervlapon könnyebben megfogható és olvasható legyen. A korábbi alsó tömött pont eltávolításra került, így nem takarja ki a marker alját.

A hover kártya egyszerűsödött: szakág, hibakód, hibanév és megjegyzés jelenik meg. A lapméret és tájolás nem a hover kártyán szerepel, mert ezek a részletkép/export beállításaihoz tartoznak.

A felső PDF állapotsorból kikerültek a hibakód badge-ek, mert ezek a bal oldali állapotpanelben jelennek meg. A kijelölt marker szerkesztő kártya és a PDF export/részletkép kártya mozgatható lett, így nem takarja fixen a tervrajzot.


## HexPin halvány háttér és árnyék

A PDF tervi hibajelölő HexPin jelölője halvány cyan háttérszínt, halvány sötétszürke keretet és finom árnyékot kapott. Ez jobban leválasztja a jelölőt a PDF tervlapról, miközben a DIMPROVER hexagon forma megmarad.


## Marker szerkesztés és exportkártya szétválasztása

A PDF.js HexPin nézetben a `Kijelölt marker szerkesztése` kártyából kikerült a részletképhez tartozó papírméret, tájolás és részletkép státusz. Ezek átkerültek a `PDF export kivágás / részletkép` kártyára.

A kijelölt marker szerkesztő PlanRadar jellegű hibainformációs mezőket kapott: hibanév, státusz, felelős/vállalkozó, határidő és megjegyzés. Ezek a markerhez kapcsolódó hibahely-információk, nem az exportkivágás beállításai.


## HexPin összecsukható kártyák és határidő gyorsgombok

A PDF.js HexPin nézetben a `Kijelölt marker szerkesztése` és a `PDF export kivágás / részletkép` kártya összecsukható lett. A kártyák továbbra is mozgathatók, így nem takarják fixen a tervrajzot.

A marker kitűző alsó tüske-formát kapott, a hover kártya pedig a marker szerkesztőben megadott adatokat mutatja: szakág, hibakód, hibanév, státusz, felelős, határidő és megjegyzés.

A határidő mező alapértelmezésben a jegyzőkönyv aktuális napját használja. Gyorsgombokkal +3 nap, +7 nap és JKV napja választható.


## HexPin arányjavítás és terepi hiba mezőnevek

A HexPin marker külső hexagon formája nagyobb, erősebb szürke keretet és külső árnyékot kapott. Az alsó kitűző-tüske hosszabb lett, a belső szakági hexagon mérete nőtt.

A PDF tervnéző modal felső pozíciója igazítva lett, hogy ne takarja a terepi hibafelvétel fejléc. A kijelölt marker szerkesztő mezőnevei a terepi hibafelvétel űrlapjához közelítenek: hiba megnevezése, helyszín, súlyosság, érintett vállalkozó, érintett személy/kapcsolattartó, határidő, leírás/megjegyzés, státusz.

A TH hibalista és azon belüli HJ markerlogika külön adatmodell-átalakítást igényel, mert egy TH hibalistához több tervi HJ jelölés tartozhat.


## HJ marker sorszámozás első lépés

A PDF.js tervi hibajelölőben az újonnan lerakott markerek sorszámozása `HJ-001`, `HJ-002` formára váltott. Ez az első lépés a TH fő hibalista és HJ tervi hibajelölés szétválasztása felé.

A külső HexPin háttér sötétebb cyan árnyalatot, erősebb sötétszürke keretet és erősebb árnyékot kapott, hogy a marker jobban látszódjon a PDF terven.


## SVG alapú látható HexPin keret

A HexPin külső forma CSS `clip-path + border` megoldásról SVG polygon alapú rajzolásra váltott. Így a külső hexagon valódi sötétszürke stroke-ot és erősebb drop-shadow árnyékot kap, a háttér pedig sötétebb halvány zöld/cyan árnyalatú.


## Egyesített SVG HexPin kitűzőforma

A HexPin külső formája egyetlen SVG path lett: a hexagon fej és az alsó kitűző-tüske nem külön elemként jelenik meg, hanem egy közös, egységes körvonalú ábraként. A külső keret feleakkora vastagságú lett, a forma továbbra is közös drop-shadow árnyékot kap.


## HexPin arány és tervnéző háttér finomítás

A HexPin külső forma kisebb lett, a külső SVG stroke vékonyabb, a belső szakági hexagon nagyobb és középre igazítottabb. A kitűzőforma továbbra is egyetlen SVG path marad.

A közös tervnéző és a PDF.js néző környezete szürkésebb hátteret kapott, hogy vizuálisan jobban elkülönüljön a fehér PDF tervlaptól és a terepi hibafelvétel oldal karakteréhez közelebb álljon.


## HexPin középszürke kontúr és A méretarányos exportkeret

A HexPin külső SVG kontúrja középszürke színre váltott, hogy ne olvadjon össze a PDF tervlap fekete vonalrajzával. Az új marker sorszámozás HJ-001, HJ-002 formára vált.

A PDF export kivágás kerete a kiválasztott A5/A4/A3 papírméret és fekvő/álló tájolás arányához igazodik, amikor a felhasználó módosítja ezeket a beállításokat.


## HJ nextMarker sorszámozás javítás

A PDF.js tervi hibajelölő tényleges új marker létrehozó blokkja `nextMarker` változót használ. Ez célzottan átállításra került, így az újonnan lerakott tervi markerek `HJ-001`, `HJ-002` formában jönnek létre, a kapcsolt TH fő hiba `issueId` megtartásával.


## Folytatási pont: TH → HJ adatlogika első stabil köre

A PDF.js HexPin tervnézőben elkészült a TH főhiba és HJ tervi hibajelölés szétválasztásának első stabil köre.

Megvalósult:

- TH hibalista választó a PDF tervnéző felső eszközsorában.
- Az összes terepi TH tétel átadása a tervnézőnek.
- Új HJ marker sorszámozása a kiválasztott TH alapján.
- HJ marker automatikus előtöltése a TH adatlapból.
- Marker szintű kézi felülírás megtartása.
- Háromszintű HexPin felirat: felül TH, külső fejben HJ, belső szakági hexagonban É/G/E/T/X.
- Marker tüskehegy-alapú horgonyzás, hogy zoomoláskor ne mozduljon el a PDF tervi pontról.

Következő javasolt lépés:

- Bal oldali állapotsáv átalakítása valódi fa nézetre: TH hibalisták alatt HJ markerek, azok alatt mentett részletképek.
- Több TH hibalista egy PDF-en való szűrése/kiemelése.
- Régi TH-prefixel kezdődő markeradatok opcionális migrációs segédje, de automatikus átnevezés nélkül.


## Folytatás: bal oldali TH / HJ állapotfa elkészült

A közös tervnéző bal oldali állapotsávja TH / HJ fa nézetre váltott.

Elkészült:

- TH hibalisták csoportos megjelenítése.
- TH alatt a hozzá tartozó HJ markerek listázása.
- HJ marker szinten részletkép státusz: mentett / hiányzik.
- TH szinten összesített részletkép arány: például `1/2 kép`.
- Kapcsolat nélküli HJ markerek külön figyelmeztető blokkja.
- Élő frissítés a tervnézőben: új marker vagy részletkép mentés után a bal állapotfa azonnal frissül.

Következő javasolt fejlesztés:

- TH és HJ sorokra kattintás a bal állapotfában: TH választás, HJ marker kijelölés és opcionális tervi fókuszálás.
- TH csoport szűrés / kiemelés ugyanazon PDF-en.


## Folytatás: interaktív TH / HJ fa és markerfókusz elkészült

Elkészült:

- TH sorra kattintás a bal állapotfában.
- Aktív TH szinkronizálása a PDF viewer felső TH választójával.
- HJ sorra kattintás a bal állapotfában.
- HJ marker kijelölése a PDF tervlapon.
- Tervnézet sima görgetése a kiválasztott HJ marker környékére.
- PDF markerre kattintás után a bal oldali kiválasztott HJ sor frissítése.

Következő javasolt fejlesztés:

- TH csoport szűrés / csak kiválasztott TH markermegjelenítés ugyanazon PDF-en.
- Kijelölt marker vizuális pulzálása vagy rövid kiemelése fókuszálás után.


## Folytatás: aktív TH marker szűrés elkészült

Elkészült:

- `Csak aktív TH` kapcsoló a PDF viewer felső eszköztárában.
- Összes TH marker megjelenítése alapállapotban.
- Szűrt nézetben csak az aktív TH HJ markerei látszanak.
- Rejtett HJ markerek darabszámának kijelzése.
- Exportkeret látható hibáinak szűréshez igazítása.
- Részletkép generáláskor a szűrt markermegjelenítés követése.

Következő javasolt fejlesztés:

- Kijelölt marker rövid vizuális pulzálása fókuszálás után.
- Szűrés állapotának opcionális megőrzése tervnéző újranyitásakor.


## Folytatás: kijelölt HexPin marker pulzáló kiemelése elkészült

Elkészült:

- `PlanHexMarker` kapott `pulse` állapotot.
- A pulzáló marker nagyobb skálát és amber kiemelő gyűrűt kap.
- A `PdfPlanViewer` `pulseMarkerId` állapotot kezel.
- Marker kijelöléskor, bal oldali HJ fókusznál és új marker lerakáskor rövid pulzus indul.
- A pulzus automatikusan megszűnik körülbelül 1,6 másodperc után.

Következő javasolt fejlesztés:

- Szűrés állapotának opcionális megőrzése tervnéző újranyitásakor.
- Bal oldali TH/HJ fa összecsukható csoportjai sok hibalista esetére.


## Folytatás: összecsukható TH / HJ fa nézet elkészült

Elkészült:

- TH csoportok nyitása/zárása `▼` / `▶` kapcsolóval.
- `Mind nyit` gomb a bal oldali állapotfában.
- Aktív TH automatikus nyitva tartása.
- Kijelölt HJ marker TH csoportjának automatikus kinyitása.
- Összecsukott TH csoportnál rövid összegzés: `Csoport összecsukva · N HJ`.

Következő javasolt fejlesztés:

- Szűrési állapot és fa nyitott/zárt állapotának opcionális megőrzése tervnéző újranyitásakor.
- Bal oldali fa keresőmező TH/HJ sorszám vagy cím alapján.


## Folytatás: bal oldali TH / HJ állapotfa elkészült

A közös tervnéző bal oldali állapotsávja TH / HJ fa nézetre váltott.

Elkészült:

- TH hibalisták csoportos megjelenítése.
- TH alatt a hozzá tartozó HJ markerek listázása.
- HJ marker szinten részletkép státusz: mentett / hiányzik.
- TH szinten összesített részletkép arány: például `1/2 kép`.
- Kapcsolat nélküli HJ markerek külön figyelmeztető blokkja.
- Élő frissítés a tervnézőben: új marker vagy részletkép mentés után a bal állapotfa azonnal frissül.

Következő javasolt fejlesztés:

- TH és HJ sorokra kattintás a bal állapotfában: TH választás, HJ marker kijelölés és opcionális tervi fókuszálás.
- TH csoport szűrés / kiemelés ugyanazon PDF-en.


## Folytatás: TH / HJ fa keresőmező elkészült

Elkészült:

- Keresőmező a bal oldali TH / HJ állapotfában.
- Keresés TH sorszám, cím, helyszín/leírás, HJ sorszám, HJ cím, megjegyzés, státusz, felelős és határidő alapján.
- Találatszám: TH csoportok száma és a fában látható HJ markerek száma.
- `Törlés` gomb a keresés nullázására.
- Üres találati állapot: `Nincs találat a TH/HJ fában.`
- A keresés csak a bal oldali fa listát szűri, a PDF marker láthatóságot nem módosítja.

Következő javasolt fejlesztés:

- Szűrési állapot és fa nyitott/zárt állapotának opcionális megőrzése tervnéző újranyitásakor.
- TH/HJ fa gyorsműveletek: aktív TH izolálása, összes részletkép hiányzó HJ kiemelése.


## Folytatás: hiányzó részletképes HJ gyorsszűrő elkészült

Elkészült:

- `Hiányzó képek` gyorsszűrő a bal oldali TH / HJ fában.
- Hiányzó részletkép nélküli HJ markerek darabszámának kijelzése.
- Csak hiányzó részletképes HJ-k megjelenítése a bal fában.
- Keresőmezővel kombinált működés.
- `Törlés` gomb kiterjesztése: keresés és hiányzó képes szűrő nullázása.
- PDF marker láthatóság változatlan marad; a gyorsszűrő csak a bal oldali fát szűri.

Következő javasolt fejlesztés:

- Egy kattintásos `Következő hiányzó kép` navigáció a bal fában és a PDF tervlapon.
- Hiányzó részletképes HJ markerek külön ikonja vagy erősebb vizuális figyelmeztetése.


## Folytatás: interaktív TH / HJ fa és markerfókusz elkészült

Elkészült:

- TH sorra kattintás a bal állapotfában.
- Aktív TH szinkronizálása a PDF viewer felső TH választójával.
- HJ sorra kattintás a bal állapotfában.
- HJ marker kijelölése a PDF tervlapon.
- Tervnézet sima görgetése a kiválasztott HJ marker környékére.
- PDF markerre kattintás után a bal oldali kiválasztott HJ sor frissítése.

Következő javasolt fejlesztés:

- TH csoport szűrés / csak kiválasztott TH markermegjelenítés ugyanazon PDF-en.
- Kijelölt marker vizuális pulzálása vagy rövid kiemelése fókuszálás után.


## Folytatás: Következő hiányzó részletkép navigáció elkészült

Elkészült:

- `Következő hiányzó` gomb a bal oldali TH / HJ fában.
- Következő részletkép nélküli HJ marker kiválasztása.
- Körkörös léptetés az összes hiányzó részletképes HJ között.
- Kapcsolódó TH csoport automatikus kinyitása.
- PDF fókusz és marker pulzus a kiválasztott HJ markerre.
- A `Hiányzó képek` gyorsszűrő automatikus bekapcsolása navigációkor.

Következő javasolt fejlesztés:

- Hiányzó részletképes HJ markerek erősebb ikonja / jelölése a bal fában.
- Egy `Kijelölt részletkép mentése és következő` egygombos workflow a PDF export panelben.


## Folytatas: Save and next crop workflow kesz

Elkeszult: Save and next gomb a PDF viewer toolbarban es az export panelben. A kijelolt HJ reszletkep mentese utan automatikusan a kovetkezo reszletkep nelkuli HJ markerre ugrik, aktivalja a TH csoportot, PDF fokuszt es pulzust indit.


## Folytatas: PDF render cancel es TH cimke kontraszt javitas kesz

Elkeszult: TH cimke kontrasztos amber hatterrel es erosebb kerettel. A PDF.js megszakitott renderelese zoomolasnal nem dob teves felhasznaloi hibat.


## Folytatas: teljes kepernyos PDF tervnezo es lebego TH/HJ fa kesz

Elkeszult: teljes kepernyos szerkesztes gomb, ESC visszalepes, teljes nezetben lebego osszecsukhato TH/HJ allapotfa.


## Folytatas: teljes ablakmeret, huzhato TH/HJ panel es uj exportkeret kesz

Elkeszult: teljes ablakmeret megnevezes, huzhato lebego TH/HJ allapotfa, kulon gombbal elhelyezheto exportkeret, A5/A4/A3 aranykezeles, 20 szazalekos szurke exportkeret hatter.


## Folytatas: PDF lapmeret kijelzes cm-ben kesz

Elkeszult: a PDF fejléc mar nem pixelmeretet mutat, hanem automatikus lapformatumot, allo/fekvo iranyt es cm meretet.


## Folytatas: bongeszo natív teljes kepernyos szerkesztes kesz

Elkeszult: Monitor teljes kepernyo gomb, Fullscreen API bekotes, ESC/F11 kilepes, fullscreenchange szinkron.


## Folytatas: marker szerkeszto es export panel viewport mozgatas kesz

Elkeszult: a marker szerkeszto es export/reszletkep panel a teljes viewporton belul mozgathato fixed lebego panel lett.


## Folytatas: zoom stabilitas es papirlap kontener javitas kesz

Elkeszult: zoom kozeppont megorzese, stabil papirlap kontener, erosebb lapkeret es arnyek.


## Folytatas: vonalzo kivul, Ctrl Alt gorgos zoom es Delete marker torles kesz

Elkeszult: vonalzo a PDF lapkereten kivul, Ctrl+Alt+egergorgo zoom, kijelolt marker Delete/Backspace torles vedett input mezokkel.


## Folytatas: Ctrl Alt gorgos zoom scroll blokkolas javitas kesz

Elkeszult: natív passive false wheel handler a PDF stage elemen, Ctrl+Alt+gorgo kozben preventDefault es stopPropagation.


## Folytatas: HexPin kulso szakagi vilagos szinek kesz

Elkeszult: kulso HexPin fej vilagos szakagi szinnel, belso hexagon eros szakagi szinnel, Technologia/Egyeb szincsere, export rajzolas szinkron.


## Folytatas: Save and next crop workflow kesz

Elkeszult: Save and next gomb a PDF viewer toolbarban es az export panelben. A kijelolt HJ reszletkep mentese utan automatikusan a kovetkezo reszletkep nelkuli HJ markerre ugrik, aktivalja a TH csoportot, PDF fokuszt es pulzust indit.


## Folytatas: teljes ablakmeret, huzhato TH/HJ panel es uj exportkeret kesz

Elkeszult: teljes ablakmeret megnevezes, huzhato lebego TH/HJ allapotfa, kulon gombbal elhelyezheto exportkeret, A5/A4/A3 aranykezeles, 20 szazalekos szurke exportkeret hatter.


## Folytatas: HexPin sulyossag es statusz jeloles kesz

Elkeszult: epitoipari sulyossag valasztolista, sulyossagi keretek es ! jel, statusz potty/pipa, export rajzolas szinkron.


## Folytatas: uj HJ Eszrevetel es statusz badge lathatosag javitas kesz

Elkeszult: uj marker alapertelmezett sulyossag Eszrevetel, statusz es sulyossag szetvalasztas, erosebben lathato statusz badge.


## Folytatas: HexPin HJ sorszam nagyobb betumeret kesz

Elkeszult: HJ-001 es hasonlo marker sorszamok nagyobb, olvashatobb betumerettel jelennek meg a tervlapon es exportban.


## Folytatas: panel elrendezes, HJ masolas es TH fa athuzas kesz

Elkeszult: nagyobb HJ sorszam, bal oldali rogzitett TH/HJ allapotfa, jobb oldali marker szerkeszto alaphelyzet, osszecsukott export panel, Ctrl/Cmd+huzas marker masolas, TH valaszto a marker szerkesztoben, HJ athuzas masik TH-ba.


## Folytatas: PDF lapozo osszes oldalszam es bal felso igazitas kesz

Elkeszult: lapozo mezoben aktualis/osszes oldalszam, PDF lap alaphelyzetben bal felso sarokra illesztve.


## Folytatas: PDF oldalszamhoz kotott HJ markerek kesz

Elkeszult: pageNumber mezos HJ markerek, aktualis oldal szerinti marker megjelenites, regi markerek 1. oldalhoz rendelve, TH/HJ faban oldalszam jelzes.


## Folytatas: PDF pan mozgas es HJ kattintas szetvalasztasa kesz

Elkeszult: egérhuzas/pan kozben nem keletkezik automatikus HJ marker, csak egyszeru kattintasra.


## Folytatas: PDF marker csak bal kattintasra kesz

Elkeszult: jobb egérgomb es kozepso gorgo lenyomas nem hoz letre HJ markert, csak bal egérgombos valodi kattintas.


## Folytatas: lebego kartya hatter egységesites kesz

Elkeszult: marker szerkeszto es PDF export kivagas kartyak bg-slate-200/border-slate-300 stilusra allitva, a TH/HJ allapotfahoz illeszkedve.


## Folytatas: PDF export kivagas arany javitas kesz

Elkeszult: exportkeret aranyaval egyezo reszletkep-kivagas, canvas CSS/pixel skala javitas, aktualis oldal szerinti export marker szures.


## Folytatas: PDF exportkeret vizualis A3/A4/A5 arany javitas kesz

Elkeszult: az exportkeret meretezes canvas-arany korrekciot kapott, hogy a valasztott papirformatum vizualisan is helyes aranyu legyen.


## Folytatas: PDF exportkeret fizikai mm alapu meretezes kesz

Elkeszult: exportkeret fizikai PDF oldalmeret es A5/A4/A3 mm meretek alapjan szamolodik, A3 fekvo PDF + A3 fekvo export esetben a keret laparanyosan illeszkedik.


## Folytatas: PDF fizikai meret es cm vonalzo javitas kesz

Elkeszult: pagePhysicalSizeMm state, scale=1 PDF pontmeretbol szamolt mm meret, cm alapu vonalzo, exportkeret ugyanarra a fizikai meretre kotve.


## Folytatas: PDF standard papirmeret normalizalas kesz

Elkeszult: A0-A5 standard papirmeret felismeres/normalizalas, A3 fekvo eseten 420 x 297 mm alapu vonalzo es exportkeret.


## Folytatas: PDF fajlnev alapu A3 fekvo meretkenyszer kesz

Elkeszult: A3 fekvo fajlnev eseten 420 x 297 mm kenyszeritett fizikai lapmeret a vonalzohoz es exportkerethez.


## Folytatas: PDF fuggoleges cm vonalzo JSX javitas kesz

Elkeszult: verticalRulerMarks/rulerStepPx helyett verticalRulerCmMarks/rulerHeightCm hasznalata a JSX-ben.


## Folytatas: PDF exportkeret teljes lap egyezes javitas kesz

Elkeszult: azonos fizikai lapmeret es tajolas eseten exportkeret = teljes PDF lap, 100% x 100%.


## Folytatas: PDF exportkeret minden papirmeretnel valos fizikai arany kesz

Elkeszult: A4/A5 exportkeret is valos fizikai papirmeret aranybol szamolodik, nincs 0,92-es zsugoritas.

## Folytatás: tervkivágás + teljes tervlap melléklet adatfolyam kész

Elkészült az első működő adatfolyam:
- HJ részletkép mentése `cropFrame` és PDF metaadatokkal.
- Aktuális PDF oldal teljes tervlap snapshot mentése HexPin HJ jelölésekkel.
- `PlanPageExport` típus bevezetése.
- `PlanViewerShell` és `FieldPlanLinksPanel` továbbadja a teljes tervlap exportokat.
- Terepi hibafelvételi PDF exportban a hibánál kimetszett tervrészlet, a végén teljes tervlap mellékletek jelennek meg.


## 2026-07-22 – Értekezleti Mellékletszerkesztő folytatási pont

Az első működő kép/PDF/képernyőrészlet szerkesztő elkészült és az Értekezleti Asszisztens mellékletkártyáihoz kapcsolódik. Következő fejlesztési szint: Teams dialog/task module nagyablakos indítás, mentett JSON újbóli szerkesztése, képi AI-értelmezés és jegyzőkönyvi képhivatkozás-számozás.

## 2026-07-23 – Értekezleti Asszisztens saját hangátírás v0.1.13 production állapot

Elkészült és élesítve:

- `meetingMode: teams | in_person`, munkatér `version: 8`;
- kétlépcsős Teams/személyes értekezlet-létrehozás;
- mód szerinti Teams Graph és személyes mikrofonfunkció-szétválasztás;
- MediaRecorder mikrofonfelvétel;
- streaming hang-/videófeltöltés 500 MB konfigurálható korláttal;
- FFmpeg 16 kHz/mono normalizálás és 15 perces darabolás;
- külön diarizálási worker és védett callback;
- Beszélő A/B/C, névpárosítás, összevonás, sorjavítás és sortörlés;
- hozzájárulásos, szervezeti hangprofil és audit;
- alapértelmezett teljes forrásfájl-törlés;
- előzetes és tényleges API-költség megjelenítés;
- AI Dokumentumműhelyhez átadható ellenőrzött átirat.

Éles teszteredmény:

- saját hangátíró E2E: 35/35;
- mód szerinti UI: 12/12;
- MediaRecorder mikrofonpróba: sikeres;
- korábbi regressziók: 10/10 tesztcsomag;
- TypeScript, ESLint és production build: sikeres;
- PM2: online.

Részletes dokumentáció:

`DIMPROVER_PRODUCT_DOCS/26_dimpro_ertekezleti_sajat_hangatiras_v0113.md`

Következő fejlesztési szint:

1. külön admin hangprofil-kezelő felület;
2. hangprofil törlésének egységes 3 másodperces nyomva tartásos UX-e;
3. felhasználói/projekt/havi AI-költségkeret és figyelmeztetési küszöb;
4. részletes worker adminmonitor, újrapróbálás és feldolgozási napló;
5. később valós idejű streamelt felirat.

## 2026-07-23 – AI-tervezet export és kezelőfelületi betűméret v0.1.14

Elkészült és élesítve:

- az AI Dokumentumműhely DOCX/PDF gombjai az aktuális, középen látható AI-tervezetet exportálják;
- a még külön el nem mentett kézi módosítások is bekerülnek a fájlba;
- a hagyományos értekezleti munkatér-export külön működésként megmaradt;
- az egész asszisztens kezelőfelületének apró szövegei nagyobbak lettek;
- a dokumentumelőnézet tipográfiája változatlan maradt;
- a külön AI-stúdió útvonal is a közös tipográfiai témát használja.

Ellenőrzés:

- AI-tervezet DOCX/PDF tartalmi különválasztás: sikeres;
- böngészős betűméretmérés: sikeres;
- TypeScript: 0 hiba;
- ESLint: 0 hiba;
- production build: sikeres;
- PM2: online;
- végső HTTP-smoke és error-log delta: sikeres.

Dokumentáció:

`DIMPROVER_PRODUCT_DOCS/27_dimpro_ai_tervezet_export_tipografia_v0114.md`

Backup:

`backups/meeting-ai-export-fontsize-20260723_170953`

## 2026-07-24 – AI-tervezet automatikus helyreállítása v0.1.15

Elkészült és élesítve:

- üres mentett tervezet esetén a legutóbbi sikeres `draft_minutes` AI-eredmény automatikus visszatöltése;
- helyreállítási figyelmeztetés az AI-eredmény időpontjával;
- helyreállított tervezet közvetlen DOCX/PDF exportja;
- mentett, előzményből visszatöltött, szerkesztett és üres tervezetállapot külön kezelése;
- lezárt/közzétett értekezlet adatállapotának változatlan megőrzése.

Valós ellenőrzés:

- értekezlet: `fefw-1784824847953-1784824883221-f36pm`;
- munkatér: `published`;
- mentett tervezet: 0 karakter;
- visszatöltött AI-eredmény: 3435 karakter;
- DOCX és PDF gomb aktív;
- DOCX/PDF tartalmi ellenőrzés sikeres.

Dokumentáció:

`DIMPROVER_PRODUCT_DOCS/28_dimpro_ai_tervezet_automatikus_visszatoltes_v0115.md`

Backup:

`backups/meeting-ai-draft-fallback-20260724_053320`

## 2026-07-28 – DIMPRO Felmérő v0.6.0 aktuális folytatási pont

A DIMPRO Felmérő v0.6.0 fejlesztési köre elkészült. A kiadás tartalma:

- falszakasz-alapú energetikai hőhatár;
- hőhatáron kívül is bővíthető virtuális alaprajzi munkatér;
- részletes helyiségátfedési hibakártyák;
- `.dimpro` munkafájl mentés és import;
- A4/A3/A2 álló és fekvő PDF-export;
- általános rétegezett DXF-export;
- teljes képernyős alsó rajzeszköz-paletta;
- türkizzöld folyamatjelző;
- rejtett, szükség esetén lebegő tájolási panel;
- Világos / Sötét / SUN kültéri téma.

Fő érintett fájlok:

- `components/property-survey/PropertySurveyPage.tsx`
- `components/property-survey/PropertySurveyStructuresPanel.tsx`
- `components/property-survey/propertySurveyThermalBoundary.ts`
- `components/property-survey/propertySurveyExport.ts`
- `components/viewers/SurveyFloorPlanEngine.tsx`
- `DIMPROVER_PRODUCT_DOCS/40_dimpro_felmero_v060_thermal_export_sun_workspace.md`

Következő javasolt verzió: v0.6.1.

Javasolt fókusz:

1. több szint egyetlen többoldalas PDF-ben;
2. valódi vektoros PDF;
3. bruttó/nettó energetikai határolófelület;
4. rétegrendből számított U-érték;
5. WinWatt irányonkénti összesítő;
6. DIMPRO Drive projektverziózás a `.dimpro` munkafájlhoz;
7. PDF fedlap, jelmagyarázat és aláírási blokk.
