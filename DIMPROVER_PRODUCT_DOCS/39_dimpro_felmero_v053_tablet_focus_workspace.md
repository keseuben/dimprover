# DIMPRO Felmérő v0.5.3 – tablet rajzi fókuszmód és perempanelek

Dátum: 2026-07-28

## Cél

A DIMPRO Felmérő rajzi munkaterének tabletbarát, minimális panelt használó teljes képernyős változata készült el. A normál felület megmarad, a fókuszmód ugyanazt a `SurveyFloorPlanEngine` példánylogikát, adatállapotot, kijelöléseket és Undo/Redo rendszert használja.

## Belépés és kilépés

A normál fejléc új **Rajzi teljes képernyő** gombot kapott.

Belépéskor:

- a modul megpróbálja használni a böngésző natív Fullscreen API-ját;
- ha ez iPad/Safari környezetben nem engedélyezett, a CSS-alapú teljes képernyős mód akkor is működik;
- a projektfejléc, statisztikák és normál oldalpanelek eltűnnek;
- a rajzmotor kitölti a teljes `100dvh` munkaterületet.

Kilépés:

- külön **Kilépés** gombbal;
- `Esc` billentyűvel;
- natív fullscreen megszűnésekor automatikusan.

## Minimális látható kezelőfelület

Alaphelyzetben csak:

- bal oldali 48–54 px-es **Felmérési lépések** fül;
- jobb oldali 48–54 px-es **Aktív munkalap** fül;
- felső lebegő gyorssáv;
- a rajzmotor gyakran használt zoom-, rács-, méret-, hőhatár- és hibakapcsolói láthatók.

A felső gyorssáv tartalma:

- bal panel megnyitása;
- lap- és szintbeállítások;
- aktív szint és munkalap rövid jelzése;
- 2 másodperces mentés;
- világos/sötét mód;
- jobb panel megnyitása;
- kilépés.

## Bal oldali Felmérési lépések panel

- függőlegesen összecsukott peremfül;
- egérrel a bal képernyőszélhez érve automatikusan nyílik;
- érintőképernyőn koppintással nyílik;
- a munkalap kiválasztása után rögzítetlen állapotban visszacsukódik;
- külön rögzítőgombbal nyitva tartható;
- mutatja a készültségi állapotot és a teljes folyamat előrehaladását.

## Jobb oldali Aktív munkalap panel

- függőlegesen összecsukott peremfül;
- egérrel a jobb képernyőszélhez érve automatikusan nyílik;
- érintőképernyőn koppintással nyílik;
- ugyanazt az aktív szerkesztőpanelt mutatja, mint a normál nézet;
- pillér, repedés, helyiség, falszakasz, nyílászáró, fotó vagy hiba kijelölésekor automatikusan a megfelelő adatlapra vált;
- saját görgetést és külön rögzítést kapott.

## Lebegő lap- és szintbeállítások

A felső **Lap / szint** gomb külön lebegő kártyán nyitja meg:

- szintválasztást;
- új szint létrehozását;
- szint átnevezését és törlését;
- A4/A3/A2 lapméretet;
- álló/fekvő tájolást;
- automatikus vagy kézi léptéket.

A kártya a rajzterület és az oldalpanelek állapotától függetlenül nyitható és zárható.

## Pointer- és érintési szabályok

- automatikus peremnyitás csak `mouse` pointertípusnál történik;
- `touch` pointer esetén kizárólag koppintás váltja a panelt;
- ezzel elkerülhető az iPad szintetikus `mouseleave` miatti visszacsukódás;
- a panelrögzítés szinkron ref-állapotot kapott, ezért gyors egymás utáni koppintásoknál sem veszti el az állapotát;
- az oldalpanelek tartalma a felső gyorssáv alatt kezdődik, így a kezelők nem fedik egymást;
- a gyorssáv és a kilépőgomb mindig elérhető marad.

## Rajzmotor fókuszmód

A `SurveyFloorPlanEngine` új `focusMode` propot kapott.

Fókuszmódban:

- teljes szélességet és teljes képernyőmagasságot használ;
- a hosszú leíró fejléc tablet alatt rejtett;
- a gyakori rajzi eszközök megmaradnak;
- a rajzlap mérete a rendelkezésre álló képernyőhöz igazodik;
- a tájolási lábléc saját, korlátozott magasságú görgetést használ;
- a pan, zoom, helyiségmozgatás, pillér-, repedés-, térbeton-, nyílászáró-, fotó- és hibainterakció változatlan.

## Mobil overflow javítás

A normál rajzmotor belső, 760 px-es SVG-munkaterülete vizuálisan korábban is a saját `overflow-hidden` rajzterületén belül maradt, de egyes mobil böngészők a dokumentum scroll-szélességébe beleszámították. A Felmérő gyökéreleme `overflow-x-hidden` szabályt kapott. A rajzon belüli pan/zoom változatlanul működik.

## Érintett fájlok

- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Candidate tesztek

- érintett ESLint: 0 hiba, 0 figyelmeztetés;
- TypeScript: sikeres;
- production build: sikeres;
- standalone chunk: 122;
- statikus asset és PDF worker: 13/13;
- 1680 × 1050 asztali fókuszmód: sikeres;
- 1024 × 768 tablet fekvő: sikeres;
- 768 × 1024 tablet álló: sikeres;
- 834 × 1194 iPad Pro érintéses emuláció: sikeres;
- bal és jobb peremnyitás egérrel: sikeres;
- bal és jobb peremnyitás koppintással: sikeres;
- panelrögzítés és feloldás: sikeres;
- munkalapváltás: sikeres;
- lap-/szintpanel: sikeres;
- kilépőgomb és Esc: sikeres;
- normál mobilnézet 390 px: nincs vízszintes overflow;
- teljes v0.5.2 ipari regresszió: sikeres;
- konzol-, oldal- és hálózati hiba: nincs.

## Következő fejlesztési irány

- felhasználónként menthető panelrögzítési és gyorssáv-beállítás;
- rajzeszközök személyre szabható kedvencei;
- lebegő rétegkezelő;
- Apple Pencil / stylus gesztusprofil;
- kétujjas pan és pinch-zoom finomhangolás;
- teljes képernyős fotó- és hibafelvevő gyorsgombok;
- részletes tablet terepi használati teszt valós eszközön.

## Éles kiadás

- Aktív build: `7Eu4FAASidYfZlcGCw9im`
- Production rollback: `/root/dimprover/.next_before_ingatlan_v053_20260728_123302`
- Éles főoldali assetaudit: sikeres
- Éles DIMPRO Felmérő assetaudit PDF workerrel: sikeres
- Éles fókuszmód E2E asztali, tablet fekvő és tablet álló nézetben: sikeres
- Éles iPad Pro érintéses E2E: sikeres
- Éles teljes v0.5.2 ipari regressziós E2E: sikeres
- PM2 `dimprover`: online
