# 02 Modulok és funkciók

## Jelenlegi fő modulirányok

- Dashboard
- Dokumentumok
- E-napló
- Jegyzőkönyvek
- Terepi hibafelvétel
- Ütemezés
- Naptár
- Munkaerő
- Ajánlatkészítés
- Projektiktató
- Pénzügyi iktató

## Jegyzőkönyvek modul véglegesített nézetlogikája

A terepi hibafelvétel és a Hibajegyzék nem azonos funkció.

- Terepi hibafelvétel: gyors helyszíni rögzítés fotóval, felelőssel, határidővel, súlyossággal és tervi HJ / HexPin jelöléssel.
- Hibajegyzék: élő hibakövető és státuszkezelő modul, amely ugyanazokat a hibákat központi listában követi.
- PDF jegyzőkönyv / jelentés: a terepi rögzítés vagy az aktuális hibalista dokumentált exportja.
- Értesítés: az első rendszerüzenet a terepi hibafelvétel után megy ki, az ismételt és rendszeres hibakövetési értesítések a Hibajegyzékből indulnak.

Adatáramlás:

Terepi hibafelvétel rögzíti → Hibajegyzék tárolja és követi → PDF dokumentálja → Értesítés kiküldi.

A terepi hibafelvételből létrehozott hibák nem duplikált rekordként jelennek meg, hanem ugyanannak a hibának több modulnézeteként.

## Új jegyzőkönyv almenü

Az `Új jegyzőkönyv` almenü önálló indítófelületet kapott. A vizuális felépítés a terepi hibafelvétel fejléc- és lapszélesség logikáját követi, de irodai / mérnöki grafit-kék-cián színvilággal.

A sablonkártyák nem egyetlen vegyes rácsban jelennek meg, hanem három csoportban:

1. Irodai / mérnöki jegyzőkönyvek
   - Tervezői / megrendelői egyeztetés
   - Beruházói jegyzőkönyv
   - Kooperációs jegyzőkönyv

2. Terepi rögzítések
   - Terepi állapotrögzítés
   - Terepi hibafelvétel

3. Hibakövetés és egyéb
   - Hibajegyzék
   - Egyéb feljegyzés

A kártyák hexagon logikát követő vizuális jelölést kapnak, a csoportok pedig külön fejlécblokkal és leírással indulnak.

## Jegyzőkönyv sablonválasztó kártyák

A sablonválasztó végleges fő kártyái:

1. Tervezői / megrendelői egyeztetés
2. Beruházói jegyzőkönyv
3. Kooperációs jegyzőkönyv
4. Terepi állapotrögzítés
5. Terepi hibafelvétel
6. Hibajegyzék
7. Egyéb feljegyzés

A Hibajegyzék kártya nem klasszikus jegyzőkönyv sablonként működik, hanem élő hibakövető / jelentéskészítő felületként nyílik meg.

Nem fő sablonkártyák:

- Emlékeztető: naptár / feladat / emlékeztető funkció irányába kezelendő.
- Helyszíni jegyzőkönyv: későbbi exporttípus lehet, de nem külön fő sablonkártya.
- Döntési napló: az Egyeztetések alá kerül altípusként.
- Műszaki egyeztetés: az Egyeztetések csoport része.

## Jegyzőkönyvek oldalsó almenü

- Áttekintés
- Új jegyzőkönyv
- Kooperációk
- Egyeztetések
- Terepi rögzítések
- Hibajegyzék
- Archívum

## Terepi hibafelvétel

A terepi hibafelvétel modul támogatja:

- hibajegyek rögzítését
- fotók és tervfotók kezelését
- kapcsolódó PDF tervlapok kezelését
- HexPin tervi hibahely jelölést
- hibajegyhez kötött PDF exportot
- aláírás és email előkészítést


## Képszerkesztő mentés és kijelölt elemek törlése

A terepi fotó / tervfotó képszerkesztő ablak a böngészőablak méretéhez igazodik, magas z-indexen nyílik, és a betöltött fotót alapértelmezésben teljes képre illesztve mutatja. A felhasználó ezután kézzel nagyíthat vagy visszaválthat a `Teljes kép` nézetre.

A rajzolt elemek kijelölhetők és törölhetők. A kijelölt elem törlése gombbal, illetve Delete / Backspace billentyűvel is eltávolítható. A mentési gomb neve `Mentés és vissza`; mentés után a szerkesztő bezáródik és a frissített kép visszakerül a hiba szerkesztő felületre.


## Képszerkesztő bővített eszköztár

A fotó / tervfotó képszerkesztő bővített színpalettát kapott: piros, citromsárga, lila, kék, zöld, narancs, rózsaszín, cián, fekete és fehér színek érhetők el.

A szöveg eszköznél külön háttérszín választható a jobb olvashatóság érdekében. A háttér lehet átlátszó, sárga, fehér, világoszöld, világoskék, rózsaszín vagy sötét.

Az eszköztár gombjain az ikon mellett az eszköz neve is megjelenik. A rajzoló eszközök köre bővült: toll, nyíl, szaggatott kör, téglalap, DIMPROVER hexagon és szöveg.


### Hibajegyzék önálló oldal / route

- Route: `/jegyzokonyvek/hibajegyzek`.
- Stílus: a Jegyzőkönyvek / Új jegyzőkönyv blueprint-cián fejlécét és rajzlapos kártyarendszerét követi.
- Szerep: élő hibakövető felület státuszokkal, határidőkkel, felelősökkel, értesítési és PDF jelentési blokkokkal.
- Jelenlegi állapot: UI/mintaadat alapú nézet; később a terepi hibafelvétel közös hiba adatmodelljéből olvas.

### Jegyzőkönyvek áttekintés blueprint frissítés

- Az áttekintő oldal stílusa az `Új jegyzőkönyv` oldalhoz igazodik.
- Cián/blueprint fejlécet, nagyított ferde hexagon-vonalazást és rajzlapos raszter munkaterületet használ.
- A régi dashboard hero/dekoráció helyett egységes jegyzőkönyv modulfejléc jelenik meg.
- Az oldalon marad a szűrés, QR keresés, legutóbbi jegyzőkönyvek és típusonkénti lista logika.


### Jegyzőkönyv új sablonválasztó route szétbontás

Az Új jegyzőkönyv kiválasztó és a konkrét új jegyzőkönyv/munkalap nézetek külön URL-t kaptak, hogy böngészőfrissítés után ne álljanak vissza a Jegyzőkönyvek áttekintő vagy a sablonválasztó state-alapú nézetére.

Stabil útvonalak:
- `/jegyzokonyvek/uj` – sablonválasztó
- `/jegyzokonyvek/uj/terepi-hibafelvetel` – Terepi hibafelvétel
- `/jegyzokonyvek/uj/terepi-allapotrogzites` – Terepi állapotrögzítés
- `/jegyzokonyvek/uj/kooperacios-jegyzokonyv` – Kooperációs jegyzőkönyv
- `/jegyzokonyvek/uj/tervezoi-megrendeloi-egyeztetes` – Tervezői / megrendelői egyeztetés
- `/jegyzokonyvek/uj/beruhazoi-jegyzokonyv` – Beruházói jegyzőkönyv
- `/jegyzokonyvek/uj/foto-melleklet` – Fotódokumentáció / melléklet
- `/jegyzokonyvek/uj/muszaki-feljegyzes` – Műszaki feljegyzés

A kiválasztás URL-navigációval történik, nem belső React `view` state alapján.


### Terepi hibafelvétel munkakártya finomítások

A terepi hibafelvétel workflow készültségi logikája bővült. A hibatétel százalék számítása a következő önellenőrzési elemekből áll:
- Adat
- Fotó
- Fotószerkesztés / képaláírás
- Terv
- HJ felvétel
- KÉSZ

A Tervi hibajelölés kártyából kikerült a helyi tervlap-metaadat szerkesztő rész, mert a HJ elhelyezése a külön tervszerkesztő / HexPin néző modulban történik.

A Fotók / tervfotók kártyában a képaláírás mező külön címkét és kereshető mintaszöveg választót kapott.

Az Aláírás kártya többhasábos beviteli elrendezést kapott, hogy az aláírási mezők ne legyenek túl szélesek.

A Mentés / Lezárás kártyából kikerült a duplikált export összesítő fejléc, az export műveletek kéthasábosabb, kompaktabb PDF letöltési elrendezést kaptak.


### PDF export fájlnév és HexPin tervkép export pontosítás

A terepi hibafelvételi PDF export fájlnevei aláhúzásos formátumot kaptak:
- teljes PDF: `th_jkv_teljes_YY_MMDD_HHMM.pdf`
- csak jegyzőkönyv PDF: `th_jkv_YY_MMDD_HHMM.pdf`
- tervrészlet melléklet: `th_jkv_tervreszlet_YY_MMDD_HHMM.pdf`
- felelősönkénti PDF: `th_jkv_felelos_<nev>_YY_MMDD_HHMM.pdf`

A tervnézőben mentett tervrészlet-képek HexPin rajzolása a React tervnéző markerformájához igazodik: külső jelölőfej, belső szakági hexagon, TH felirat és státusz/súlyosság jelzések.


### Terepi hibafelvételi PDF export jelmagyarázat és HJ megjelenítés

A terepi hibafelvételi jegyzőkönyv PDF exportja bővült:

- a HJ sorokban a HJ saját súlyossága és státusza jelenik meg, nem a TH főhiba adata;
- a súlyosság, státusz és szakág színezett, PDF-kompatibilis jelölést kap;
- a HJ jelölések blokk alatt kompakt HexPin jelmagyarázat jelenik meg;
- a fotómelléklet elején megjelenik, ha a jegyzőkönyv külön terepi hibafelvételi tervrészlet mellékletet is tartalmaz, a HJ tervrészletek és PDF oldalak számával;
- a státusz oszlop PDF-ben tördelhetőbb lett, hogy a hosszabb státuszok ne lógjanak ki a táblázatból.


#### HexPin jelmagyarázat pontosítás

A PDF jelmagyarázat kiegészült minden jelenleg használt állapot- és súlyosságjellel:
- szakág színe,
- észrevétel,
- javítandó hiba,
- súlyos hiba,
- azonnali intézkedést igényel,
- folyamatban,
- ellenőrzésre vár,
- lezárt.

A lezárt állapot pipa jelölése CSS/PDF-kompatibilis rajzolt jelként jelenik meg, nem speciális betűkarakterként.


#### Tervrészlet melléklet jelzése fotómelléklet nélkül is

A terepi hibafelvételi PDF exportban a tervrészlet melléklet megléte önálló információs blokkban jelenik meg, nem a nagyított fotómelléklet részeként. Így akkor is látható, ha a jegyzőkönyv nem tartalmaz fotómellékletet, de tartalmaz HJ tervrészlet mellékletet.


#### Egy TH hibához több PDF tervlap és fotóforrás választó

A terepi hibafelvétel tervi hibajelölése támogatja, hogy egy TH hibához több PDF tervlap is kapcsolható legyen. Például ugyanazon terepi hiba jelölhető földszinti és emeleti alaprajzon is. A kapcsolt PDF tervlapok külön tervkártyaként jelennek meg, és mindegyiken saját HJ HexPin jelölések menthetők.

A fotó / tervfotó hozzáadása a PDF tervfeltöltéshez hasonló lenyíló forrásválasztót kapott. Aktív források: kamera és galéria; későbbi előkészített források: projekt fotótár, dokumentumtár / tervfotó, Google Drive, OneDrive / SharePoint.


#### Fotóhely HexPin marker a PDF tervlapon

A terepi hibafelvétel PDF.js tervnézője bővült fotóhely jelöléssel. A felhasználó a HJ hibahely marker mellett külön `Fotóhely` módot választhat, majd a kiválasztott fotó (`F-001`, `F-002`, stb.) készítési helyét DIMPROVER hexagon markerrel elhelyezheti a PDF tervlapon. A fotóhely marker nem maga a fotó, hanem annak tervi pozíciója.

A HJ és fotóhely markerek ugyanazon tervlapon együtt látszanak, de a HJ darabszámba és HJ tervrészlet mellékletbe csak a hibahely markerek számítanak bele.


#### Lebegő fotóhely választó panel

A PDF.js tervnéző fotóhely jelölési módja bővült mozgatható, lebegő fotóhely választó panellel. A panel a feltöltött képek kicsinyített előnézetét, `F-001` jelét és fotótípusát jeleníti meg, így a felhasználó vizuálisan tudja kiválasztani, melyik fotó készítési helyét szeretné a tervlapon megjelölni.


#### Fotóhely marker kártyaforma és panelhúzás javítás

A PDF.js tervnéző fotóhely választó lebegő panelének húzása stabilizálva lett. A panel nem marad drag állapotban az egér elengedése után, és a fotópanel saját pozícióját használja mozgatáskor.

A fotóhely jelölő a HJ HexPintől eltérő megjelenést kapott: kék keretes fotókártya-marker, alsó tervi mutató tüskével. Ha rendelkezésre áll a feltöltött kép előnézete, a markerben kisméretű fotó-előnézet is megjelenik.


#### Fotóhely marker a tervrészlet PDF exportban

A terepi hibafelvételi A4 tervrészlet melléklet PDF exportja a HJ HexPin mellett a kivágási kereten belül lévő fotóhely markereket is rárajzolja a rajzra. A fotóhely marker PDF-ben külön kék fotókártya-jelölőként jelenik meg, alsó mutató tüskével. A fotóhely marker továbbra sem számít HJ hibajelölésnek, ezért a HJ darabszám változatlan marad.

### FHJ fotóhely jelölés

A terepi hibafelvételi tervi jelölések között a fotóhely külön azonosítót kapott: `FHJ-001`, `FHJ-002`, stb. A `F-001` továbbra is maga a fotó sorszáma, míg az `FHJ-001` a fotó tervi helyének jelölése.

A jegyzőkönyv PDF-ben a HJ és FHJ jelölések egy közös tervi jelölési blokkban jelennek meg, hogy a tervrészlet melléklet önállóan is értelmezhető legyen.

## IFC tervnéző / modellkezelő alapok

Frissítés: 2026-06-20

Az IFC néző a terepi hibafelvétel tervi hibajelölési workflow részeként működik. A stabil alap továbbra is a képernyőpozíciós IFC-HJ / IFC-FHJ jelölés, amely nem írja felül a későbbi 3D ponthoz kötött marker irányt.

Aktuális funkciók:
- IFC modell betöltés `@thatopen/components`, `@thatopen/fragments` és `web-ifc` alapon.
- DIMPROVER betöltési állapotjelző nagy IFC fájlokhoz.
- HJ / FHJ képernyőpozíciós marker elhelyezés.
- IFC marker szerkesztőpanel: TH kapcsolat, szakág, megnevezés, helyszín, súlyosság, státusz, felelős, határidő, vállalkozó, leírás.
- IFC nézet PNG export.
- Kijelölt marker és összes marker IFC nézetkép mentése.
- Bal oldali TH/HJ fa IFC kép mentve / IFC kép hiányzik státuszkezeléssel.
- IFC elem kijelölés alap: kattintott modellnézeti pont, Express ID / GlobalId / elemnév / típus / szint panel, ha a runtime visszaadja.
- Mérési mód előkészítés: két képernyőpont közötti nézeti távolság előnézet.
- Metszet mód előkészítés: UI állapot későbbi vágósík-logikához.

Későbbi bővítési irány:
- Valódi IFC objektum tulajdonságlista.
- IFC kategória / elem ki-be kapcsolás.
- Valós mértékegységes 3D mérés.
- Metszősík / clipping plane.
- `anchorMode: "world"` alapú, 3D ponttal együtt mozgó HJ marker.


### IFC exportkeret

Az IFC néző exportja A5 / A4 / A3 és álló / fekvő exportkerettel működik. A keret a modellnézet felett húzható overlay. Bekapcsolt keretnél a PNG export és a marker nézetkép mentés csak a kereten belüli nézetrészt menti. Kikapcsolt keretnél a teljes IFC nézet exportálható.

Technikai megjegyzés: az IFC WebGL renderer exportbarát beállítással fut, hogy az aktuális modellnézet canvas tartalma képpé menthető legyen.


## DIMPRO Eseményszervező miniapp - 2026-06-28

Létrejött az első házon belüli MVP jellegű eseményszervező oldal a családi születésnapi szervezéshez. Route: /esemeny/torta, rövid belépő route: /torta. A felület PIN-kódos belépést használ, jelenlegi kód: 8565. A kezdő szöveg Mama 85. és Apu 65. születésnapjához készült, idézetkártyával. A későbbi cél az esemeny.dimpro.hu aldomain alatt futó DIMPRO Eseményszervező miniapp, vendéglista, szavazások, ki mit hoz lista, ételérzékenységek, szervezői összesítő, üzenőfal és AI szövegjavaslat funkcióval.


## DIMPRO Eseményszervező / Torta oldal

A torta eseményoldal meghívotti működése: közös eseménykód után regisztráció vagy meglévő személy kiválasztása saját 4 számjegyű PIN-kóddal. A regisztráció mezői: teljes név, becenév, család/csapat/csoport neve, e-mail cím, telefonszám, PIN. A csoportnév alapján a rendszer csoportosítja a családtagokat és csapattagokat. A válaszok, szavazatok, felajánlások és üzenetek az aktív személyhez kötve jelennek meg. Az AI szövegjavaslat csak szervezői nézetben látható.


### Eseményszervező csoportválasztás és átsorolás

A torta eseményoldalon az új regisztrált személy a meglévő regisztrált névsor alapján kiválaszthatja, melyik család/csapat/csoport alá szeretne bekerülni. Ha nem talál megfelelő csoportot, új csoportnevet is megadhat. A már belépett személy a jobb oldali névsor panelen saját magát át tudja helyezni másik meglévő csoportba, vagy új csoportot is létrehozhat saját maga számára. Az áthelyezés frissíti a személyhez kötött választ, felajánlást és üzenetet is az új csoportnévvel.


### Családfa törlés funkció

A családfa készítőben az újonnan felvett személydobozok törölhetők. A Mama és Apu központi zárolt doboza nem törölhető. A családfa-hozzáírások / pontosítások mellett is van törlés gomb, így a hibás vagy téves rögzítések javíthatók.

## DIMPRO GazdaSegéd modul – MVP felület és domain stratégia (2026-07-05)

A DIMPRO GazdaSegéd a DIMPRO modul app család mezőgazdasági terepi adatgyűjtő és export előkészítő modulja. Célja, hogy gazdák, telepi dolgozók és agrár-adminisztrátorok gyorsan, magyar nyelvű, mobilközpontú felületen rögzíthessék a terepen keletkező adatokat.

### Javasolt egységes domain logika

- Központi belépés és modulválasztó: `app.dimpro.hu`
- Éles modul útvonal: `app.dimpro.hu/gazdaseged`
- Nyilvános marketing oldal: `dimpro.hu/gazdaseged`
- Rövid, bemondható cím / opcionális átirányítás: `gazdaseged.dimpro.hu` → `/gazdaseged`

Az egységes belépési oldal minden DIMPRO modulhoz közös legyen. Bejelentkezés után a felhasználó a jogosultságai alapján látja, hogy mely modulokat használhatja: Árutér, GazdaSegéd, Munkalap, KépBOX, későbbi modulok.

### Első MVP felület

Létrejött az `app/gazdaseged/page.tsx` route. A felület jelenleg frontend MVP / működési prototípus, amely tartalmazza:

- mobil első GazdaSegéd kezdőnézetet,
- napi munka / terepi rögzítés nézetet,
- állattartási gyors esemény nézetet,
- dolgozói korlátozott hozzáférésű mobil nézetet,
- desktop admin áttekintő dashboardot,
- friss rögzítések táblázatot,
- szűrés és export UI blokkot,
- role-based jogosultsági bemutatót: Gazda Admin, Telepvezető, Dolgozó,
- domain stratégiai döntési blokkot.

### MVP modulok

- Napi munka
- Állattartás
- Gépnapló
- Raktár
- Fotók
- Exportok

### Szerepkörök

- Gazda Admin: teljes hozzáférés.
- Telepvezető: operatív hozzáférés.
- Dolgozó: korlátozott hozzáférés, napi munka, állattartás, fotók, saját feladatok.

### Következő fejlesztési lépés

A következő körben backend adatmodell és valódi mentés szükséges:

- gazdaság / telep / tábla / állat / gép / dolgozó törzsadatok,
- eseményrögzítés adatmodell,
- fotófeltöltés és optimalizálás,
- offline mentés és későbbi szinkronizálás,
- Excel / CSV / PDF export generálás,
- DIMPRO Account termékjogosultsági bekötés.

## DIMPRO app domain egységesítés és GazdaSegéd bővített MVP (2026-07-06)

### Végleges DIMPRO elérési szabály

- `dimpro.hu` = nyilvános marketing és termékbemutató oldalak.
- `app.dimpro.hu` = központi belépés, account és modulválasztó.
- `app.dimpro.hu/<modul>` = tényleges zárt app felület.
- `<modul>.dimpro.hu` = rövid, könnyen bemondható átirányító cím a megfelelő app útvonalra.

A `dimpro.hu/login` nem fő belépési cím. A központi belépési cím: `app.dimpro.hu/login`.

### GazdaSegéd jelenlegi MVP tartalom

A `components/gazdaseged/GazdaSegedClient.tsx` komponens bővített, működő frontend MVP-t tartalmaz:

- role switch: Gazda Admin, Telepvezető, Dolgozó,
- modulfülek: Áttekintés, Rögzítés, Állattartás, Feladatok, Export, Beállítás,
- napi munka / növény / állattartás / gépnapló / raktár / fotó eseményrögzítés,
- böngésző localStorage alapú demo mentés,
- rögzítési lista, törlés, keresés és típus szerinti szűrés,
- állattartási törzslista demo adatokkal,
- dolgozói feladatlista státuszváltással,
- CSV export, JSON export és nyomtatás/PDF előkészítés,
- offline/szinkron státusz jelölés,
- mobil első, reszponzív admin felület.

A `components/gazdaseged/GazdaSegedMarketing.tsx` komponens a `dimpro.hu/gazdaseged` nyilvános marketing nézetet adja. Az `app/gazdaseged/page.tsx` host alapján választ: dimpro.hu alatt marketing oldal, app.dimpro.hu alatt app felület.

### Következő backend fejlesztési kör

- Supabase/PostgreSQL adatmodell: gazdaság, telep, tábla, állat, gép, dolgozó, raktár, esemény, feladat, fotó.
- Valós auth és product access bekötés GAZDASEGED termékkóddal.
- Fotófeltöltés, automatikus képtömörítés és célmappa kapcsolat.
- Offline queue és későbbi szinkronizálás.
- Szerveroldali Excel és PDF export.

## DIMPRO GazdaSegéd fő modulok használható MVP szintje (2026-07-06)

A GazdaSegéd appban a marketing/bemutató kártyákon szereplő hat fő modul külön belső appfelületként is elkészült:

1. Napi munka
- napi munkanapló rögzítés,
- dátum, munka típusa, tábla/helyszín, kultúra, dolgozó, terület, munkaidő, gép, anyag és megjegyzés,
- lista, törlés és kapcsolódó feladat létrehozása.

2. Állattartás
- állat felvétele azonosítóval/fülszámmal, fajjal, csoporttal és státusszal,
- állatesemény rögzítése: ellés/születés, oltás, kezelés, termékenyítés, elhullás/selejtezés, etetés, megfigyelés,
- állatlista, eseménylista, törlés és feladatgenerálás.

3. Gépnapló
- géptörzs: gépnév, típus, státusz, üzemóra,
- gépnapló bejegyzés: géphasználat, tankolás, géphiba, javítás, karbantartás,
- kezdő/záró üzemóra, üzemanyag, gépkezelő, tábla/hely és megjegyzés,
- lista, törlés és feladatgenerálás.

4. Raktár
- készletcikk felvitele kategóriával, mértékegységgel, aktuális készlettel, minimum készlettel és hellyel,
- készletmozgás: bevét, kiadás, áthelyezés, leltár korrekció,
- automatikus készletmódosítás bevét/kiadás esetén,
- minimum készlet figyelés és feladatgenerálás.

5. Fotók
- fotó/fájlnév, kapcsolódó modul, tárgy, helyszín és leírás rögzítése,
- böngészős képelőnézet base64 dataURL-lel MVP módban,
- fotókártya lista, törlés és feladatgenerálás.

6. Export
- modulonkénti CSV export,
- teljes JSON export,
- nyomtatás/PDF előkészítés,
- export előtti keresési mező.

Az adatok továbbra is böngésző localStorage-ben tárolódnak MVP szinten. Backend körben szükséges: Supabase/PostgreSQL adatmodell, valódi felhasználó/gazdaság/jogosultság kapcsolat, képtár, fájlfeltöltés, offline queue és szerveroldali Excel/PDF export.


## GazdaSeged marketing kartya hivatkozasok (2026-07-06)

A dimpro.hu/gazdaseged nyilvanos bemutato oldal hat modul kartyaja kattinthato lett:

- Napi munka: https://app.dimpro.hu/gazdaseged?view=daily
- Allattartas: https://app.dimpro.hu/gazdaseged?view=animals
- Gepnaplo: https://app.dimpro.hu/gazdaseged?view=machines
- Raktar: https://app.dimpro.hu/gazdaseged?view=warehouse
- Fotok: https://app.dimpro.hu/gazdaseged?view=photos
- Export: https://app.dimpro.hu/gazdaseged?view=exports

A GazdaSeged app kliensoldala olvassa a view query parametert, es bejelentkezett felhasznalo eseten kozvetlenul a megfelelo belso modulnezetet nyitja meg.


## GazdaSeged vegleges app.dimpro.hu linkek (2026-07-06)

Az app.dimpro.hu DNS + nginx + SSL beallitas utan a GazdaSeged bemutato oldal kartya linkjei visszakerultek a vegleges app domainre:

- Napi munka: https://app.dimpro.hu/gazdaseged?view=daily
- Allattartas: https://app.dimpro.hu/gazdaseged?view=animals
- Gepnaplo: https://app.dimpro.hu/gazdaseged?view=machines
- Raktar: https://app.dimpro.hu/gazdaseged?view=warehouse
- Fotok: https://app.dimpro.hu/gazdaseged?view=photos
- Export: https://app.dimpro.hu/gazdaseged?view=exports


## GazdaSeged Beallitas modul mukodo MVP (2026-07-06)

A GazdaSeged Beallitas modulban a korabbi statikus kartyak helyett mukodo helyi admin felulet keszult:

### Szerepkorok
- Felhasznalo felvetele nev, e-mail, telefon, szerepkor es statusz mezokkel.
- Szerepkorok: Gazda Admin, Telepvezeto, Dolgozo.
- Felhasznalok tablazatos szerkesztese, statusz valtasa, torlese.
- Aktiv szerepkor osszesito kartya.

### Torzsadatok
- Gazdasag alapadatainak szerkesztese: nev, tulajdonos/admin, telepules, adoszam/azonosito, telefon, e-mail.
- Tabla/terulet torzsadatok felvetele es tablazatos szerkesztese.
- Tabla mezok: nev, kultura, terulet ha, hely, megjegyzes.
- Torzsadat rekordok localStorage-ben mentodnek MVP szinten.

### Szinkron
- Helyi MVP szinkron gomb: az offline napi munka rekordokat szinkron statuszra allitja.
- Backend-ready jeloles: felho elokeszitett statusz beallitasa.
- Teljes JSON export.
- Teljes JSON import.
- Demo adatok visszaallitasa.

Fontos: ez meg frontend/localStorage szintu mukodes. A valodi tobbfelhasznalos jogosultsag, szerveres szinkron, audit log es kozponti adatbazis Supabase/PostgreSQL backend fejlesztest igenyel.

## DIMPRO Drive webes felület MVP

Elérési út:

```text
/drive
```

Funkciók MVP állapotban:

- projektlista megjelenítés,
- fájllista táblázat,
- kijelölt fájl részletpanel,
- Drive API health lekérés,
- projektek és fájlok metadata lekérése dev tokennel,
- storage terv megjelenítés előkészítése,
- demo adatokkal betöltés token nélkül.

Biztonsági szabály:

- dev token csak memóriában lehet,
- nincs localStorage/config mentés,
- nincs éles ügyfélfájl-feltöltés,
- nincs valós Object Storage írás.

## DIMPROVER főmodul-regiszter és jobb board főmodulváltó – 2026-07-10

A DIMPROVER főmodulok adatai közös regiszterbe kerültek:

```text
components/layout/dimproverModuleRegistry.ts
```

A regiszter kezeli:

- főmodul azonosító,
- cím és rövid címke,
- alap útvonal,
- leírás és bulletpontok,
- ikon,
- akcentusszín,
- állapot,
- feature flag,
- útvonal-prefix alapú aktív főmodul felismerés.

A jobb oldali board és a modulválasztó kártyák közös kapcsoló komponense:

```text
components/layout/DimproverModuleSwitch.tsx
```

A cél, hogy a Munkatér, Projektkapu, Építéshely, Vállalkozói Műhely, Üzemeltetés és Admin főmodulok navigációja közös adatforrásból épüljön, később jogosultság és előfizetés alapján szűrhető módon.

## DIMPRO Fájlműhely – Költségvetés Műhely MVP / v4.89

A DIMPRO Fájlműhely asztali szoftverben új főmodulként megjelent a **Költségvetés Műhely**. A modul célja első körben saját belső használatú költségvetési előkészítő felület, később leválasztható önálló DIMPRO Költségvetés Műhely szoftverré vagy külsős ajánlatkészítővé.

MVP funkciók:
- külön modul fájl: `dimpro_budget_workshop_module.py`;
- új `K / Költségvetés Műhely` menüpont és gyorsgomb a Fájlműhely GUI-ban;
- költségvetési tételtábla;
- egyedi tétel létrehozása, szerkesztése, törlése;
- kijelölt tétel másolása egyedi költségvetési tétellé;
- főanyag / rezsianyag külön forráskezelése: `VÁLL`, `MEGR`, `VEGYES`, `NINCS`;
- 2026-os induló nettó rezsióradíj: `7 830 Ft/óra`;
- normaidő alapú munkadíjszámítás;
- nettó / ÁFA / bruttó összesítés;
- DIMPRO JSON mentés és megnyitás;
- Excel export előkészítése, `openpyxl` hiányában CSV fallback;
- szerveres DIMPRO normatár-frissítés gombhelye és állapotmentés.

Termékbiztonsági szabály: a modul nem TERC-klón. A TERC/ÉNGY adat csak belső referencia / forrásadat lehet. Külsős vagy piaci exportban nyers TERC/ÉNGY tételadat nem jelenhet meg; ott saját DIMPRO tételkód, tételnév és árlogika szükséges.

## DIMPRO Fájlműhely – v4.90 Költségvetés Műhely indítópult és export bővítés

A v4.90 javítás célja a v4.89 Költségvetés Műhely MVP gyors stabilizálása és jobb Fájlműhely-integrációja.

Változások:
- a teljes szoftver főablakcíme ismét csak `DIMPRO Fájlműhely v4.90 GUI MVP`, a Költségvetés Műhely nem írja át a program nevét;
- az indítópulton a `Műszaki műhely` csoportba bekerült a `Költségvetés Műhely` kártya;
- a kártya a `PDF Műhely` alatt és a `Szakági mennyiségmérő` fölött jelenik meg;
- a felső gyorsgomb felirata `Ft Költs.` lett;
- a Költségvetés Műhely bal panelén megjelent a mentett költségvetések listája;
- a mentett költségvetések dupla kattintással vagy `Megnyitás` gombbal visszanyithatók;
- bekerült a `PDF export` gomb;
- ReportLab hiányában HTML fallback export készül;
- közös `budget_totals` helper készült nettó / ÁFA / bruttó / anyag / díj / gépdíj összesítéshez.

## DIMPRO Fájlműhely – v4.91 beépített ReportLab PDF motor

A v4.91 célja, hogy a Költségvetés Műhely PDF exportja ne függjön attól, hogy a felhasználó külön telepítette-e a ReportLab csomagot.

Változások:
- a VPS Python környezetére telepítve lett a ReportLab;
- a Fájlműhely v4.91 csomagba bekerült a `vendor/reportlab` mappa;
- a `dimpro_budget_workshop_module.py` induláskor automatikusan hozzáadja a `vendor/` mappát a Python `sys.path` listához;
- a PDF export elsődlegesen a beépített ReportLab motort használja;
- a HTML fallback továbbra is megmaradt biztonsági tartalékként;
- a felhasználónak nem kell külön ReportLab telepítést futtatnia, ha a csomagot egyben bontja ki és a `vendor/` mappa a program mellett marad.

Fontos korlát:
Ez még nem teljes, egyfájlos Windows `.exe` csomagolás. A beépítés jelenleg mappaszintű: a `vendor/` mappának a program mellett kell maradnia.

## DIMPRO Fájlműhely – v4.92 Windows EXE BuildKit

A v4.92 célja a Windows `.exe` csomagolás előkészítése. A Linux VPS-ről natív Windows `.exe` közvetlenül nem készíthető, ezért a csomag Windows build környezetre előkészített PyInstaller build kitet tartalmaz.

Beépített elemek:
- `build_tools/DIMPRO_Fajlmuhely_Windows.spec`;
- `build_tools/build_windows_exe.bat`;
- `build_tools/check_build_environment.py`;
- `BUILD_WINDOWS_EXE_README.txt`;
- `wheelhouse_win312/` offline Windows 64-bit wheelhouse;
- továbbra is megmarad a `vendor/reportlab` beépített PDF motor.

A Windows build kit célja, hogy Windows 10/11 64-bit gépen egy parancsból elkészíthető legyen a PyInstalleres `DIMPRO_Fajlmuhely.exe` csomag.

## DIMPRO Fájlműhely – v4.93 Költségvetés export módok és sormozgatás

A v4.93 a Költségvetés Műhely használhatóságát és exportbiztonságát javítja.

Új funkciók:
- export mód választó: `Ügyfél export` / `Belső export`;
- ügyfél exportban a belső forráskódok, TERC/ÉNGY referenciaadatok és belső árforrás mezők nem jelennek meg;
- belső exportban a forrás- és referenciaadatok megjelenhetnek belső ellenőrzéshez;
- tételsor mozgatása `Fel` / `Le` gombbal;
- JSON mentésben az export mód is tárolódik;
- HTML és PDF export az export módhoz igazodik;
- Windows BuildKit és beépített ReportLab továbbra is a csomag része.

## DIMPRO Fájlműhely – v4.94 Költségvetés saját tételtár

A v4.94 a Költségvetés Műhelyben elindítja a vállalkozói saját tételadatbázis / saját tételtár MVP alapját.

Új funkciók:
- bal oldali `Saját tételtár` panel;
- saját tételtár keresőmező;
- kijelölt költségvetési tétel mentése saját tételtárba;
- saját tételtárból tétel beszúrása az aktuális költségvetésbe;
- saját tétel törlése a saját tételtárból;
- saját tételtár JSON export;
- saját tételtár helyi adatfájl: `config/dimpro_budget_own_items.json`;
- azonos tételkód esetén frissítés történik, nem duplikálás.

Termékszabály:
A saját tételtár nem központi DIMPRO normatár, és nem TERC/ÉNGY másolat. Ez a vállalkozó / felhasználó saját adatbázisának helyi MVP alapja.

## DIMPRO Fájlműhely – v4.95 Saját tételtár import és munkanem szűrő

A v4.95 a Költségvetés Műhely saját tételtárát bővíti import/export és szűrési funkciókkal.

Új funkciók:
- saját tételtár JSON import;
- saját tételtár munkanem szűrő: `Minden munkanem` / konkrét munkanemek;
- saját tételtár keresés és munkanem szűrés együtt;
- aktuális költségvetés összes menthető tételének tömeges mentése saját tételtárba;
- importnál és tömeges mentésnél azonos tételkód esetén frissítés történik, nem duplikálás;
- új top gomb: `Összes menthető sajátba`;
- új tételtábla toolbar gomb: `Összes sajátba`;
- saját tételtár panelben külön `Import` és `Export` gomb.

Termékszabály:
A saját tételtár továbbra is helyi vállalkozói adatbázis. Nem központi DIMPRO normatár, és nem TERC/ÉNGY másolat.

## DIMPRO Fájlműhely – v4.96 Saját tétel szerkesztés és munkanem összesítő

A v4.96 a Költségvetés Műhely saját tételtárát és összesítő rendszerét fejleszti tovább.

Új funkciók:
- saját tételtárban kijelölt tétel szerkesztése;
- saját tételtár dupla kattintásra szerkesztést nyit;
- új saját tételtár gomb: `Szerk.`;
- jobb oldali `Munkanem összesítő` panel;
- költségvetés munkanem szerinti nettó összesítése;
- munkanem összesítő HTML exportban;
- munkanem összesítő PDF exportban;
- Excel `Összesítő` munkalap bővítése munkanem szerinti bontással.

## DIMPRO Fájlműhely – v4.97 Saját tételtár Excel/CSV export és CSV import

A v4.97 a Költségvetés Műhely saját tételtárát táblázatos hordozhatósággal bővíti.

Új funkciók:
- saját tételtár export választható formátumokkal: `XLSX`, `CSV`, `JSON`;
- saját tételtár CSV export pontosvesszővel tagolt, Excel-kompatibilis UTF-8 BOM formátumban;
- saját tételtár XLSX export, ha az OpenPyXL elérhető;
- OpenPyXL hiányában XLSX export helyett CSV fallback készül;
- saját tételtár CSV import;
- CSV importnál azonos tételkód esetén frissítés történik, nem duplikálás;
- saját tételtár táblázatos mezőséma hozzáadva: kód, tételnév, leírás, munkanem, mennyiség, egység, anyagforrások, árak, normaidő, díjak, státusz, forrás, belső referencia, megjegyzés.

Megjegyzés:
A Windows BuildKit / wheelhouse tartalmazza az OpenPyXL csomagot. A VPS tesztkörnyezetben az XLSX útvonal CSV fallbackkel lett ellenőrizve.

## DIMPRO Fájlműhely – v4.98 Ajánlatfejléc és fedőlap

A v4.98 a Költségvetés Műhelyt ajánlat-előkészítő irányba fejleszti.

Új funkciók:
- ajánlat száma mező;
- keltezés mező;
- ajánlat érvényességi dátum mező;
- fizetési feltétel mező;
- teljesítési határidő mező;
- vállalkozó neve, címe, adószáma és elérhetősége mezők;
- megrendelő cím mező;
- ajánlati bevezető szöveg;
- ajánlati záró megjegyzés;
- ajánlatadatok mentése DIMPRO JSON-ba;
- ajánlatadatok visszatöltése DIMPRO JSON megnyitáskor;
- HTML ügyfél export fedőlap jellegű ajánlatfejléccel;
- PDF export ajánlatfejléccel;
- Excel tételes és összesítő lap ajánlatadatokkal;
- PDF fájlnévben az ajánlatszám használata.

Biztonsági szabály:
Ügyfél exportban továbbra sem jelenhet meg belső TERC/ÉNGY referenciaadat vagy belső forráskód.


## 2026-07-12 – Webes Értesítési Központ MVP

Elindult a webes DIMPROVER / Projektkapu Értesítési Központ MVP fejlesztése. A webes felület az elsődleges hivatalos értesítési felület, a DIMPRO Drive Desktop / Fájlműhely csak opcionális kliensként ugyanazokat a szerveres értesítéseket és olvasottsági állapotokat használja.

MVP funkciók:
- értesítési lista és olvasatlan számláló,
- NotificationBell és gyorslista a jobb oldali boardon és a felső sávban,
- teljes `/notifications` Értesítési Központ oldal,
- olvasottnak jelölés `readAt` állapottal,
- archiválás felhasználónkénti `archivedAt` állapottal,
- projekt- és fájlkapcsolat mezők,
- Drive feltöltés lezárásakor `FILE_UPLOADED` értesítés generálása,
- web–desktop közös API előkészítése.

## Fejlesztési Napló / AI Kontextustár MVP – 2026-07-13

Elindult a belső DIMPRO fejlesztési tudástár első MVP verziója. Célja, hogy a DIMPRO/DIMPROVER fejlesztési ötletek, döntések, feladatok, hibák, kódolási utasítások és más AI-nak átadható kontextus ne vesszen el külön csevegők között.

Elérési út:

```text
/admin/fejlesztesi-naplo
```

Védelmi szabály:

- a felület csak licencadmin belépés után használható;
- a böngészőben meglévő `dimproLicenseAdminKey` alapján ellenőrzi a jogosultságot;
- az API szerveroldalon a DIMPRO licencadmin kulccsal védett.

MVP funkciók:

- új fejlesztési bejegyzés létrehozása;
- meglévő bejegyzés szerkesztése;
- archiválás, visszaállítás és törlés;
- típus választó: ötlet, fejlesztési döntés, feladat, hiba, javítás, modulterv, AI kontextus, kódolási utasítás, release megjegyzés, későbbre mentve;
- státusz választó: új, átgondolás alatt, kódolásra vár, folyamatban, tesztelés alatt, kész, elhalasztva, visszavonva, archiválva;
- prioritás választó: alacsony, normál, magas, kritikus;
- modulhoz kötés DIMPRO/DIMPROVER modulnevekkel;
- keresés címben, leírásban, AI kontextusban, forrásban és címkékben;
- szűrés típus, státusz, modul, prioritás és archivált állapot alapján;
- külön `AI kontextus / új csevegőbe másolható szöveg` mező;
- automatikusan összerakott, vágólapra másolható AI átadó blokk;
- szerveroldali JSON tárolás MVP szinten.

Tárolás MVP-ben:

```text
/root/dimprover/.dimprover/dev-notes/dev-notes.json
```

Későbbi fejlesztési irány:

- Verziónapló / changelog összekapcsolása;
- release checklist és build eredmények rögzítése;
- dokumentációfrissítési napló kapcsolása;
- fájlmellékletek és PDF/DOCX előzményanyagok csatolása;
- később PostgreSQL / Prisma adatmodellre költöztetés;
- Codex Cloud / külső AI review exportcsomag készítése.

### Fejlesztési Napló kapcsolatkezelés és közös fejlesztési csomagok – 2026-07-13

A Fejlesztési Napló bővült a többfelületű fejlesztések kezelésével. A cél, hogy például a webes Értesítési Központ és az asztali Drive Desktop Értesítések ne különálló, széteső fejlesztések legyenek, hanem egy közös fejlesztési csomaghoz kapcsolódjanak.

Új logikai mezők:

- Fejlesztési csomag / Epic;
- Érintett felületek;
- Kapcsolódó fejlesztési bejegyzések;
- Függőségek;
- Blokkoló tényezők;
- Másik csevegő / párhuzamos fejlesztés állapota;
- Külső AI / Codex / reviewer megjegyzés;
- Utolsó átadó összefoglaló.

Új érintett felület kategóriák:

- Webes felület;
- Asztali szoftver;
- Mobil / PWA;
- Szerver API;
- Közös rendszerlogika;
- Adatmodell / adatbázis;
- Dokumentáció;
- Üzemeltetés;
- AI / külső reviewer.

A modul lista kibővült közös fejlesztési modulokkal is, például:

- Közös Értesítési Motor;
- Webes Értesítési Központ;
- Drive Desktop Értesítések;
- E-mail / SMTP értesítések;
- Szerver API / közös backend;
- Szerverőr / monitoring;
- Fejlesztési Napló / AI Kontextustár.

A másolható AI átadó blokk ezeket az új mezőket is tartalmazza, így egy másik csevegő vagy külső AI reviewer láthatja, melyik fejlesztési csomaghoz tartozik a bejegyzés, mely felületeket érinti, és milyen más bejegyzések kapcsolódnak hozzá.

## AI Kontextussegéd a Fejlesztési Naplóban – 2026-07-13

A Fejlesztési Napló / AI Kontextustár bővült egy kézi gombnyomásos AI Kontextussegéd panellel.

Alapelv:

- az AI nem fut automatikusan;
- minden művelet külön gombbal indítható;
- minden gombon látható a becsült Ft költség;
- az AI válasz előnézetbe kerül;
- a felhasználó külön gombbal veheti át a javaslatot valamelyik mezőbe;
- az AI nem írja át automatikusan a fejlesztési naplóbejegyzést.

AI műveletek MVP-ben:

- AI mezőellenőrzés;
- AI átadó blokk rendezése;
- AI kódoló chat prompt készítése;
- AI tesztlista készítése;
- AI kapcsolódó bejegyzések elemzése;
- AI modulállapot riport;
- AI alapverzió / MVP hiányosság ellenőrzés;
- AI ellentmondáskeresés;
- AI verziónapló / changelog szöveg;
- AI következő fejlesztési sorrend / roadmap;
- AI release előtti audit.

Költségvédelem:

- napi becsült limit;
- havi becsült limit;
- usage JSONL napló;
- modell és tokenár env változókból állítható;
- API kulcs hiányában a felület látható, de futtatás nem indul.

Új API:

```text
GET /api/license/dev-notes-ai
POST /api/license/dev-notes-ai
```

Új szerveroldali modul:

```text
app/lib/license/dev-notes-ai.ts
```

Új klienskomponens:

```text
components/admin/DevNotesAiAssistant.tsx
```

Szükséges környezeti változó valódi AI futtatáshoz:

```text
OPENAI_API_KEY
```

Opcionális költség- és modellbeállítások:

```text
DIMPRO_DEV_NOTES_AI_MODEL
DIMPRO_DEV_NOTES_AI_DAILY_LIMIT_USD
DIMPRO_DEV_NOTES_AI_MONTHLY_LIMIT_USD
DIMPRO_DEV_NOTES_AI_WARNING_LIMIT_USD
DIMPRO_DEV_NOTES_AI_USD_HUF
DIMPRO_DEV_NOTES_AI_INPUT_USD_PER_1M
DIMPRO_DEV_NOTES_AI_OUTPUT_USD_PER_1M
DIMPRO_DEV_NOTES_AI_DISABLED
```

## Release Központ / Élesítési napló – 2026-07-13

Létrejött a DIMPROVER belső Release Központ MVP.

Cél:

- DEV → STAGING → PRODUCTION állapotkövetés;
- release candidate nyilvántartás;
- élesítési checklist;
- technikai és publikus changelog külön kezelése;
- build, lint, TypeScript és smoke teszt eredmények rögzítése;
- rollback terv és rollback útvonal rögzítése;
- kapcsolódó Fejlesztési Napló átadó blokk tárolása.

Fontos biztonsági elv:

A Release Központ MVP nem végez automatikus élesítést és nem másolja át automatikusan a DEV állapotot a publikus PRODUCTION felületre. A tényleges élesítés továbbra is külön jóváhagyott, kézi kontrollos folyamat marad.

Új admin felület:

```text
/admin/release-kozpont
```

Új API:

```text
GET /api/license/release-center
POST /api/license/release-center
```

A felület három fő állapotkártyát mutat:

- DEV / fejlesztői verzió;
- STAGING / release candidate;
- PRODUCTION / publikus éles verzió.

A PM2 állapotok és a static/standalone állapot is megjelenik, de a staging jelenleg logikai jóváhagyási szint, nem külön automatikus deploy folyamat.

## Szerverőr e-mail riasztás és tesztküldés – 2026-07-13

A Szerverőr modul bővült e-mail riasztási és tesztküldési kezelőfelülettel.

Új működés:

- SMTP állapot megjelenítése;
- címzettek megjelenítése;
- szükséges környezeti változók listázása;
- kézi teszt e-mail küldés gomb;
- teszt e-mail eredmény naplózása;
- warning/error szerverőr futás esetén automatikus e-mail riasztás, ha az SMTP és címzett beállítás teljes;
- azonos hiba ujjlenyomat esetén 6 órán belül nem küld ismétlődő riasztást.

Új / bővített API működés:

```text
POST /api/license/server-monitor
body: { "action": "testEmail" }
```

A teszt e-mail csak licencadmin jogosultsággal indítható.

Szükséges környezeti változók:

```text
DIMPRO_SMTP_HOST
DIMPRO_SMTP_PORT
DIMPRO_SMTP_USER
DIMPRO_SMTP_PASS
DIMPRO_SMTP_FROM
DIMPRO_SERVER_MONITOR_EMAIL_TO
```

A Szerverőr felület nem jelenít meg SMTP jelszót, csak konfigurációs állapotot és címzett darabszámot.

## DIMPRO automatikus e-mail profilok – 2026-07-13

Elkészült a központi DIMPRO e-mail profil réteg előkészítése. A rendszer külön profilként kezeli a technikai rendszerüzeneteket, az általános alkalmazásértesítéseket, a DIMPRO Drive értesítéseket, a no-reply leveleket, a számlázási üzeneteket, az admin értesítéseket és az info címet.

Automatikus küldésre előkészített profilok: system, notifications, drive, noreply, billing, admin. Az info profil alapértelmezés szerint kézi/kapcsolati címként kezelendő.

A profilok közös SMTP alapon működnek, de külön feladócímet és megjelenítési nevet használnak. A jelszavak nem jelenhetnek meg admin API válaszban vagy felületi állapotkártyán.

### Admin e-mail beállítások felület – 2026-07-13

Elkészült az admin felületen az `/admin/email` oldal. A felület kezeli a közös DotRoll SMTP beállítást, a közös SMTP jelszó egyszeri mentését, a teszt címzetteket és a DIMPRO automatikus feladóprofilokat. A jelszó mentés után nem kerül vissza a kliensoldali válaszba, csak a konfiguráltsági állapot látható.

Az admin felületről külön tesztelhető a system, notifications, drive, noreply, billing, admin és info profil, valamint egy gombbal az összes engedélyezett profil.

### Szerverőr riasztási szabályok és webes felületfigyelés – 2026-07-14

A Szerverőr modul bővült riasztási szabálylistával és több webes felület ellenőrzésével. A figyelt webes célok: DIMPRO.hu főoldal, DIMPROVER.hu főoldal, license.dimpro.hu admin felület, app.dimpro.hu webes alkalmazás, app.dimprover.hu webes alkalmazás és a helyi Next.js app válasz.

A védett webapp felületeknél a 2xx és 3xx válasz elfogadott, mert a bejelentkezési átirányítás önmagában működő állapotnak számít. A monitor nem követi automatikusan a redirectet, így a login oldal belső hibája nem keveredik össze az adott domain elérhetőségi ellenőrzésével.

Riasztási témák: tárhely 85/95%, backup hiba vagy túl nagy backup, SSL lejárat 14 napon belül, PM2 offline folyamat, Nginx konfigurációs hiba, magas swap, build/static asset hiba, DIMPRO.hu/DIMPROVER.hu/license/app domain válaszkimaradás. Azonos hiba esetén alapértelmezetten legfeljebb 1 e-mail küldhető 6 órán belül.

### SMTP hiba magyar magyarázó üzenetek – 2026-07-14

Az E-mail beállítások és a Szerverőr teszt e-mail felülete magyar magyarázó hibaüzenetet ad a gyakori SMTP hibákhoz. A DotRoll `550 Recipient rejected. You are not on the whitelist.` hiba esetén a felület jelzi, hogy valószínűleg a VPS IP-címet külön SMTP whitelist / relay engedélyezési listára kell felvenni. A technikai SMTP hiba továbbra is megmarad a részletes naplóban.

## DIMPRO Ingatlanfelmérő – v0.1 MVP (2026-07-27)

Új DIMPRO modul készült tabletes energetikai és műszaki helyszíni felméréshez. A modul route-ja `/ingatlanfelmero`, termékkódja `INGATLANFELMERO`.

Fő funkciók:
- nyolclépéses energetikai felmérési workflow;
- közös SVG-alaprajzi motor zoom, pan, méret-, rács- és hőhatárréteggel;
- helyiségek, szerkezetek, nyílászárók és gépészet rögzítése;
- térképi / iránytűs tájolás és északi szög;
- fotódokumentációs előkészítés;
- teljességellenőrzés;
- localStorage MVP mentés;
- strukturált JSON és nyomtatási export.

A valódi LiDAR és Bluetooth mérőkapcsolat következő fejlesztési kör: natív RoomPlan bridge és gyártói/BLE mérőadapter szükséges. Részletes dokumentáció: `29_dimpro_ingatlanfelmero_v01_mvp.md`.

## DIMPRO Ingatlanfelmérő – v0.2 Hibafelvevő és tájolás (2026-07-27)

Az Ingatlanfelmérő a felmérés közbeni egyszerű műszaki hibafelvétellel és WinWatt-előkészítésre használható tájolási rendszerrel bővült.

Új funkciók:

- külön Hibák munkalap;
- alaprajzi koppintással elhelyezhető, automatikusan számozott HJ hibapont;
- közös DIMPROVER HexPin/marker engine használata;
- helyiség-, szakág-, súlyosság- és státuszkapcsolat;
- hibánként egy optimalizált helyszíni vagy jelölt fotó;
- hibapont áthelyezés és törlés;
- 8 égtájas alaprajzi tájolási keret;
- a felső lapoldal 8 irányú gyorsbeállítása;
- felső, jobb, alsó és bal oldal égtáj + azimut kimutatása;
- lenyitható, 1°-os finomhangolás;
- `dimpro.property-survey.v0.2` JSON export hibajegyekkel.

A tájolási vezérlő külön sávban, az alaprajz alatt helyezkedik el, ezért nem akadályozza a rajzon történő hibapont-felvételt.

Részletes dokumentáció: `30_dimpro_ingatlanfelmero_v02_hibafelvetel_tajolas.md`.

## DIMPRO Ingatlanfelmérő – v0.2.1 Projektközpont és üres alaprajz (2026-07-27)

Az Ingatlanfelmérő projektalapú munkafolyamattal bővült. A felhasználó először projektet hoz létre, majd azon belül egy vagy több külön ingatlanfelmérést indít.

Új funkciók:

- ingatlanfelmérési projektközpont;
- projektenként több felmérés;
- üres alaprajz vagy mintafelmérés;
- kézi, téglalapos helyiségrajzolás;
- automatikus helyiségnév és kezdeti alapterület;
- felmérés mentése és későbbi folytatása;
- korábbi helyi adatok automatikus migrációja;
- 55 px magas kompakt tájolási eszközsáv;
- lenyitható részletes tájolási finomhangolás;
- `dimpro.property-survey.v0.2.1` projektazonosítós JSON export.

A projektadatok jelenleg localStorage-ban működő MVP-adatok. A struktúra külön projekt- és felmérésazonosítókkal készült, hogy később központi DIMPRO projektadatbázisra lehessen átvezetni.

Részletes dokumentáció: `31_dimpro_ingatlanfelmero_v021_project_center_compact_orientation.md`.

## DIMPRO Ingatlanfelmérő – v0.2.2 Helyiségméretek és Bluetooth mérés (2026-07-27)

A helyiségek most már pontos geometriai mérési adatokat kezelnek, nem csak közelítő rajzi téglalapot.

Új funkciók:

- hossz, keresztméret és belmagasság külön mezőben;
- automatikus hossz × keresztméret alapterület;
- méretváltozással együtt frissülő rajzi téglalap;
- helyiségenkénti méretvonalak;
- alaprajzi fogd és húzd helyiségmozgatás;
- kapcsolt hibapont együttmozgatása;
- Bluetooth mérés célmező kiválasztása;
- Bluetooth billentyűzet-emulációs adatbevitel;
- DIMPRO natív measurement bridge eseményfogadás;
- mérési forrás, időpont és eszköznév mezőnként;
- `dimpro.property-survey.v0.2.2` export.

Részletes dokumentáció: `32_dimpro_ingatlanfelmero_v022_room_dimensions_bluetooth.md`.

## DIMPRO Ingatlanfelmérő – v0.3.0 Többszintes falszakasz- és nyílászárómodell (2026-07-27)

Új fő képességek:

- A4/A3/A2 álló és fekvő lapformátum;
- automatikus vagy kézi fizikai lépték;
- pince, földszint és emeleti szintkezelés;
- szintenkénti helyiségek, falak és nyílászárók;
- oldalanként szakaszolható falmodell;
- falvastagság, faltípus és határolási mód falszakaszonként;
- részleges külső/belső falhossz automatikus felismerése;
- falszakasz felezés, összevonás és újraelemzés;
- falhoz kötött nyílászárók;
- automatikus nyílászáró-égtáj és azimut;
- v0.2.2 adatok automatikus migrációja;
- `dimpro.property-survey.v0.3.0` export.

Részletes dokumentáció: `33_dimpro_ingatlanfelmero_v030_multilevel_wall_opening.md`.

## DIMPRO Ingatlanfelmérő – v0.3.1 Dinamikus falmotor és mágneses illesztés (2026-07-27)

Új fő képességek:

- helyiségmozgatást és átméretezést követő automatikus belső/külső falszakasz-újraszámítás;
- aktív szint teljes külső falhosszának élő kimutatása;
- külső falszakaszonkénti méretfelirat;
- kézi faladatok és nyílászárók megőrzése újraszámításkor;
- mágneses helyiségillesztés pontos falra ugrással;
- zöld illesztési segédvonal, állapotjelzés és opcionális haptikus visszajelzés;
- falszakasz ±10 cm-es finomhangolása;
- 2 másodperces zöld mentés;
- 2 másodperces piros helyiségtörlés és falszakasz-összevonás;
- megszakítható hosszú nyomásos folyamatjelző.

Részletes dokumentáció: `34_dimpro_ingatlanfelmero_v031_dynamic_walls_magnetic_hold.md`.

## DIMPRO Ingatlanfelmérő v0.4.0 – energetikai adatmodell és alaprajzi eszközök

A modul új funkciói:

- metsző helyiségek javított falbesorolása;
- fűtött–fűtetlen közös falszakasz;
- burkolati anyagok és álmennyezet;
- hasznos belmagasság;
- szerkeszthető hőhatár;
- lábazat-, fal-, padló- és födémrétegrendek;
- falvastagság-arányos rajzi megjelenítés;
- külön ajtó- és ablakkezelés;
- falon húzható nyílászáró;
- helyiségben elhelyezhető gépészeti berendezések;
- számozott, helyiséghez kapcsolt alaprajzi fotópontok.

Részletes dokumentáció: `35_dimpro_ingatlanfelmero_v040_energy_model_photos_mechanical.md`.

## DIMPRO Ingatlanfelmérő v0.4.1 – marker- és címadat-javítás

- kisebb, alaprajzhoz arányos fotó- és hibamarkerek;
- külön irányítószám, település, utca és házszám mezők;
- offline magyar irányítószám–település automatikus kitöltés;
- több településes irányítószám-választó;
- régi egymezős címek automatikus migrációja;
- teljes cím automatikus összeállítása exporthoz és térképi kereséshez.

## DIMPRO Felmérő v0.5.0 – Épület- és csarnokfelmérés

A közös felmérőmotor munkamódjai közé bekerült:

- Épület- és csarnokfelmérés;
- Térbeton- és burkolatfelmérés.

Új képességek:

- kalibrált, méteralapú ipari rajztér;
- pillérháló és mozgatható pillérek;
- repedés szabadkézi vektoros felvétele és hosszösszesítése;
- raszterezett hibás térbeton-poligon és területösszesítés;
- egyéb szabadkézi vektoros jelölés;
- rétegezett DXF export AutoCAD és Archicad számára;
- ipari minta a Demjén tanya 11–12. épület felmérési munkafolyamata alapján;
- energetikai hőhatár gyors újraillesztése.

Részletes dokumentáció: `36_dimpro_felmero_v050_building_hall_freehand_dxf.md`.

## DIMPRO Felmérő v0.5.1 – poligonális ipari rajzszerkesztő

Új képességek:

- poligonális épületkontúr valós méterkoordinátákkal;
- épület- és hibajelölési csomópontok közvetlen mozgatása;
- ipari Undo/Redo, legfeljebb 40 állapottal;
- PDF- és képháttér kliensoldali optimalizálással;
- háttér opacity és szürkeárnyalatos mód;
- kétpontos léptékkalibrálás ismert távolsággal;
- zárt térbeton-poligon és valódi DXF ANSI31 HATCH;
- rajzeszköz-prioritás meglévő vektorrétegek fölött;
- v0.5.0 mentések automatikus migrációja.

Részletes dokumentáció: `37_dimpro_felmero_v051_polygon_history_background_hatch.md`.

## DIMPRO Felmérő v0.5.2 – háttértranszformáció, több PDF oldal és szerkesztési segédek

Új képességek:

- háttér húzása, X/Y eltolása, forgatása és méretezése;
- többoldalas PDF háttér, legfeljebb 6 helyi előnézettel;
- vektorcsomópont beszúrása és törlése;
- legfelső fogópont-interakciós réteg;
- tengelyrács- és derékszög-snap állítható tűréssel;
- legfeljebb 400 elemű automatikus pillérmező;
- részletes repedésadatlap és DXF metaadat;
- v0.5.1 mentések automatikus migrációja.

Részletes dokumentáció: `38_dimpro_felmero_v052_background_transform_multipage_snap_pillars.md`.

## DIMPRO Felmérő v0.5.3 – tablet rajzi fókuszmód

Új képességek:

- teljes képernyős rajzi munkatér;
- bal oldali Felmérési lépések perempanel;
- jobb oldali Aktív munkalap perempanel;
- egérperem- és koppintásos nyitás;
- panelrögzítés;
- minimális lebegő gyorssáv;
- lebegő szint-, lap- és léptékbeállítás;
- natív fullscreen + CSS fallback;
- Escape és külön kilépőgomb;
- tablet/iPad pointerkezelés;
- mobil vízszintes overflow-javítás.

Részletes dokumentáció: `39_dimpro_felmero_v053_tablet_focus_workspace.md`.

## DIMPRO Felmérő v0.6.0 – energetikai hőhatár és exportközpont

A DIMPRO Felmérő energetikai és általános alaprajzi munkamódjai a v0.6.0-ban teljes export- és terepi megjelenítési réteget kaptak.

Fő funkciók:

- falszakasz-alapú automatikus energetikai hőhatár;
- dinamikusan bővíthető virtuális alaprajzi munkatér;
- tételes helyiségátfedési hibajegyzék;
- `.dimpro` munkafájl mentése és visszanyitása;
- A4/A3/A2 PDF-export álló és fekvő elrendezésben;
- általános, rétegezett DXF-export AutoCAD/Archicad továbbrajzoláshoz;
- teljes képernyős alsó rajzeszköz-paletta;
- türkizzöld készültségi és műveleti állapotsáv;
- Világos / Sötét / SUN kültéri téma;
- tájolás alapértelmezett rejtése és lebegő teljes képernyős megnyitása.

Részletes dokumentáció: `40_dimpro_felmero_v060_thermal_export_sun_workspace.md`.

## DIMPRO Felmérő v0.6.1 – közös metszet és teljes épület-dokumentumcsomag

A Felmérő közös alaprajzi motorja minden munkamódban használható Metszet lépéssel bővült. Az alaprajzon húzással metszetvonal helyezhető el, majd rögzíthető a padlószint, belmagasság, fal felső síkja, eresz, gerinc, térdfal, tetőhajlás és ferde tetőablak. A funkció energetikai padlástérben és épület-/csarnokfelmérésben egyaránt használható.
A metszet törlése csak 2 másodperces folyamatos nyomva tartással hajtható végre; rövid kattintás nem töröl.
A metszetek betűjele automatikusan növekszik (`A-A`, `B-B`, `C-C`), és a rajzolás szabad, vízszintes vagy függőleges iránysegéddel végezhető. A tengelyzárt módok megakadályozzák a véletlen kis szögű ferdeséget.

A rajzlap állandó DIMPRO hexagon északjelet kapott. A külső hexagon rögzített, a belső aszimmetrikus hexagon hegyes csúcsa fordul az északi irányba. A belső középvonal felső végén mini nyílhegy követi ugyanezt a forgást, így az északi irány egyértelműbb. Az `É` betű diszkréten, kis méretben jelenik meg; külön külső piros nyíl nincs. Az északjel az SVG és a PDF rajzi kimenet része.

A geometriai helyiségátfedések hibánként összecsukott kártyán jelennek meg. A felhasználó csak az éppen javítandó hibát nyitja meg; a geometria rendezése után a hozzá tartozó kártya automatikusan eltűnik.

Az energetikai Fotók lépésben a fotódokumentáció az elsődleges típus, a hibafotó másodlagos. A felméréshez 12-nél több fotó is rögzíthető; a WinWatt ZIP-be kizárólag a külön bepipált képek kerülnek. A három WinWatt-kategória: fénykép az épületről, fénykép a hőtermelő rendszerről, fénykép a hőleadó rendszerről. A rendszer automatikusan JPG-re optimalizál 1600 px hosszabbik oldal és 280 KB célméret szerint, figyeli a 12 képes/4 MB-os tanúsítási keretet, 3,5 MB felett figyelmeztet, és WinWatt célú ZIP-et készít CSV fotójegyzékkel. Külön letölthető az összes feltöltött kép ZIP-csomagja is.

Az alaprajzi és metszeti rajzlap 5 mm-rel beljebb húzott, vékony türkízzöld keretet és A4 álló alapméretű, 200 × 34 mm-es, kétsoros rajzadat-fejlécet kapott. A v0.6.1.2-ben a fejléc projekt-, megrendelő-, felmérés-, rajzverzió-, szint-, helyszín-, dátum-, készítő- és léptékadatokat tartalmaz; a korábbi ismétlődő lapméret-felirat és a PDF szintoldal külön felső címsora megszűnt. A3/A2 lapon is azonos fizikai méretű marad. A fejléc fölött külön rajzlapi jelmagyarázat és szintenkénti fűtött/fűtetlen/összes alapterület-összesítő jelenik meg. A metszetben a padló- és födémvastagság külön rögzíthető, az alaprajzi belső falmetszések pedig automatikusan megjelennek.

Az Exportközpont v0.6.1 funkciói:

- több szint egyetlen többoldalas PDF-ben;
- projekt-, ingatlan- és felmérési fedlap;
- szintenkénti valódi vektoros alaprajz;
- külön metszeti oldalak;
- jelmagyarázat;
- mérnöki aláírási és pecsétblokk;
- bruttó külső/határoló falfelület;
- nyílászáró-levonás és nettó falfelület;
- padló-, fűtött padló- és födémfelület;
- rétegrendből számított U-érték;
- tájolásonkénti energetikai összesítő;
- WinWatt-kompatibilis JSON és CSV előkészítő adatcsomag;
- verziózott `.dimpro` munkafájl;
- hitelesített DIMPRO Drive projektmentés.

Új DXF-réteg:

```text
DIMPRO_SECTIONS
```

Részletes dokumentáció: `42_dimpro_felmero_v061_section_vector_energy_export.md`.

Rajzlap-fejléc és alapterület-összesítő kiegészítés: `43_dimpro_felmero_v0612_sheet_header_legend_area.md`.

### DIMPRO Felmérő v0.6.1.3 – tablet gesztusvezérlés

A közös alaprajzi motor érintésbarát pinch-zoomot és kétujjas pásztázást kapott. A helyiségek egy ujjal alap- és nagyított nézetben is stabilan húzhatók. A rajzfelület kizárja a natív oldalelgördülést, és a helyiségek x/y mozgatása közben nem illeszti újra automatikusan a teljes rajzot. A nagyítási tartomány 45–400%, a `Teljes rajz` gomb visszaállítja a középre rendezett 100%-os nézetet.

Részletes dokumentáció: `44_dimpro_felmero_v0613_tablet_gestures.md`.

### DIMPRO Felmérő v0.7.0 – Energetikai projektbeállítások

A Felmérő energetikai és felújítási munkamódja külön Energetika lépést kapott. A projektben verziózottan tárolható a számítás célja, a `HU_EKM_2023_11_01` szabálycsomag-váz, a követelményszint, a tanúsítás tárgya, az épületszimbólum, az engedély/bejelentés dátuma, az építés és jelentős felújítás éve, a teljesépület-adat rendelkezésre állása és a számítási módszer. A `.dimpro` séma `v0.7.0`, a v0.6.x projektek automatikusan migrálódnak. A munkatér még nem készít energetikai végeredményt vagy hiteles tanúsítványt.

Részletes dokumentáció: `45_dimpro_felmero_v070_energy_settings_architecture.md`.

### DIMPRO Anyag- és Terméktörzs MAT-0.1/MAT-0.2

Elkészült a generikus anyag, gyártói termék és felhasználói saját anyag közös domainmodellje, a forrás- és licencmodell, a verziózott tulajdonságkészlet, a kereső, a validáció és a megváltoztathatatlan energetikai anyagpillanatkép. A 25 rekordos JSON tesztkatalógus kizárólag privát fejlesztési staging-adat, központi publikálása tiltott.

Részletes dokumentáció: `46_dimpro_energy_material_database_mat02.md`.

### DIMPRO Felmérő v0.7.1 – Geometriai energetikai összesítő

Az Energetika munkatér Geometria és Nyomvonal lapot kapott. A közös helyiség-, fal-, nyílászáró-, szint- és metszetadatokból számolja a bruttó és nettó falakat, alsó és felső határoló felületeket, kondicionált térfogatot, lehűlő felületet és A/V arányt. A fűtött–fűtött szintátfedés nem kerül a lehűlő felületbe. A blokkoló geometriai hibák pontos elemnévvel jelennek meg. A `.dimpro` séma `v0.7.1`, és a teljes geometriai auditnyomvonal az export része.

Részletes dokumentáció: `47_dimpro_felmero_v071_energy_geometry.md`.

### DIMPRO Anyag- és Terméktörzs MAT-0.3

Elkészült a hárompaneles, kereshető és szűrhető anyagkatalógus, a kedvencek, legutóbb használt anyagok, projekt saját anyagok, saját másolatok és a rétegrendi MaterialPicker. A kiválasztott anyag pontos verziópillanatképe a rétegbe kerül. A λ-felülírás csak indoklással tekinthető teljesnek. A fejlesztési tesztanyagok továbbra is privát, draft, unverified és nem publikálható rekordok.

Részletes dokumentáció: `48_dimpro_material_catalog_mat03.md`.

### DIMPRO Felmérő v0.7.2 – Rétegrend- és U-érték motor

Az Energetika munkatér külön U-érték lapot kapott. A tiszta TypeScript motor homogén szilárd réteget, zárt légréteget, dokumentált fix R-értéket, számított vagy deklarált U-értéket, hőáramirány szerinti Rsi/Rse ellenállásokat, légüreg-, pontszerű rögzítő- és fordított tető korrekciót, 3%-os korrekcióküszöböt és szerkezeti követelményvizsgálatot kezel. Inhomogén, szellőztetett vagy talaj-egyenértékű esetben nem ad hallgatólagos közelítő megfelelőséget. A `.dimpro` séma `v0.7.2`, a PDF külön U-érték összesítő oldalt kapott, a WinWatt-előkészítő pedig ugyanazt a központi motort használja.

Részletes dokumentáció: `49_dimpro_felmero_v072_assembly_u_value.md`.

### DIMPRO Felmérő v0.7.3 – Energetikai zónák és fűtetlen terek

Az Energetika munkatér külön Zónák lapot kapott. A helyiségek egy vagy több fűtött zónához, a fűtetlen helyiségek kapcsolódó fűtetlen térhez rendelhetők. A motor zónánként számolja az alapterületet, térfogatot, külső, fűtetlen és zónaközi határokat, és teljes auditnyomvonalat készít. A `.dimpro` séma `v0.7.3`, a WinWatt-előkészítő zónablokkokkal bővült, a PDF külön zóna- és fűtetlen tér összesítő oldalakat kapott. A havi energiaigény és primerenergia még nem része ennek a kiadásnak.

Részletes dokumentáció: `50_dimpro_felmero_v073_energy_zones.md`.

### DIMPRO Felmérő v0.7.4 – Nyílászárók és hőhidak

Az Energetika munkatér külön Nyílászárók lapot kapott deklarált vagy részletes Uw-számítással, dokumentált beépítési peremmel, lineáris Ψ·l és pontszerű χ·n hőhídszámítással. A rendszer blokkolja a beépítési perem és a külön káva/parapet/szemöldök hőhíd kettős elszámolását. A `.dimpro` és WinWatt séma `v0.7.4`, a PDF külön nyílászáró- és hőhídösszesítő oldalakat kapott.

Részletes dokumentáció: `51_dimpro_felmero_v074_openings_thermal_bridges.md`.

### DIMPRO Felmérő v0.7.5 – Zónánkénti méretezési fűtési terhelés és rendszerkapcsolatok

Az Energetika munkatér külön Zónaterhelés lapot kapott. A motor zónánként összegez fal-, alsó/felső határ-, nyílászáró-, beépítési perem-, hőhíd- és szellőzési hőveszteségi tényezőket, majd dokumentált külső méretezési hőmérséklettel kW és W/m² eredményt számít. Az energetikai rendszerek zónákhoz és helyszíni gépészeti berendezésekhez kapcsolhatók; a rendszer ellenőrzi a hiányzó, ismeretlen, elégtelen vagy megfelelő kapacitást. Ez méretezési terhelés-előkészítés, nem havi vagy éves tanúsítási energiaigény.

Részletes dokumentáció: `52_dimpro_felmero_v075_zone_load_systems.md`.

### DIMPRO Felmérő v0.8.0 – Terepi energetikai workflow és WinWatt-előkészítés

A Felmérő két felületmódot kapott. A Terepi mód a helyszíni adatgyűjtésre, megújuló/villamos előméretezésre és felújítási javaslatokra koncentrál. A Szakértői mód a teljes Energetika munkateret és 14 WinWatt-logikájú adattáblát jelenít meg. Elkészült a többváltozatos felújítási munkatér, az automatikus javaslatmotor, a napelem-, napkollektor-, akkumulátor- és elektromosautó-töltő előméretezése, a 15 munkalapos Excel átadás, a `.dimpro v0.8.0`, a WinWatt-előkészítő JSON v0.8.0 és két új PDF-fejezet.

Részletes dokumentáció: `53_dimpro_felmero_v080_field_workflow_winwatt_transfer.md`.

### DIMPRO Felmérő v0.8.1 – Helyszíni gyorsfelvétel és egyszerűsített terepi felület

A Terepi mód új útmutatót, következő hiányos lépés gombot és csak-hiányos szűrést kapott. A Megújuló munkalap kötelező gyorsadatokra és összecsukható műszaki részletekre váltott. A napelem, napkollektor, akkumulátor és autótöltés külön kész/hiányos/opcionális állapotot mutat. A felújítási intézkedések rövid kártyákból, három szűrővel és külön részletes műszaki résszel kezelhetők. Az adatsémák és számítási motorok változatlanok.

Részletes dokumentáció: `54_dimpro_felmero_v081_field_ux.md`.

### DIMPRO Felmérő v0.8.2 – Meglévő és tervezett állapotok számított összehasonlítása

Elkészült az M0 és több T-változat virtuális összehasonlító motorja. A rétegrend- és nyílászáró-célértékekből számított H- és méretezési teljesítményváltozás készül. A gépészeti és megújuló intézkedések csak a ténylegesen alátámasztott kapacitást vagy előzetes hozamot mutatják. A terepi felület rövid eredménykártyákat, a szakértői mód részletes összehasonlító táblát kapott.

Részletes dokumentáció: `55_dimpro_felmero_v082_scenario_comparison.md`.

### DIMPRO Felmérő v0.8.3 – WinWatt mezőtérkép és próbaátadás

Elkészült a 15 szakértői adatcsoport 188 mezős WinWatt átadási szerződése, mezőszintű kötelezőség-, mértékegység-, adattípus-, célfelirat- és készültségvizsgálattal. A Szakértői Energetika munkatér külön WinWatt átadás lapot kapott. Az Excel 18 lapos, a ZIP-csomag mezőtérképet, átadási rekordokat és hibajegyzéket is tartalmaz. A rendszer nem állít natív WinWatt-importot és nem talál ki belső WinWatt mezőazonosítókat.

Részletes dokumentáció: `56_dimpro_felmero_v083_winwatt_field_map.md`.

### DIMPRO Felmérő v0.8.4 – WinWatt próbaátadás és visszamérési jegyzőkönyv

A Szakértői Energetika / WinWatt átadás lap külön Próbanapló nézetet kapott. A felhasználó munkamenetenként rögzítheti a WinWatt-verziót, operátort, munkaállomást, mezőnként a pontos célablakot, célfület, célfeliratot, mértékegységet, beviteli módot, sorrendet, időt és próbastátuszt. Elkészült a DIMPRO–WinWatt eredményeltérés tűrésalapú vizsgálata, a félkész munkamenet lezárási védelme, a 20 lapos Excel és a 10 fájlos visszacsatolási ZIP. A próbanapló nem állít automatikus vagy natív WinWatt-importot, és nem írja át automatikusan a központi mezőtérképet.

Részletes dokumentáció: `57_dimpro_felmero_v084_winwatt_trial_feedback.md`.

### DIMPRO Felmérő v0.8.4.1 – Responsive szakértői munkatér és munkaidőmérő

A teljes szakértői energetikai szerkesztő kikerült a keskeny jobb oldali panelből. A jobb board kizárólag navigációt, rövid mutatókat és státuszt tartalmaz. A központi munkafelület Rajz, Adatok és Osztott nézetet kapott, teljes szélességű geometria-, nyílászáró-, zónaterhelés-, szakértői tábla-, WinWatt- és állapotmunkalappal. Elkészült a desktop, laptop, tablet és mobil vizuális elfogadási teszt, valamint a felméréshez kapcsolt, kézzel indítható, szüneteltethető és lezárható munkaidőmérő munkalaponkénti időszakaszokkal és `.dimpro` mentéssel.

Részletes dokumentáció: `58_dimpro_felmero_v0841_responsive_workspace_timer.md`.

### DIMPRO Felmérő v0.8.4.2 – Vezetett WinWatt-próbaasszisztens

A WinWatt próbanapló vezetett mezőátadási kártyát kapott. A felhasználó a következő még nem próbált mezőt megnyithatja, a DIMPRO forrásértéket vágólapra másolhatja, automatikus mezőidőt mérhet, majd gyors státusszal lezárhatja. Az aktív mező és a mezőpróba időadatai projektben maradnak, a blokkolt mezők külön listából javíthatók. Az Excel és CSV próbanapló a mezőpróba indítási és befejezési időpontját is tartalmazza. A központi mezőtérkép valós WinWatt-próba nélkül nem változik.

Részletes dokumentáció: `59_dimpro_felmero_v0842_guided_winwatt_trial.md`.

## DIMPRO Drop – KépDrop és FájlDrop

A DIMPRO Drop időkorlátos, meghívásos fájl- és képcsomagátadó modul. Nem anonim publikus feltöltőoldal: csomagot kizárólag a belső DIMPRO kezelőfelület hozhat létre. A KépDrop és FájlDrop közös csomag-, token/PIN-, tárhely-, esemény-, értesítési, lejárati és riportmotorra épül.

A DROP 0.1.0 fejlesztési körben elkészült a `drop.dimpro.hu` nyilvános UI shell, a belső Drive/Drop modulhely, a központi feature flag és release gate, a biztonságos health API, a host-routing és az adatbázis-migrációs terv. A KépDrop, FájlDrop, ZIP, vegyes csomag, komment és PDF-riport funkciók látszanak, de inaktívak; valós fájlfeltöltés nem engedélyezett.

A DROP 0.2.0 fejlesztési körben elkészült az adatbázis-adaptertől független fájl nélküli csomagmotor, a címzett- és csoportkezelés, a scrypt PIN-védelem, a külön upload/view/download/report HMAC-tokenek, a publikus PIN-kapu, a rate limit és az auditnapló. A belső felület adatbázis nélkül is készít ellenőrző csomag-előnézetet, míg a valódi mentés a teljes sémaszerződésig zárolt. Elkészült a csomagállapot-kezelés, a link-újrakiadás és a token-visszavonás is.

A végső Supabase bootstrap 6 migrációt, 5 atomi PostgreSQL-függvényt és külön `DROP 0.2.0` sémaverzió-jelölőt tartalmaz. A teljes bootstrap tranzakciós, kizárólag service-role hozzáférésű, és nem tárol nyers PIN-t vagy tokent. Az SQL továbbra sincs alkalmazva; a 11 lépcsős offline acceptance hibamentes. A teljes fájlkezelési, Object Storage-, ZIP-, PDF-riport- és worker réteg továbbra is kikapcsolt.

Részletes dokumentáció: `71_dimpro_drop_architektura.md`, `72_dimpro_drop_adatmodell.md`, `73_dimpro_drop_biztonsag_adatkezeles.md`, `74_dimpro_drop_fejlesztesi_allapot.md`.

## 2026-08-01 – DIMPRO Projektkapu / D6 Core

A DIMPRO Projektkapu egyprojektes projektkörnyezetként működik, közös Project Core-ra és hat összekapcsolt modulra építve:

1. DOCK – ProjektTér;
2. DRIVE – Dokumentumtár;
3. DROP – Fájlkapu;
4. DIALOG – Egyeztetések;
5. DECIDE – Jóváhagyások;
6. DIARY – Projektnapló.

A DOCK dashboard már Project Core-ból tölti a projekt nevét, kódját, fázisát, készültségét, státuszát, határidejét, tagsági adatát, szerepkörét és auditbejegyzéseit. A dokumentum-, egyeztetési és jóváhagyási kártyák jelenleg bemutatóadatok. A publikus DIMPRO Drop külön fejlesztési körben marad; a Projektkapu csak a kapcsolódási helyét tartja fenn.

Részletes dokumentáció: `76_dimpro_projektkapu_d6_core.md`.

## 2026-08-02 – Projektkapu hibrid munkatér

A D6 Core felület összecsukható bal projektmenüt és modulfüggő, összecsukható jobb projektkontextus-panelt kapott. A középső munkatér mindkét panel állapotához automatikusan alkalmazkodik. Tablet alatt a jobb panel drawer, mobilon a bal navigációt az alsó D6 dokk helyettesíti. A Projektkapu ezzel vizuálisan illeszkedik a DIMPROVER termékcsaládhoz, de nem annak másolata.
