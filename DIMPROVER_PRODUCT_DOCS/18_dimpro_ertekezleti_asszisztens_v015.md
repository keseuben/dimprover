# DIMPRO Értekezleti Asszisztens v0.1.5

## Összefoglaló

A v0.1.5 a webes kétoldali értekezletvezető munkatér és a Teams oldalsó panel közös, projektkapcsolt dokumentációs kiadása. A webes kétoldali nézet teljes értékű értekezletvezető: bal oldalon a szervező dolgozik, jobb oldalon az élő résztvevői tükör látható.

## Kompakt munkatér

- kétsoros, alacsony Teams-fejléc;
- vízszintesen görgethető ikonos szakasznavigáció tooltippekkel;
- szinte teljes panelszélességet használó, összecsukható szekciók;
- kártya csak személyhez, feladathoz, melléklethez és Joker témablokkhoz;
- világos, sötét és kontrasztos Teams-téma;
- sárgás jegyzetfüzetes élő dokumentum.

## Kategória és dokumentumforma

Az értekezleti kategória és a készülő dokumentum két külön adat.

- kategória: `Általános egyeztetés`;
- kód: `ÁLT`;
- belső fájlbiztos kód: `ALT`;
- dokumentumforma: Egyeztetési emlékeztető, Jegyzőkönyv vagy Egyeztetési feljegyzés.

Példa: `DIM-024/ÁLT/2026/007 – Egyeztetési emlékeztető`.

A Gyors/Joker sablon ÁLT kategóriát használ, de nem dönti el automatikusan a dokumentumformát.

## Szerepkörök és számozás

Külön mező készült az értekezletvezetőnek, jegyzőkönyvvezetőnek és jóváhagyónak. A szerepkörök megjelennek a munkatérben, archívumban, PDF/DOCX exportban és auditban.

A projekten és típuskódon belüli sorszám zárolt számlálóból készül. A lefoglalt szám később nem változik.

## Projektadatlap és projekttagok

A szervező külön felugró ablakban kezelheti a projektkódot, nevet, helyszínt, megrendelőt, projektvezetőt és az állandó projekttagokat. A kijelölt tagok egy gombbal bekerülnek az aktuális meeting jelenléti pillanatképébe. Új jelenlévő az értekezletből is elmenthető a projekt állandó tagjai közé.

A lezárt dokumentum jelenléti adatai pillanatképként maradnak meg; a későbbi projektadat-módosítás nem írja át őket.

## Gyors/Joker értekezlet

Új sablon: `Gyors egyeztetés – szabad témakörök`. Egyetlen Joker napirendi ponttal indul. Minden más sablon végén is megjelenik az `Egyéb felmerülő témák / Joker pont`.

A témablokk mezői: cím, előzmény, egyeztetés tartalma, döntés, nyitott kérdés, megrendelői vélemény/jóváhagyás, tervezői és kivitelezői álláspont, felelős, határidő, mellékletkapcsolat, privát megjegyzés, korábbi meeting/pont kapcsolat és megosztási állapot. A blokkok átrendezhetők és külön napirendi pontokká alakíthatók.

## Élő és közzétett dokumentum

A jelenléti lista után automatikusan összeálló összefüggő dokumentum jelenik meg. A szervező élő piszkozatot lát, a résztvevő csak az utolsó jóváhagyott és közzétett verziót. A dokumentum a szerepkörökből, jelenléti listából, napirendből, Joker blokkokból, döntésekből, feladatokból és a következő időpontból áll össze.

## Korábbi dokumentumok

A fejléc archívumikonja nagy felugró ablakot nyit. Kereshető az aktuális projekt korábbi emlékeztetője, jegyzőkönyve és feljegyzése. Az előnézet összefüggő szöveget, szerepköröket és metaadatokat mutat; PDF és DOCX letölthető. Tokenes Teams-hozzáféréssel más projekt dokumentuma nem nyitható meg.

## AI megfogalmazás

Az AI nagy felugró szerkesztőablakban működik. Választható a napirend, döntések/feladatok, Teams-átirat, megosztott és privát jegyzet. Beállítható stílus, terjedelem, előzetes/végleges fázis, modell és becsült Ft-költség.

Az AI a kiválasztott dokumentumformát használja, ezért az emlékeztetőt vagy feljegyzést nem nevezi automatikusan jegyzőkönyvnek. Bevezető, tagolt törzs és lezárás készül. A tervezet külön menthető, szerkeszthető és emberi jóváhagyás után tehető közzé.

## Lezárás, következő egyeztetés és e-mail

A szervező piszkozatként, véleményezésre vagy közzétett állapotban zárhat. Több köszönőüzenet választható, köztük: `Köszönöm a közös munkát! A feladatokat és döntéseket az összefoglaló tartalmazza.` A cím és szöveg szerkeszthető.

A következő egyeztetés állapota, várható kezdése/befejezése, helyszíne és megjegyzése rögzíthető.

SMTP-beállítás esetén automatikus e-mail küldhető PDF- és DOCX-csatolmánnyal. SMTP nélkül a lezáró szöveg a szervező későbbi kézi kiküldését jelzi. A küldés címzettjei, tárgya, időpontja, csatolmányai, message ID-ja és hibája auditnaplóba kerül. Az e-mail napló nem látható a résztvevőknek.

## Résztvevői visszajelzés

A résztvevő tudomásul vételt, jegyzőkönyvi észrevételt, kiegészítési javaslatot vagy értekezletértékelést küldhet. Közvetlenül nem írhatja át a hivatalos dokumentumot. A szervező külön szekcióban látja és elfogadhatja vagy elutasíthatja a javaslatokat.

## Biztonság és teszt

- külön organizer/participant token;
- privát témablokk, elérhetőség, AI-piszkozat, e-mail napló és visszajelzéslista szűrése;
- HTML-válasz JSON-ként való feldolgozásának megakadályozása;
- érthető lejárt kapcsolat és szerverhiba üzenetek;
- 26 lépéses v0.1.5 integrációs teszt sikeres;
- PDF és szerkeszthető DOCX bájtkimenet ellenőrizve;
- valódi e-mail küldés nélkül SMTP-állapot és címzettjavaslat ellenőrizve.

## Teams-csomag

- verzió: `0.1.5`;
- manifest: `1.23`;
- App ID változatlan;
- Teams-átirat RSC jogosultságok megmaradtak;
- a csomag csak kézi Teams-kliens ellenőrzés után tölthető fel az Admin Centerbe.

## 2026-07-20 – projektkezdőoldal és panelnavigáció finomítás

- Az `/ertekezleti-kisero` meetingazonosító nélkül projekt- és értekezletválasztó kezdőoldalt nyit, nem a korábbi `dimpro-demo-meeting` munkateret.
- A kezdőoldal a DIMPRO Drive projektjeit és a Meeting Project Profile adatlapokat egy közös listában mutatja.
- Projektenként közvetlenül indítható ÁLT kategóriájú Gyors/Joker egyeztetés, és megnyithatók a korábbi dokumentumok.
- A munkatér ikonos navigációja a kiválasztott főszakaszt megnyitja, a többi főszakaszt összecsukja, majd az aktív tartalmat a görgethető panel tetejére igazítja.
- Az aktív ikongomb külön keretet és fókuszgyűrűt kap.
- Az élő emlékeztető háttere világosabb krémsárga lett.
- A dokumentumtartalom címsorokkal, félkövér és aláhúzott kulcsmezőkkel, dőlt magyarázó részekkel, felsorolásokkal és döntés/kérdés/vélemény színkódolt blokkokkal tagolódik.

## 2026-07-20 – összecsukott kezdőállapot és türkizzöld dokumentumlap

- Az Értekezleti Asszisztens minden fő fejezete alapértelmezetten összecsukott állapotban indul.
- Fejezet a felső ikongombbal vagy közvetlenül a fejezet fejlécére kattintva nyitható meg.
- Egyidejűleg egy fő fejezet marad nyitva; új választáskor a korábbi automatikusan összecsukódik.
- A fejezet fejlécére kattintva megnyitott tartalom is a görgethető panel tetejére igazodik.
- Az aktív felső ikongomb követi a fejezetfejlécből indított megnyitást is.
- Az élő értekezleti dokumentum háttere halvány türkizzöld (`#F3FAF7`), finom türkiz sorvonalakkal.
- A címsorok és kulcsmezők aláhúzása fekete/grafitszürke lett; a sárga csak nyitott kérdés és figyelmeztetés jelölésére marad.

## 2026-07-21 – webes kézi témaváltó és munkatérarány

- Az /ertekezleti-kisero webes projektválasztó és munkatér kézi világos/sötét mód kapcsolót kapott.
- A téma nem követi automatikusan a Microsoft Teams témáját.
- A választás a böngészőben megmarad.
- A szervezői oldal kb. kétszer szélesebb a résztvevői nézetnél; a résztvevői oldal minimum 380 px.

## 2026-07-21 – húzható kétoldali munkatér és értekezleti folyamatjelző

### Húzható munkatér

- A webes kétoldali értekezletvezető középső elválasztója egérrel jobbra-balra húzható.
- Alapértelmezett arány: 66% szervezői / 34% résztvevői felület.
- Minimum szélesség: szervezői oldal 560 px, résztvevői oldal 360 px.
- Dupla kattintás vagy visszaállítás gomb: 66/34 alaparány.
- A résztvevői nézet külön gombbal összecsukható és újranyitható.
- A szélesség és az összecsukott állapot a böngészőben megmarad.
- Billentyűzet: bal/jobb nyíl 2%-os módosítás, Home alaparány.
- Tablet- és mobilméretben a nézetek egymás alatt maradnak.

### Értekezleti folyamatjelző

A fejléc alatt állandóan látható készültségi sáv és hét kattintható lépés készült:

1. Előkészítés és alapadatok – 10%
2. Jelenlévők és meghívottak – 15%
3. Napirend és egyeztetési tartalom – 25%
4. Döntések, feladatok és kérdések – 20%
5. Képek és mellékletek – 5%
6. Összefoglaló és emlékeztető – 15%
7. Lezárás és véglegesítés – 10%

A szervező részletes hiányosságlistát lát. A résztvevő csak az egyszerű állapotot és a közzététel/véglegesítés szintjét látja. A lépésekre kattintva a kapcsolódó fejezet nyílik meg. A sablonok üres mintaszövegei nem számítanak elkészült tartalomnak.

A kétoldali webes nézet panelnavigációja szerepkör szerint elkülönül: a szervezői kattintás nem nyitja ki a résztvevői panel fejezetét és fordítva.

## 2026-07-21 – webes stabilitási javítás

- Teljes oldalas sötét téma.
- Jogosult projektlista-betöltés.
- Húzható osztott nézet.
- Készültségi sáv kijelző módban.


## 2026-07-21 – végleges licenc- és hozzáférési irány

### Közös DIMPRO/DIMPROVER licenc

Az Értekezleti Asszisztens nem különálló licenctermék lesz. A végleges rendszer egy központi DIMPRO/DIMPROVER vállalati licencet használ, amelyen belül moduljogosultságok szerepelnek.

Javasolt központi jogosultsági adatok:

- `companyId`
- `plan`
- `enabledModules`
- `enabledAiFeatures`
- `maxUsers`
- `maxDevices`
- `maxActiveMeetings`
- `status`
- `accessExpiresAt`

Az Értekezleti Asszisztens modulazonosítója: `meeting_assistant`.

Ugyanezt a központi licencet használja majd a webes DIMPRO/DIMPROVER, a Teams-panel, a DIMPRO Drive Desktop, a DIMPRO Fájlműhely és a későbbi mobilkliensek. A modulok külön engedélyezhetők, de nem szükséges minden modulhoz külön licenckód.

### Meghívott résztvevők licencelése

- A szervező vállalkozásának aktív licence fedezi az értekezlet használatát.
- A meghívott résztvevőnek nem kell külön DIMPRO-előfizetés.
- A meghívott csak az adott értekezlet megosztott tartalmához fér hozzá.
- Ideiglenes jegyzőkönyv-szerkesztői jog is adható neki külön teljes licenc nélkül.
- A meghívott nem fér hozzá a szervező vállalkozás más projektjeihez vagy moduljaihoz.

### Szerveroldali védelem

A Teams ZIP csak manifestet és ikonokat tartalmaz. A fontos jogosultsági és üzleti logika kizárólag a DIMPRO szerveren marad:

- vállalati és moduljogosultság ellenőrzése;
- felhasználó- és tenantazonosítás;
- értekezleti tokenek;
- szerkesztési jog átadása és visszavonása;
- mentés, audit, export és közzététel;
- AI-kulcsok és AI-kérések;
- licenc- és használati korlátok.

### Végleges szerepkörök

1. `organizer` – értekezlet tulajdonosa és végleges jóváhagyója.
2. `editor` – ideiglenes jegyzőkönyv-szerkesztő.
3. `participant` – meghívott, megosztott tartalmat látó résztvevő.

Az `editor` szerkesztheti a napirendet, egyeztetési tartalmat, döntéseket, feladatokat, felelősöket, határidőket, megosztott jegyzeteket és dokumentumtervezetet. Alapértelmezetten nem módosíthatja a projektkapcsolatot, sorszámot, jogosultságokat, licencet, végleges közzétételt, archiválást és e-mail-kiküldést.

### Szerkesztési jog átadása

A szervező ceruzaikonról egyszer használatos párosítókódot hozhat létre.

MVP szabályok:

- 6 számjegyű, 3-as tagolású kód;
- 10 perces érvényesség;
- egy értekezlethez kötött;
- egyszer használható;
- új kód létrehozásakor a korábbi visszavonható;
- hibás próbálkozási korlát;
- a szervező bármikor visszaveheti vagy visszavonhatja a jogot;
- minden esemény auditnaplóba kerül.

A későbbi üzleti verzióban a kód címzett e-mailhez, Microsoft Entra felhasználóhoz és tenantazonosítóhoz is köthető.

## Következő fejlesztési sorrend

### Most szükséges – Teams pilot előtt

1. `editor` szerepkör és korlátozott szerkesztési jogosultság.
2. Egyszer használatos szerkesztői párosítókód létrehozása és beváltása.
3. „Jegyzőkönyv-szerkesztés átadása” ceruzaikon a szervezőnél.
4. „Szerkesztői mód aktiválása” funkció a résztvevőnél.
5. Aktív szerkesztő kijelzése mindkét panelen.
6. Szerkesztés visszavétele, jogosultság visszavonása és lejárat.
7. Auditnapló az átadásról, aktiválásról, visszavételről és szerkesztési eseményekről.
8. Egyszerű pilot modulkapu: `meeting_assistant` engedélyezett/tiltott állapot, teljes előfizetési motor nélkül.

### Valós Teams-próba után

1. Egyidejű szerkesztési ütközések kezelése és aktív szerkesztői zárolás.
2. Teams-felhasználó és Microsoft-tenant azonosítása.
3. Szerkesztési jog e-mailhez vagy Entra-felhasználóhoz kötése.
4. Tenant-engedélyezési lista.
5. Használati és biztonsági naplók adminfelülete.

### Kereskedelmi kiadás előtt

1. Központi DIMPRO licenc- és moduljogosultsági API.
2. Vállalati licenc, felhasználói és eszközkorlátok.
3. `enabledModules` és `enabledAiFeatures` ellenőrzés minden kliensben.
4. Előfizetés, lejárat, próbaidő és csomagváltás.
5. Tenant- és vállalatkapcsolat.
6. AI-használati keretek és költségkorlátok.
7. Telepítési, felhasználási és adatvédelmi dokumentáció.

## 2026-07-21 – jegyzőkönyv-szerkesztési jog átadása MVP

Elkészült a korlátozott `editor` szerepkör és a szerkesztési jog biztonságos átadása.

### Felhasználói működés

- A szervezői fejlécben ceruzaikon nyitja a „Jegyzőkönyv-szerkesztés átadása” ablakot.
- A szervező opcionálisan megadhatja az átvevő nevét és céges e-mail-címét.
- A rendszer 6 számjegyű, `123-456` formátumú, egyszer használatos kódot készít.
- A kód alapértelmezetten 10 percig érvényes.
- Legfeljebb 5 hibás próbálkozás engedélyezett; ezután a kód zárolódik.
- A résztvevő a ceruzaikonról névvel, opcionális e-maillel és a kóddal aktiválja a szerkesztői módot.
- Az aktív szerkesztő neve mindkét panelen megjelenik.
- A szervező bármikor visszavonhatja a jogot; a kiadott editor-token azonnal érvénytelenné válik.
- Az editor önként is elhagyhatja a szerkesztői módot.
- Az editor-token alapértelmezett érvényessége 12 óra, de a workspace aktív grantja nélkül nem használható.

### Editor által engedélyezett műveletek

- megosztott jegyzet szerkesztése;
- megosztott napirendi pont hozzáadása, szerkesztése és törlése;
- megosztott napirendi tartalom, döntés és nyitott kérdés szerkesztése;
- megosztott Joker-témablokk hozzáadása, szerkesztése és törlése;
- feladat, döntés, kérdés és határidő rögzítése;
- megosztott melléklet címének és kapcsolódásának szerkesztése;
- melléklet feltöltése az értekezleti bejövőbe;
- élő, de privát adatoktól megtisztított szerkesztői munkapéldány megtekintése.

### Csak szervezőnek fenntartott műveletek

- projekt- és értekezleti alapadatok módosítása;
- jelenléti ív és projekttagok kezelése;
- privát jegyzetek és privát témablokkok;
- napirendi és témablokk-sorrend módosítása;
- átiratkezelés;
- láthatósági és melléklet-jóváhagyási státuszok;
- AI-tervezet és AI-funkciók;
- összefoglaló közzététele;
- lezárás, újranyitás, archiválás;
- e-mail-kiküldés és jogosultságkezelés.

### Biztonsági megvalósítás

- A kód csak hash formában kerül tárolásra.
- A kód az adott meetingazonosítóhoz kötött.
- Az editor-token `grantId` azonosítót tartalmaz.
- Minden editor API-kérés összeveti a token grantját a workspace aktuális aktív grantjával és lejáratával.
- Visszavonáskor a workspace grant törlődik, ezért a korábbi token azonnal használhatatlanná válik.
- Az explicit, érvényes meeting-token elsőbbséget kap a böngészőben meglévő általános DIMPRO sessionnel szemben.
- Az editor nézetből ki van szűrve a privát jegyzet, privát napirend, privát témablokk, résztvevői elérhetőség, AI-adat, e-mail napló, auditnapló, grant-azonosító és editor e-mail.
- Az editor csak megosztott elem azonosítójával végezhet tartalmi műveletet; közvetlen API-kérés sem írhat privát adatot.

### Auditnapló

Naplózott események:

- szerkesztői párosítókód létrehozása;
- editor mód aktiválása;
- editor tartalmi módosítása művelettípussal;
- szerkesztési jog szervezői visszavonása;
- editor önkéntes kilépése.

### Pilot modulkapu

Elkészült a `meeting_assistant` modul egyszerű szerveroldali entitlement rétege.

- `MEETING_ASSISTANT_ENABLED=false` esetén a workspace, editor-hozzáférés és feltöltés letiltható.
- `MEETING_ASSISTANT_PILOT_MODE` jelzi a pilot működést.
- A felület később ugyanennek az interfésznek a megtartásával köthető a központi DIMPRO/DIMPROVER licenc-API-hoz.

### Teszt

Új automatizált folyamatpróba: `scripts/test-meeting-editor-flow.cjs`.

A teszt ellenőrzi a kódgenerálást, aktiválást, editor szerepkört, privát adatok szűrését, megosztott tartalom szerkesztését, szervezői műveletek tiltását, azonnali visszavonást és az auditnaplót.

## 2026-07-22 – editor pilot biztonsági kiegészítések

- A webes kétpaneles előnézet külön szervezői és külön résztvevői hozzáférési tokent használ.
- A résztvevői panel `dimpro-web-participant-preview` tokent kap, ezért szerveroldalon is kizárólag megtisztított résztvevői workspace érkezik hozzá.
- A résztvevői panel editor módjának elhagyásakor erre a korlátozott tokenre áll vissza, nem a szervezői preview-tokenre.
- Ha a szervező a párosítókód létrehozásakor e-mail-címet ad meg, a kód beváltásakor az e-mail megadása kötelező, és pontosan egyeznie kell.
- Az e-mail-egyezés jelenleg címhez kötött pilot korlátozás; nem helyettesíti a későbbi e-mail OTP-t vagy Microsoft Entra SSO-hitelesítést.
- Az editor automatizált folyamatpróba 17 lépésre bővült, és külön ellenőrzi az e-mail nélkül történő aktiválás tiltását.

A webes tokenelválasztás külön automatizált próbája: `scripts/test-meeting-preview-token.cjs`. A teszt ellenőrzi a külön tokeneket, a résztvevői szerepkört, a privát adatok kizárását és a szervezői szerepkör jogosulatlan igénylésének tiltását.

## 2026-07-22 - Teams csomag v0.1.6 feltöltési javítás

A v0.1.5 csomag Teams-feltöltésekor két manifestprobléma derült ki:

- a `description.short` 82 karakter volt, miközben a Teams maximum 80 karaktert enged;
- a manifest RSC Graph-jogosultságokat tartalmazott `webApplicationInfo` / Microsoft Entra alkalmazásregisztráció nélkül.

Elkészült a `DIMPRO_Ertekezleti_Kisero_Teams_App_v0_1_6.zip` pilot csomag:

- rövid leírás 70 karakter alatt;
- a pilotban még nem működő RSC/Graph jogosultságok eltávolítva;
- a meeting oldalsó panel, konfiguráció és DIMPRO szerveroldali funkciók változatlanul használhatók;
- az automatikus Teams-átirat jogosultság később, külön Microsoft Entra alkalmazásregisztráció és `webApplicationInfo` után kerül vissza.

## 2026-07-22 – későbbi Teams-ügynök és átírás-integráció

### DIMPRO Teams-ügynök – egyszerű, olvasási MVP

Későbbi fejlesztési döntésként rögzítve egy külön, beszélgethető Teams-ügynök első, csak olvasási változata.

Első MVP funkciók:

- projekt és értekezlet kiválasztása;
- korábbi emlékeztetők és jegyzőkönyvek összefoglalása;
- nyitott feladatok, döntések és határidők lekérdezése;
- napirendjavaslat készítése;
- értekezleti kérdéslista készítése;
- közvetlen DIMPRO-hivatkozás visszaadása;
- nincs automatikus adatírás vagy jóváhagyás nélküli projektmódosítás.

### Teams-átirat integráció

A Microsoft Teams saját élő átirata az értekezlet alatt a résztvevőknek valós időben látható, de a Microsoft Graph transcript API jelenlegi működése szerint a teljes vagy részleges átirat programozott lekérése az aktív értekezlet közben nem támogatott. A Graph API az átiratot jellemzően az értekezlet befejezése után teszi elérhetővé.

Tervezett működés:

1. Az alkalmazás az értekezlethez és a telepített Teams apphoz előre létrehoz Graph change-notification feliratkozást.
2. A Teamsben a szervező elindítja az átírást.
3. A DIMPRO panel élő állapotot mutat: „Teams-átírás folyamatban”. Ez státuszjelzés, nem élő Graph-szövegfolyam.
4. Az értekezlet befejezése után a Microsoft Graph értesítést küld, amikor az átirat elkészült.
5. A DIMPRO szerver letölti a VTT vagy támogatott szöveges átiratot.
6. A rendszer feldolgozza a beszélőket, időbélyegeket és szövegrészeket, majd a meeting workspace `transcript` részébe menti.
7. Az asszisztens panelen megjelenik az importált átirat, kereséssel, napirendi ponthoz kapcsolással és kézi javítással.
8. Külön gomb indítja az AI-feldolgozást: összefoglaló, döntések, feladatok, nyitott kérdések és résztvevői álláspontok javaslata.
9. Az AI eredménye csak tervezet; a szervező vagy editor ellenőrzés után emelheti át a hivatalos jegyzőkönyvbe.

Szükséges Microsoft-oldali előfeltételek:

- Microsoft Entra alkalmazásregisztráció;
- Teams app manifest `webApplicationInfo` beállítás;
- meetinghez kötött RSC `OnlineMeetingTranscript.Read.Chat` vagy szükség esetén szervezeti `OnlineMeetingTranscript.Read.All` jogosultság;
- Teams Admin Centerben a Transcript API access engedélyezése;
- opcionálisan a speaker attribution engedélyezése;
- nyilvános HTTPS webhook a Graph change notification fogadására;
- subscription megújítás és lifecycle notification kezelés;
- audit, adatmegőrzési és törlési szabályok.

A v0.1.6 pilot csomagból a transcript RSC jogosultság szándékosan ki lett véve a feltöltési hiba elkerülésére. Az átírás-integrációhoz később új Teams app verzió készül Entra-regisztrációval és `webApplicationInfo` blokkal.

## 2026-07-22 – értekezleti képmetsző, kép-/PDF-jelölő és AI-képkapcsolat

### Cél

Az Értekezleti Kísérőben lehessen képet, képernyőrészletet vagy PDF-tervlapot befogadni, megnyitni, kimetszeni, jelölni és az értekezlethez menteni. A funkció a közös DIMPRO KépBOX / Képmetsző / DocumentViewer motorra épüljön, ne külön Teams-specifikus képszerkesztő kódbázis készüljön.

### Támogatott bemeneti módok

1. **Képernyőrészlet készítése a Teams-panelből**
   - külön „Képmetsző” gomb;
   - felhasználói engedélykéréssel képernyő, alkalmazásablak vagy kijelző kiválasztása;
   - egy képkocka rögzítése, majd kijelölhető téglalap alapú metszés;
   - a metszet megnyitása Teams dialog/task module ablakban;
   - csendes, háttérben történő automatikus képernyőmentés nem cél és nem tekinthető megbízhatóan támogatott működésnek.

2. **Kép behúzása vagy feltöltése**
   - JPG/JPEG/PNG/WEBP/HEIC/TIFF/BMP támogatási irány;
   - drag & drop vagy fájlválasztó;
   - eredeti fájl külön megőrzése;
   - szerkesztett változat külön derivált fájlként mentése.

3. **PDF behúzása vagy feltöltése**
   - PDF megnyitása a közös DocumentViewerben;
   - lapválasztás;
   - a teljes oldal vagy kijelölt terület képként történő kimetszése;
   - a kimetszett rész átadása a Képjelölőnek;
   - az eredeti PDF változatlan forrásként megmarad.

4. **Értekezleti chatből vagy megosztott dokumentumcsomagból átvett kép/PDF**
   - későbbi Graph-/Drive-integrációval automatikus vagy jóváhagyásos behúzás;
   - a forrás és feltöltő személy naplózása.

### Képszerkesztő / rajzi funkciók

MVP:

- téglalap alapú metszés;
- szabadkézi rajz;
- nyíl;
- téglalap, kör/ellipszis;
- szövegdoboz;
- kiemelő;
- sorszámozott jelölőpont;
- szín és vonalvastagság választás;
- visszavonás/újra;
- teljes rajzi réteg törlése;
- nagyítás, kicsinyítés, pan;
- mentés PNG/JPG képként;
- eredeti fájl és szerkesztett kép összekapcsolása.

Későbbi bővítés:

- méretvonal és méretarányos mérés;
- homályosítás/kitakarás;
- „HIBA”, „JAVÍTANDÓ”, „ELLENŐRIZVE” pecsétek;
- több rajzi réteg;
- PDF oldal közvetlen overlay-jelölése;
- HexPin / hibajegy kapcsolat;
- verzió-összehasonlítás;
- közös szerkesztés vagy Live Share.

### Mentési adatmodell

Minden mentett értekezleti képhez vagy metszethez kötelező metaadatok:

- `meetingId`;
- `projectId`;
- `agendaItemId` opcionálisan;
- `title` – rövid cím;
- `description` – rövid leírás;
- `sourceType`: `screen_capture`, `image_upload`, `pdf_crop`, `meeting_chat`, `document_package`;
- `originalFileId`;
- `derivedFileId`;
- `originalFileName`;
- `pageNumber` PDF esetén;
- `cropRect` normalizált koordinátákkal;
- `annotationData` szerkeszthető JSON formában;
- `uploadedByUserId`;
- `uploadedByName`;
- `uploadedByEmail` jogosultság szerint;
- `createdAt`, `updatedAt`;
- `includeInAiSummary` kapcsoló;
- `aiCaptionStatus` és későbbi AI-feldolgozási metaadatok;
- audit események: feltöltés, megnyitás, szerkesztés, mentés, törlés, jegyzőkönyvbe emelés.

### Teams felületi működés

- A keskeny meeting side panel csak a fájlfogadást, listát, státuszt és a szerkesztő indítását tartalmazza.
- A tényleges szerkesztő nagy méretű Teams dialog/task module ablakban nyíljon meg.
- Szükség esetén külön DIMPRO webes teljes képernyős szerkesztő is nyitható mélylinkkel.
- Mentés után a dialog visszaadja a létrehozott attachment/image azonosítóját, a panel pedig azonnal frissíti az értekezleti mellékletlistát.
- A résztvevő által feltöltött tartalom alapértelmezetten `pending`; szervező vagy editor jóváhagyása után kerülhet a hivatalos jegyzőkönyvi csomagba.

### Képernyőmegosztási korlát

A DIMPRO Teams alkalmazás nem kap közvetlen programozott hozzáférést egy másik résztvevő által megosztott képernyő képpontjaihoz. A képmetsző ezért felhasználói művelettel indított képernyő-/ablakválasztásból, kézi feltöltésből, vagy később a DIMPRO Drive Desktop / KépBOX Desktop kísérőalkalmazásból dolgozik. Az egygombos, engedélykérés nélküli háttérképernyő-mentés nem tervezett funkció.

### AI-összefoglalóba kapcsolás

Az AI-feldolgozás továbbra is a DIMPRO webes értekezleti munkatérben fusson, nem az élő Teams-panelben.

AI-bemenetek:

- automatikusan letöltött Teams-átirat;
- jóváhagyott napirend, döntések és feladatok;
- csak azok a képek/PDF-metszetek, amelyeknél az `includeInAiSummary` kapcsoló aktív;
- felhasználó által adott cím és leírás;
- opcionálisan későbbi OCR vagy képi értelmezés.

Az AI kimenete témakörönként hivatkozhat a képekre, például: „A 3. számú jelölt tervrészleten a gépészeti áttörés helye módosítandó.” Az eredmény tervezet marad, és csak szervezői/editor ellenőrzés után kerülhet a hivatalos jegyzőkönyvbe.

### Fejlesztési sorrend

1. Kép- és PDF-feltöltés az értekezleti mellékletekhez, kötelező cím/leírás/feltöltő metaadatokkal.
2. Közös kép/PDF előnéző és teljes képernyős Teams dialog.
3. Képmetszés és alap rajzi eszközök.
4. Szerkeszthető annotation JSON + derivált képfájl mentése.
5. Napirendi ponthoz és jegyzőkönyvhöz kapcsolás.
6. Képernyő-/ablakrögzítés felhasználói engedélykéréssel.
7. Automatikus Teams-átirat letöltés.
8. DIMPRO webes AI-összefoglaló, jóváhagyott képi mellékletekkel.
9. Később Drive Desktop / KépBOX Desktop gyorsbillentyűs, stabil képmetsző kapcsolat.
