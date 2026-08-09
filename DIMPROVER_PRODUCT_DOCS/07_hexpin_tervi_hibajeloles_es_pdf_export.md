# DIMPROVER HexPin tervi hibajelölő és PDF export

## Állapot

A közös PDF.js tervnézőbe bekerült a DIMPROVER arculatú HexPin marker és a hibafelvételi jegyzőkönyv PDF export előkészítése.

## Fő komponensek

- `components/viewers/PlanMarkerTypes.ts`
- `components/viewers/PlanHexMarker.tsx`
- `components/viewers/PdfPlanViewer.tsx`
- `components/viewers/PlanViewerShell.tsx`
- `components/viewers/viewerTypes.ts`
- `components/minutes/field/FieldPlanLinksPanel.tsx`
- `components/minutes/field/FieldMinutePage.tsx`

## Marker forma

A jelölő DIMPROVER-es hibrid marker:

- külső hexagon fej
- belső szakági hexagon
- alsó mutatócsúcs
- hover mini-kártya
- kijelölési állapot
- draggel mozgatható finompozíció

## Szakági színek

- Építészet: zöld
- Gépészet: kék / cián
- Elektromos: sárga / narancs
- Technológia: lila
- Egyéb: szürke

A betűjel opcionális:

- É = Építészet
- G = Gépészet
- E = Elektromos
- T = Technológia
- X = Egyéb

## Marker adatmodell

`PlanIssueMarker` mezők:

- `id`
- `issueId`
- `serial`
- `title`
- `discipline`
- `xPercent`
- `yPercent`
- `showLetter`
- `paperSize`: `A5 | A4 | A3`
- `orientation`: `portrait | landscape`
- `cropImageDataUrl`
- `cropImageGeneratedAt`

A marker százalékos X/Y pozícióval tárolódik, hogy zoomtól és PDF canvas mérettől függetlenül exportálható legyen.

## Viewer működés

A `PdfPlanViewer.tsx` funkciói:

- PDF.js canvas render
- HexPin marker létrehozása kattintással
- marker hover mini-kártya
- marker drag / mozgatás
- szakág, betűjel, A5/A4/A3, álló/fekvő szerkesztés
- marker törlés
- exportkeret vizuális megjelenítése
- marker körüli PDF.js canvas részletkép készítése
- részletkép JPG data URL mentése markerbe

Mozgatás vagy markerbeállítás módosítása után a korábbi `cropImageDataUrl` törlődik, mert új részletképet kell generálni.

## Zoomfüggő marker méret

A marker képernyőn zoomfüggően méreteződik:

- teljes / távoli lapnézetben nagyobb
- közepes zoomnál kisebb
- erős nagyításnál még kisebb

Cél: a marker látható maradjon, de nagyításnál ne takarja ki túlzottan a tervrészletet.

## Exportkeret

A kijelölt marker körül a viewerben látszik a kivágási keret:

- A5 / A4 / A3
- álló / fekvő
- cián szaggatott keret
- enyhe háttérárnyalás
- exportkeret méret százalékos kijelzése

## PDF export

A `FieldMinutePage.tsx` PDF export HTML-je bővült:

- `buildPlanMarkerExportSections(...)`
- ha van `cropImageDataUrl`, a PDF export valódi PDF.js canvasból készült tervrészlet-képet jelenít meg
- ha nincs `cropImageDataUrl`, rácsos fallback tervhely jelenik meg HexPin jelölővel

A PDF exportban megjelenő adatok:

- hiba sorszáma
- hiba címe
- szakág
- terv neve
- oldalszám
- A5 / A4 / A3
- álló / fekvő
- X/Y százalékos pozíció
- képkivágás státusza

## Hibajegyhez kötés

A `PlanViewerFile` típus bővült:

- `issueId`
- `issueSerial`
- `issueTitle`
- `markers`
- `onMarkersChange`

A `FieldPlanLinksPanel.tsx` átadja az aktív hibajegy azonosítóját, sorszámát és címét a közös tervnézőnek. Új marker létrehozásakor a marker már az aktív hibajegy `TH-xxx` sorszámát és tényleges címét veszi át.

Meglévő markerek megnyitáskor normalizálódnak az aktuális hibajegy adataihoz, így régi helyi címek nem maradnak a tervkapcsolatban.

## Következő fejlesztési javaslatok

1. Több marker kezelése egy hibán belül rendezettebb listával.
2. Marker címének kézi szerkesztése opcionálisan.
3. PDF export előtt automatikus figyelmeztetés, ha van marker, de nincs friss részletkép.
4. Tervrészlet-kép generálás automatikus indítása PDF export előtt.
5. Dokumentációs főmappa létrehozása, ha a `DIMPROVER_PRODUCT_DOCS` végleges helye eldől.


## PDF teljes lap alapértelmezett nézet

A PDF.js tervnéző alapértelmezésben teljes lapra illeszti a tervet a rendelkezésre álló ablakmérethez. Ez biztosítja, hogy a felhasználó első megnyitáskor mindig a teljes tervlapot lássa, ne egy nagyított részletet.

A felhasználó ezután kézzel nagyíthat vagy válthat szélességhez igazított nézetre. A toolbarban külön `Teljes lap` gomb is elérhető, amely visszaállítja az automatikus teljes-lap illesztést.


## Közös mozgatható exportkeret

A PDF.js HexPin tervnézőben az exportkeret nem egyetlen hibaponthoz kötött. A felhasználó előbb lerakhat több HexPin hibajegyet, majd a közös exportkeretet külön mozgathatja arra a tervrészletre, amelyben több hiba is látszik.

A részletkép generálásakor a rendszer a közös exportkeretben lévő HexPin markereket rajzolja rá a mentett tervrészletre. Így egyetlen exportkép több hibajegyet is tartalmazhat, ha azok ugyanazon a tervrészleten belül vannak.

A tervnéző ablak a böngészőablak méretéhez igazodik, magas z-indexen nyílik, és a felső vezérlősávban elérhető a `Mentés és vissza` gomb, amely bezárja a tervnézőt és visszatér a hiba szerkesztő lapra.


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


## TH → HJ adatlogika és háromszintű HexPin felirat

A PDF.js tervnézőben elindult a teljes TH → HJ szétválasztott adatlogika.

- `TH-001`, `TH-002` = terepi fő hiba / hibalista elem.
- `HJ-001`, `HJ-002` = az adott TH hibához tartozó tervi hibajelölések.
- A PDF tervnéző felső eszközsorában megjelent a `TH hibalista` választó.
- Új HJ marker létrehozásakor a rendszer a kiválasztott TH-hoz viszonyítva sorszámoz: például TH-002 alatt HJ-001, HJ-002.
- Az új marker automatikusan átveszi a TH adatlap alapadatait: cím, leírás/megjegyzés, státusz, felelős és határidő.
- Marker szinten ezek az adatok továbbra is felülírhatók a kijelölt marker szerkesztőpaneljén.

A HexPin vizuális feliratozása háromszintű lett:

- a marker fölötti kis címke: kapcsolt fő hiba, például `TH-001`
- a külső nagy HexPin fej: konkrét tervi hibajelölés, például `HJ-001`
- a belső szakági hexagon: szakági betűjel, például `É`, `G`, `E`, `T`, `X`

Ez az elrendezés olvashatóbb, mint két szöveg egy belső hexagonban, mert a TH csoportosító adat, a HJ konkrét tervi pontazonosító, a szakági betű pedig vizuális kategória marad.

A marker pozícióhorgonyzása is módosult: a mentett X/Y koordináta a kitűző tüskehegyéhez igazodik. Így zoomoláskor és kicsinyítéskor a jelölés nem vándorol el a tervi pontról.


## Bal oldali TH / HJ fa nézet

A közös tervnéző bal oldali állapotsávja lapos hibajegylista helyett TH / HJ fa nézetet kapott.

Megjelenítés:

- TH főhiba blokk: sorszám, cím, HJ darabszám, mentett részletképek száma.
- TH alatt HJ markerek: HJ sorszám, cím, részletkép státusz.
- Részletkép státusz: `kép mentve` vagy `kép hiányzik`.
- Kapcsolat nélküli HJ markerek külön figyelmeztető blokkban jelennek meg.

A `PlanViewerShell` helyi markerállapotot tart fenn, ezért a bal oldali fa nézet új HJ lerakása vagy részletkép mentése után azonnal frissül, nem csak a tervnéző bezárása és újranyitása után.


## Interaktív TH / HJ fa nézet és markerfókusz

A bal oldali TH / HJ fa nézet kattinthatóvá vált.

Működés:

- TH sorra kattintás: az adott TH lesz az aktív hibalista.
- Ha a TH alatt már van HJ marker, a rendszer az első HJ markert kijelöli és a tervnézetet annak környékére görgeti.
- HJ sorra kattintás: a marker kijelölődik a PDF tervlapon és a tervnézet a marker környékére fókuszál.
- A PDF viewer felső TH választója és a bal oldali fa nézet szinkronban van.
- PDF-en történő marker kijelöléskor a bal oldali fa nézet kijelölt HJ sora is frissül.

Ez a működés előkészíti a későbbi TH szűrési és marker középre igazítási funkciót.


## Aktív TH marker szűrés

A PDF viewer felső eszköztárába bekerült a `Csak aktív TH` kapcsoló.

Működés:

- Kikapcsolt állapotban minden TH minden HJ markere látszik ugyanazon PDF-en.
- Bekapcsolt állapotban csak az aktuálisan kiválasztott TH-hoz tartozó HJ markerek látszanak.
- A rendszer jelzi, hány HJ marker van rejtve.
- Az exportkeret `Látható hibák` listája a szűrt megjelenítést követi.
- Részletkép mentéskor a kivágásra rajzolt HexPin markerek is a szűrt láthatóságot követik.

Ez zsúfolt tervlapoknál segíti az egy TH-hoz tartozó HJ jelölések áttekintését, miközben az összes markeradat megmarad.


## Kijelölt HexPin marker pulzáló kiemelése

A PDF tervnézetben a kijelölt HexPin marker rövid, látványos pulzáló kiemelést kap.

A pulzus aktiválódik:

- bal oldali HJ sorra kattintáskor,
- PDF-en lévő HexPin markerre kattintáskor,
- új HJ marker lerakásakor,
- bal oldali HJ fókuszáláskor.

A kiemelés körülbelül 1,6 másodpercig aktív. A cél, hogy nagyított vagy zsúfolt tervlapon is egyértelmű legyen, melyik HJ marker lett kijelölve.


## Összecsukható TH / HJ fa nézet

A bal oldali TH / HJ állapotfa összecsukható csoportokat kapott.

Működés:

- `▼` ikon: a TH csoport nyitva van, a HJ markerek látszanak.
- `▶` ikon: a TH csoport összecsukva van, csak a TH összegzés látszik.
- A `Mind nyit` gomb minden TH csoportot újra kinyit.
- Az aktív TH csoport automatikusan nyitva marad.
- A kijelölt HJ markerhez tartozó TH csoport automatikusan kinyílik.
- Összecsukott állapotban a rendszer mutatja, hány HJ marker tartozik a TH-hoz.

Ez sok hibalista esetén áttekinthetőbbé teszi a tervnéző bal oldali állapotsávját.


## Bal oldali TH / HJ fa nézet

A közös tervnéző bal oldali állapotsávja lapos hibajegylista helyett TH / HJ fa nézetet kapott.

Megjelenítés:

- TH főhiba blokk: sorszám, cím, HJ darabszám, mentett részletképek száma.
- TH alatt HJ markerek: HJ sorszám, cím, részletkép státusz.
- Részletkép státusz: `kép mentve` vagy `kép hiányzik`.
- Kapcsolat nélküli HJ markerek külön figyelmeztető blokkban jelennek meg.

A `PlanViewerShell` helyi markerállapotot tart fenn, ezért a bal oldali fa nézet új HJ lerakása vagy részletkép mentése után azonnal frissül, nem csak a tervnéző bezárása és újranyitása után.


## TH / HJ fa keresőmező

A bal oldali TH / HJ állapotfa keresőmezőt kapott.

Működés:

- A keresés csak a bal oldali fa listát szűri.
- A PDF-en megjelenő markerek láthatóságát továbbra is a `Csak aktív TH` kapcsoló vezérli.
- Kereshető mezők:
  - TH sorszám,
  - TH cím,
  - TH helyszín / leírás,
  - HJ sorszám,
  - HJ cím,
  - HJ megjegyzés,
  - státusz,
  - felelős / kivitelező,
  - határidő.
- A találatsáv jelzi, hány TH csoport és hány HJ marker látszik a fában.
- A `Törlés` gomb visszaállítja a teljes fa listát.
- Ha nincs találat, a felület külön jelzi: `Nincs találat a TH/HJ fában.`

Keresés közben a TH csoportok megtartják a nyitott/zárt logikát, de kijelölt HJ esetén a kapcsolódó TH továbbra is automatikusan nyitva marad.


## Hiányzó részletképes HJ gyorsszűrő

A bal oldali TH / HJ állapotfa kapott egy `Hiányzó képek` gyorsszűrőt.

Működés:

- Alapállapotban a gomb jelzi, hány HJ markerhez nincs mentett részletkép.
- Bekapcsolt állapotban a bal oldali fa csak azokat a HJ markereket mutatja, amelyeknél hiányzik a részletkép.
- A gyorsszűrő együtt működik a keresőmezővel.
- A `Törlés` gomb a keresést és a hiányzó képes szűrőt is alaphelyzetbe állítja.
- A szűrés csak a bal oldali fa listát érinti, a PDF-en látható markereket nem módosítja.

Ez megkönnyíti a PDF export előtti ellenőrzést, mert gyorsan láthatóvá válik, mely HJ jelölésekhez kell még részletképet menteni.


## Interaktív TH / HJ fa nézet és markerfókusz

A bal oldali TH / HJ fa nézet kattinthatóvá vált.

Működés:

- TH sorra kattintás: az adott TH lesz az aktív hibalista.
- Ha a TH alatt már van HJ marker, a rendszer az első HJ markert kijelöli és a tervnézetet annak környékére görgeti.
- HJ sorra kattintás: a marker kijelölődik a PDF tervlapon és a tervnézet a marker környékére fókuszál.
- A PDF viewer felső TH választója és a bal oldali fa nézet szinkronban van.
- PDF-en történő marker kijelöléskor a bal oldali fa nézet kijelölt HJ sora is frissül.

Ez a működés előkészíti a későbbi TH szűrési és marker középre igazítási funkciót.


## Következő hiányzó részletkép navigáció

A bal oldali TH / HJ állapotfa kapott egy `Következő hiányzó` gombot.

Működés:

- A gomb a következő olyan HJ markerre ugrik, amelyhez még nincs mentett részletkép.
- A kiválasztott HJ marker TH csoportja automatikusan kinyílik.
- A PDF tervnézet a kiválasztott marker környékére fókuszál.
- A kijelölt marker pulzáló kiemelést kap.
- A gomb körkörösen működik: az utolsó hiányzó után újra az első hiányzó HJ marker következik.
- A gomb bekapcsolja a `Hiányzó képek` gyorsszűrőt is, hogy a bal oldali fában csak a még feldolgozandó HJ-k maradjanak láthatók.

Ez a funkció gyorsítja a részletkép-mentési munkafolyamatot nagy tervlapok és sok HJ marker esetén.


## Save and next crop workflow

A PDF viewer toolbar and export panel now include a Save and next action. It saves the selected HJ crop, then selects the next HJ marker without a saved crop, activates its TH group, focuses the PDF view, and pulses the marker. If there are no missing crops left, the current marker remains selected.


## PDF render cancel es TH cimke kontraszt javitas

A TH cimke amber hatteret, sotet keretet, feher kulso ringet es erosebb arnyekot kapott, hogy ne olvadjon bele a tervlapba. A PDF render hiba kezelese szurt lett: zoomolas vagy ujrarendereles kozbeni megszakitott PDF.js render nem jelenik meg felhasznaloi hibakent.


## Teljes kepernyos PDF tervnezo es lebego TH/HJ fa

A kozos tervnezo kapott teljes kepernyos szerkesztes modot. Teljes nezetben a PDF.js HexPin szerkeszto kitolti a kepernyot, a TH/HJ allapotfa pedig lebego, osszecsukhato panelkent jelenik meg. ESC billentyuvel vissza lehet lepni az alap nezetbe.


## Teljes ablakmeret, huzhato TH/HJ panel es exportkeret uj mukodes

A teljes nezet gomb most teljes ablakmeret modot jelez. A lebego TH/HJ allapotfa huzhato. Az exportkeret alapbol nem jelenik meg, kulon Exportkeret lapra gomb helyezi a PDF lapra. A keret A5/A4/A3 es allo/fekvo arany szerint meretezodik, 20 szazalekos szurke attetszo hatterrel.


## PDF lapmeret kijelzes cm-ben

A PDF fejlécben a pixelmeret helyett automatikus lapmeret informacio jelenik meg: Egyedi vagy A0-A5, allo/fekvo irany es cm-ben szamitott rajzlap meret. A szamitas zoomtol fuggetlen PDF pontmeretbol indul.


## Bongeszo natív teljes kepernyos szerkesztes

A tervnezo Monitor teljes kepernyo gombja most a bongeszo Fullscreen API-t hasznalja. A Chrome felső címsora es konyvjelzosav is eltunik, igy a monitor teljes felulete hasznalhato PDF.js HexPin szerkesztesre. ESC vagy F11 kilep.


## Marker szerkeszto es export panel teljes viewportban mozgathato

A Kijelolt marker szerkesztese es a PDF export kivagas/reszletkep panelek fixed lebego panelekkent mukodnek. A fejlecenel fogva a teljes bongeszoablakon belul mozgathatok, hasonloan a TH/HJ allapotfahoz.


## Zoom stabilitas es papirlap kontener javitas

A PDF zoom valtas most elmenti a nezeti kozeppontot es render utan ugyanarra a tervi pontra gorget vissza. A PDF canvas kulon papirlap kontenert, keretet es arnyekot kapott, hogy nagyitasnal a lap ne mosodjon ossze a munkaterrel.


## Vonalzo kivul, Ctrl Alt gorgos zoom es Delete marker torles

A PDF vonalzo a papirlap kereten kivulre kerult. A PDF munkateren Ctrl+Alt+egergorgovel lehet zoomolni, Shift mellett finomabb lepesben. A kijelolt HJ marker Delete vagy Backspace billentyuvel torolheto, de szerkeszto mezoben gepeles kozben nem aktiv.


## Ctrl Alt gorgos zoom scroll blokkolas javitas

A Ctrl+Alt+egergorgo zoom most natív wheel esemenykezelovel, passive false beallitassal mukodik a PDF munkateren. Igy zoom kozben az ablak vagy a munkater nem gorget tovabb, csak a PDF nagyitasa valtozik.


## HexPin kulso szakagi vilagos szinek es technologia/egyeb csere

A HexPin nagy kulso feje most a szakag vilagos arnyalatat kapja, a belso hexagon marad az eros szakagi szin. A Technologia es Egyeb szakagi szinei fel lettek cserelve: Technologia szurke, Egyeb violet. Az exportalt reszletkep HexPin rajzolasa is koveti ugyanezt a szinlogikat.


## Save and next crop workflow

A PDF viewer toolbar and export panel now include a Save and next action. It saves the selected HJ crop, then selects the next HJ marker without a saved crop, activates its TH group, focuses the PDF view, and pulses the marker. If there are no missing crops left, the current marker remains selected.


## Teljes ablakmeret, huzhato TH/HJ panel es exportkeret uj mukodes

A teljes nezet gomb most teljes ablakmeret modot jelez. A lebego TH/HJ allapotfa huzhato. Az exportkeret alapbol nem jelenik meg, kulon Exportkeret lapra gomb helyezi a PDF lapra. A keret A5/A4/A3 es allo/fekvo arany szerint meretezodik, 20 szazalekos szurke attetszo hatterrel.


## HexPin sulyossag es statusz tervlapi jeloles

A sulyossag valasztolista epitoipari megnevezesekre valtott: Eszrevetel, Javitando hiba, Sulyos hiba, Azonnali intezkedest igenyel. A tervlapi HexPin marker sulyossag szerint kulso keretet kap: normal, narancs, vastag piros, illetve kritikus esetben ! jel. A statusz kis jeloleskent jelenik meg: Folyamatban kek potty, Ellenorzesre var lila potty, Lezart zold pipa. Az exportalt reszletkep markerrajzolasa is ezt koveti.


## Uj HJ alapertelmezett eszrevetel es lathato statusz jeloles javitas

Az ujonnan elhelyezett HJ marker alapertelmezett sulyossaga most Eszrevetel. A statusz es sulyossag logika szet lett valasztva: issueSeverity kezeli a sulyossagot, status/issueStatus kezeli a munkafolyamat statuszt. A statusz jeloles nagyobb, magasabb z-indexu badge lett a HexPin jobb oldalan.


## HexPin HJ sorszam olvashatosag javitas

A HexPin fejben megjeleno HJ sorszam, peldaul HJ-001, nagyobb betumeretet kapott a tervlapi markerben es az exportalt reszletkep markerrajzolasaban is.


## HexPin panel elrendezes, HJ masolas es TH fa athuzas

A HJ sorszam betumerete tenylegesen nagyobb lett. A teljes kepernyos tervnezetben a TH/HJ allapotfa bal oldali rogzitett oszlopkent jelenik meg. A kijelolt marker szerkeszto alaphelyzete jobb oldalra kerult, a PDF export panel alapbol osszecsukott. Ctrl vagy Cmd + marker huzas masolatot keszit uj HJ sorszammal. A kijelolt marker szerkesztoben TH valaszto jelent meg. A TH/HJ allapotfaban a HJ sor draggable, masik TH csoportra huzva atkerul a cel terepi hibahoz es uj HJ sorszamot kap.


## PDF lapozo osszes oldalszam es bal felso igazitas

A PDF lapozo mezoben az aktualis oldal mellett megjelenik az osszes oldalszam is, peldaul 2 / 12. A behivott PDF rajz alaphelyzetben bal felso sarokra igazodik, nem kozepre.


## PDF oldalszamhoz kotott HJ markerek

A HJ markerek pageNumber mezot kaptak. Uj marker az aktualis PDF oldal szamat menti, a tervlapon pedig csak az aktualis oldalhoz tartozo markerek jelennek meg. A regi oldalszam nelkuli markerek az 1. oldalhoz tartoznak. A TH/HJ allapotfaban a marker sorszama mellett megjelenik az oldalszam is.


## PDF pan mozgas es HJ kattintas szetvalasztasa

A PDF lapon az egér lenyomva tartott huzasa mar nem hoz letre HJ markert. Uj HJ csak akkor jon letre, ha a PDF lapon valodi kattintas tortenik, 6 px-nel kisebb elmozdulassal.


## PDF marker letrehozas csak bal kattintasra

A PDF lapon uj HJ marker kizarolag bal egérgombos kattintasra jon letre. Jobb egérgombbal es kozepso gorgo lenyomasaval nem keletkezik HJ marker, ezek a PDF mozgatasi/pasztazasi munkafolyamatot nem zavarjak.


## Lebego marker es export kartya hatter egységesites

A kijelolt marker szerkesztese es a PDF export kivagas lebego kartyak hattere a TH/HJ allapotfa vilagos-szurke panelstilusahoz lett igazitva. A belso inputok feher hattere megmaradt az olvashatosag miatt.


## PDF export kivagas arany javitas

A PDF export reszletkep kivagasa most a kepernyon lathato exportkeret tenyleges CSS merete es a canvas pixelmerete kozotti skala alapjan keszul. Ez megszunteti az aranytalan, torz kivagast. Az export markerrajzolas is csak az aktualis PDF oldal markereit veszi figyelembe.


## PDF exportkeret vizualis A3/A4/A5 arany javitas

Az exportkeret szazalekos magassaga most a PDF canvas tenyleges kepernyo-aranyaval korrigalva szamolodik. Igy az A3 fekvo exportkeret a tervlapon is A3 fekvo arannyal jelenik meg, nem torzul a canvas/papir arany kulonbsege miatt.


## PDF exportkeret fizikai mm alapu meretezes

Az exportkeret kepezese atallt fizikai mm alapu logikara. A PDF oldal merete a PDF pontmeretbol szamolodik mm-ben, es ehhez viszonyitva kerul fel az A5/A4/A3 allo vagy fekvo exportkeret. Ha a PDF lap A3 fekvo es az export is A3 fekvo, akkor az exportkeret a teljes lap aranyahoz igazodik. Az export nincs a zoomhoz kotve, a zoom csak a megjelenitest befolyasolja.


## PDF fizikai meret es cm vonalzo javitas

A PDF fizikai lapmerete most a PDF oldal scale=1 viewport pontmeretebol szamolodik, nem a zoomolt renderelt canvas meretebol. A vonalzo cm alapu lett: A3 fekvo lapon kb. 42 cm szeles es 29,7 cm magas ertektartomanyt kell mutatnia. Az exportkeret is ugyanezt a fizikai meretet hasznalja.


## PDF standard papirmeret normalizalas

A PDF fizikai meretet a rendszer most standard A-sorozatu papirmeretre normalizalja, ha 12% turesen belul felismerheto. A3 fekvo lap eseten a vonalzo es exportkeret 420 x 297 mm alapra all, igy a fuggoleges vonalzonak kb. 29,7 cm-ig kell tartania.


## PDF fajlnev alapu A3 fekvo meretkenyszer

Ha a PDF fajlnevben A3 es fekvo/fekv szerepel, a rendszer a fizikai lapmeretet 420 x 297 mm-re kenyszeriti. Ez felulirja a hibasan beolvasott PDF magassagot, es ugyanazt az alapot hasznalja a fuggoleges vonalzohoz, a vizszintes vonalzohoz es az exportkerethez.


## PDF fuggoleges cm vonalzo JSX javitas

A fuggoleges vonalzo meg a regi pixel-lepeses rajzolast hasznalta, ezert A3 fekvo lapon kb. 21 cm-nel allt meg. At lett kotve a cm alapu verticalRulerCmMarks es rulerHeightCm logikara, igy A3 fekvo lapon kb. 29,7 cm magassagot kell mutatnia.


## PDF exportkeret teljes lap egyezes javitas

Ha az export papirmerete es tajolasa fizikailag megegyezik a PDF lap meretevel, peldaul A3 fekvo PDF es A3 fekvo export, az exportkeret most 0%/0% pozicioval 100% x 100% meretet kap, vagyis a teljes PDF lapot lefedi. A clampExportFrame 100% meretet is enged.


## PDF exportkeret minden papirmeretnel valos fizikai arany

Az A4/A5 exportkeretbol kikerult a korabbi 0,92-es biztonsagi zsugoritas. A keret most a valos fizikai meretaranybol szamolodik: A3 fekvo lapon A4 allo 50% x 100%, A4 fekvo kb. 70,7% x 70,7%, A5 fekvo kb. 50% x 49,8%. Ha az export nagyobb lenne a PDF lapnal, akkor csak akkor skáláz le, hogy beleferjen.

## Tervkivágás és teljes tervlap melléklet mentése

A HexPin PDF tervnéző most két külön exportképet kezel:

1. HJ markerhez kötött kimetszett tervrészlet
   - `cropImageDataUrl`
   - `cropImageGeneratedAt`
   - `cropFrame`
   - `pdfFileName`
   - `pageNumber`

2. Teljes tervlap melléklet HJ jelölésekkel
   - `PlanPageExport.fullPageImageDataUrl`
   - `pdfFileName`
   - `pageNumber`
   - `markerIds`
   - `markerSerials`
   - `generatedAt`

A terepi hibafelvételi jegyzőkönyvben a hibajegy részletes adatlapján csak a kimetszett tervrészlet jelenik meg. A jegyzőkönyv végén külön mellékletblokkba kerülnek a teljes tervlapok hibahely-jelölésekkel.

