# DIMPRO Értekezleti Kísérő – Microsoft Teams MVP

## 1. Dokumentum célja

Ez a dokumentum a DIMPRO Értekezleti Kísérő Microsoft Teams-integrációjának aktuális MVP-architektúráját, működési szabályait, biztonsági modelljét, felületeit és továbbfejlesztési irányait rögzíti.

A modul célja, hogy egy Teams-értekezlet alatt közös jobb oldali munkapanelt biztosítson napirendhez, jegyzetekhez, átirathoz, képekhez, mellékletekhez, döntésekhez, feladatokhoz, jegyzőkönyvtervezethez és kézi indítású, költségkontrollált AI-funkciókhoz.

## 2. Termék- és felületelnevezés

- Terméknév: **DIMPRO Értekezleti Kísérő**
- Teams alkalmazásnév: **DIMPRO Kísérő**
- Webes kezelőoldal: `https://app.dimpro.hu/ertekezleti-kisero`
- Teams konfigurációs oldal: `https://app.dimpro.hu/teams/meeting-assistant/configure`
- Teams jobb oldali panel: `https://app.dimpro.hu/teams/meeting-assistant`
- Teams stage nézet: `https://app.dimpro.hu/teams/meeting-assistant/stage`
- Központi értekezleti archívum: `https://app.dimpro.hu/ertekezletek`

A modul a DIMPRO termékhez tartozik. A régi DIMPROVER útvonal átirányítással kezelhető, de az elsődleges felület az `app.dimpro.hu` domainen működik.

## 3. Fő működési elv

Az értekezleti adat nem kizárólag az értekezlet végén mentődik. A munkatér módosításai folyamatosan a DIMPRO szerverre kerülnek, meetingazonosító szerint elkülönítve.

Fő adatcsoportok:

- meeting alapadatai;
- projektkapcsolat;
- szervező és résztvevők;
- napirendi pontok és aktuális napirend;
- privát szervezői jegyzet;
- megosztott jegyzet;
- átirat;
- döntések, feladatok, kérdések és határidők;
- feltöltött képek és dokumentumok;
- jóváhagyási és megosztási státuszok;
- AI-költségbecslések és futtatási napló;
- lezárási állapot és snapshot-verziók.

## 4. Szerepkörök és nézetek

### 4.1 Szervezői / privát nézet

A szervező láthatja és kezelheti:

- a teljes átiratot;
- a privát jegyzetet;
- a megosztott jegyzetet;
- valamennyi feltöltött mellékletet;
- a jóváhagyásra váró fájlokat;
- a feladatok és döntések megosztási állapotát;
- a kézi AI-funkciókat;
- az értekezlet lezárását, újranyitását és archiválását;
- a privát adatokat is tartalmazó exportokat.

### 4.2 Résztvevői nézet

A résztvevő csak a megosztott tartalmat láthatja:

- aktuális közös napirendi pont;
- megosztott jegyzet;
- közzétett mellékletek;
- megosztott feladatok, döntések és kérdések;
- résztvevői jogosultság szerint elérhető export.

A szervezői és résztvevői felület ugyanazt a szerveres meetingadatot használja, de a szerver és a kliens is szerepkör alapján szűri a megjeleníthető tartalmat.

## 5. Teams alkalmazáscsomag

Aktuális Teams csomagverzió: **v0.1.3**

Fő manifest-jellemzők:

- Microsoft Teams manifest schema: 1.17;
- alkalmazásazonosító: `f728b348-f106-456e-921a-e3bc5fec5a62`;
- konfigurálható lap;
- támogatott kontextusok:
  - `meetingChatTab`;
  - `meetingDetailsTab`;
  - `meetingSidePanel`;
- engedélyezett domain: `app.dimpro.hu`;
- nyilvános adatvédelmi és felhasználási feltételek oldal;
- 192×192 színes ikon;
- 32×32 körvonalas ikon.

A csomag Microsoft Teams schema és Microsoft Agents Toolkit ellenőrzésen megfelelt.

A webes panel vagy konfigurációs oldal CSS/React módosítása önmagában nem igényel új Teams ZIP-feltöltést. Új csomagverzió csak manifest-, ikon-, domain-, jogosultság- vagy Teams-kontextus-változáskor szükséges.

## 6. Teams konfiguráció és párosítás

### 6.1 A korábbi probléma

A Teams beágyazott konfigurációs iframe nem kapja meg megbízhatóan a külső böngésző DIMPRO-sessionjét. Emiatt a rendszer közvetlen session-ellenőrzéssel nem tudta biztonságosan igazolni a szervező jogosultságát.

### 6.2 Egyszer használatos párosítókód

A megoldás egy egyszer használatos, rövid életű párosítókód.

Folyamat:

1. A bejelentkezett DIMPRO-szervező megnyitja a webes Értekezleti Kísérő oldalt.
2. Létrehoz egy 8 karakteres Teams-párosítókódot.
3. A kód alapértelmezetten 10 percig érvényes.
4. A szervező beilleszti a kódot a Teams konfigurációs ablakába.
5. A Teams konfigurációs oldal átveszi a tényleges Teams meetingazonosítót a TeamsJS kontextusból.
6. A szerver ellenőrzi és felhasználtnak jelöli a kódot.
7. A kód a tényleges Teams-meetinghez kapcsolódik.
8. A rendszer meetinghez kötött hozzáférési tokent készít.
9. A Teams Mentés gomb aktívvá válik.
10. A Teams a jobb oldali panel `contentUrl` címét elmenti.

Biztonsági szabályok:

- a kód csak egyszer használható;
- a kód rövid idő után lejár;
- a szerver nem nyílt szövegként, hanem SHA-256 hash alapján kezeli;
- a kód csak bejelentkezett DIMPRO-szervezői felületről hozható létre;
- a felhasználás során a tényleges Teams meetingazonosítóhoz kötődik;
- hibás, lejárt vagy már felhasznált kód nem ad hozzáférést.

Párosítási rekordok tartós helye:

`/root/dimprover/.dimprover/data/meeting-assistant/pairings`

## 7. Hozzáférési tokenek

A meetingpanelek HMAC-aláírt, lejáró, meetinghez kötött hozzáférési tokent használnak.

Fő tokenirányok:

- webes előnézeti issuer token;
- Teams meeting résztvevői token;
- DIMPRO Fájlműhely desktop token.

Alapszabályok:

- a tokenben szereplő meetingazonosítónak meg kell egyeznie a kért meetinggel;
- lejárt token nem használható;
- desktop token csak megfelelő webes issuer jogosultsággal készíthető;
- a Fájlműhely a tokent nem menti tartósan nyílt konfigurációba;
- jogosulatlan API-kérés `401` választ kap.

A teljes Microsoft Entra ID / Teams SSO és Microsoft Graph alapú meetingtagság-ellenőrzés későbbi, production szintű fejlesztési lépés.

## 8. Automatikus Teams-téma

A konfigurációs oldal és a jobb oldali panel a Microsoft Teams SDK által átadott témát követi.

Támogatott témák:

- `default`: világos DIMPRO-panel;
- `dark`: Teamshez illeszkedő sötét DIMPRO-panel;
- `contrast`: nagy kontrasztú DIMPRO-panel.

A komponensek a `context.app.theme` értéket olvassák, és `registerOnThemeChangeHandler` eseményt figyelnek. A témaváltás újratöltés nélkül alkalmazódik.

A sötét téma szabályai:

- nincs fehér fejléc- vagy kártyaháttér;
- a Tailwind áttetsző háttérosztályok, például `bg-white/95`, külön sötét felülírást kapnak;
- a fő és másodlagos szövegek legalább jól olvasható kontrasztot kapnak;
- a lila, kék, zöld, sárga és piros státuszszínek sötét háttérhez igazított változatot használnak;
- az inputok, textarea mezők, selectek, helykitöltők, szegélyek és scrollbar is sötét témájú;
- a fókuszállapot billentyűzettel is látható;
- a modalok és exportpanelek ugyanazt a témát követik.

## 9. Adattárolás

Az értekezleti adat tartós projektgyökér-adattárban található:

`/root/dimprover/.dimprover/data/meeting-assistant`

Ez azért kötelező, mert a Next.js standalone build mappája új build során cserélődhet. Meetingadat nem tárolható kizárólag `.next/standalone` alatt.

Fő adattípusok:

- meeting munkatér JSON;
- snapshot JSON;
- párosítási rekordok;
- feltöltött mellékletek;
- AI költségnapló és eredményadatok.

## 10. Mellékletek és fájlfeltöltés

MVP alapérték:

- maximum 250 MB/fájl;
- egyszerre legfeljebb 10 fájl;
- ZIP támogatott;
- ZIP nem csomagolódik ki automatikusan;
- a résztvevői feltöltés először értekezleti bejövő / függő állapotba kerül;
- a szervező jóváhagyhatja, közzéteheti vagy visszavonhatja;
- a résztvevő csak a megosztott fájlt látja.

A felületen mindig látható az engedélyezett fájltípus és a maximális fájlméret.

## 11. AI-funkciók

Az AI kizárólag kézi gombnyomásra indul.

MVP műveletek:

- gyors összefoglaló;
- döntések és feladatok kinyerése;
- jegyzőkönyvtervezet;
- minőségellenőrzés.

Költségkontroll:

- futtatás előtt becsült költség Ft-ban;
- becsült tokenmennyiség;
- választott modell megjelenítése;
- külön jóváhagyó ablak;
- tényleges költség naplózása;
- projekt-, meeting- és felhasználói kapcsolat előkészítése;
- költségesebb futtatás emberi jóváhagyás nélkül nem indulhat.

Az AI eredménye javaslat, nem automatikusan közzétett hivatalos jegyzőkönyv.

## 12. AI tolmács irány

Az AI tolmács mód későbbi fejlesztési kör.

Tervezett funkciók:

- kézi indítás és leállítás;
- forrás- és célnyelv;
- magyar nyelv támogatása;
- élő fordított felirat;
- opcionális fordított hang;
- indítás előtti Ft-költségbecslés;
- futás közbeni költségmérő;
- tényleges költségnapló.

Valós hangkapcsolathoz Teams audioforrás, bot/desktop kapcsolat és szükség esetén Azure Speech integráció kell.

## 13. Értekezlet lezárása

A szervező három lezárási mód közül választhat:

- lezárás piszkozatként;
- lezárás jóváhagyásra váróként;
- lezárás és közzététel.

Meetingstátuszok:

- `active` – folyamatban;
- `draft_closed` – lezárt piszkozat;
- `pending_approval` – jóváhagyásra vár;
- `published` – közzétett;
- `archived` – archivált.

Lezárás előtt a panel jelzi:

- jóváhagyásra váró mellékletek számát;
- hiányzó felelősöket;
- hiányzó határidőket;
- nyitott napirendi pontokat.

Minden lezárás és archiválás új, növelt verziószámú snapshotot készít. A közzétett és archivált meeting újranyitás nélkül nem módosítható.

## 14. Archívum és visszakeresés

Központi route: `/ertekezletek`

Kereshető mezők:

- meeting címe;
- projekt;
- szervező;
- résztvevő;
- feladat;
- döntés;
- fájlnév;
- jegyzet;
- átirat.

Szűrhető:

- státuszra;
- projektre;
- dátumra előkészíthető;
- szervezőre és résztvevőre tovább bővíthető.

A későbbi projektmodulban ugyanaz az értekezlet a projekt adatlapján, a kapcsolódó dokumentumoknál és a feladatoknál is megjelenhet.

## 15. Export

Támogatott formátumok:

- PDF jegyzőkönyv;
- szerkeszthető HTML;
- teljes JSON adatcsomag.

A szervezői export a jogosultságtól függően privát adatokat is tartalmazhat. A résztvevői export kizárólag megosztott adatot tartalmazhat.

A PDF A4-es, nyomtatható, magyar karaktereket kezelő dokumentumként készül. A PDF-export első éles felhasználói letöltésekor vizuálisan ellenőrizni kell az oldaltörést és a karakterkészletet.

## 16. DIMPRO Fájlműhely kapcsolat

A DIMPRO Fájlműhely Értekezleti Kísérő Desktop MVP ugyanazt a központi meeting API-t használja.

Aktuális kapcsolódó kiadás: **v5.37.3 Meeting Archive & Export**

Desktop funkciók:

- teljes kapcsolati csomag beillesztése;
- tokenből meetingazonosító és lejárat ellenőrzése;
- automatikus meetingazonosító-javítás;
- munkatér betöltése;
- fájlfeltöltés;
- meetingstátusz és snapshot megjelenítése;
- archívum megnyitása;
- PDF-, HTML- és JSON-export.

A hivatalos meetingadat mindig a központi szerveren található. A desktop kliens opcionális munkaállomás-kiegészítő.

## 17. Fő forrásfájlok

- `components/meeting-assistant/MeetingAssistantPanel.tsx`
- `components/meeting-assistant/MeetingAssistantWorkspace.tsx`
- `components/meeting-assistant/TeamsMeetingAssistantClient.tsx`
- `components/meeting-assistant/TeamsMeetingAssistantConfig.tsx`
- `components/meeting-assistant/teams-meeting-theme.css`
- `components/meeting-assistant/MeetingArchiveClient.tsx`
- `app/lib/meeting-assistant/types.ts`
- `app/lib/meeting-assistant/store.ts`
- `app/lib/meeting-assistant/token.ts`
- `app/lib/meeting-assistant/pairing.ts`
- `app/api/meeting-assistant/workspace/route.ts`
- `app/api/meeting-assistant/access/route.ts`
- `app/api/meeting-assistant/pairing/route.ts`
- `app/api/meeting-assistant/upload/route.ts`
- `app/api/meeting-assistant/export/route.ts`
- `app/teams/meeting-assistant/page.tsx`
- `app/teams/meeting-assistant/configure/page.tsx`
- `app/ertekezleti-kisero/page.tsx`
- `app/ertekezletek/page.tsx`
- `teams-package/`

## 18. Ellenőrzési követelmények

Minden jelentősebb módosítás után:

1. backup az érintett fájlokról;
2. dokumentációfrissítés;
3. `npx tsc --noEmit`;
4. célzott ESLint;
5. production build;
6. sikeres build után PM2 restart;
7. konfigurációs oldal HTTP ellenőrzése;
8. token nélküli védett API-k `401` ellenőrzése;
9. párosítókód egyszeri használatának ellenőrzése;
10. Teams világos és sötét téma kézi vizuális ellenőrzése.

## 19. Következő fejlesztési lépések

- Microsoft Entra ID / Teams SSO;
- Microsoft Graph alapú szervező- és résztvevőazonosítás;
- tényleges meetingtagság és jogosultság szerveroldali ellenőrzése;
- Teams meeting végének automatikus érzékelése;
- feladatok átadása a DIMPRO központi Feladatok moduljába;
- projekthez kapcsolás és projektválasztó;
- korábbi értekezletek és nyitott pontok automatikus előkészítése;
- Teams átirat vagy bot/desktop hangkapcsolat;
- résztvevői jelenléti adatok;
- DOCX export;
- verziók közötti összehasonlítás;
- AI tolmács;
- production szintű adatbázis és objektumtárhely.

## 20. Aktuális állapot – 2026-07-20

Elkészült:

- Teams App v0.1.3 feltöltés és megjelenés;
- konfigurálható meeting side panel;
- szervezői és résztvevői nézet;
- egyszer használatos párosítókód;
- központi, meetinghez kötött hozzáférési token;
- folyamatos szerveres mentés;
- melléklet-feltöltés és jóváhagyási folyamat;
- kézi AI-gombok és költségkontroll;
- lezárás, újranyitás, archiválás és snapshot;
- központi értekezleti archívum;
- PDF/HTML/JSON export API;
- Fájlműhely v5.37.3 kapcsolat;
- automatikus világos, sötét és nagy kontrasztú Teams-téma;
- sötét panel teljes kontrasztjavítása, beleértve az áttetsző fehér Tailwind-háttereket, szövegeket, badge-eket, mezőket, szegélyeket és görgetősávot.

## Jelenléti ív és működő értekezletsablonok – 2026-07-20

A MeetingWorkspace adatmodell v3-ra bővült. A korábbi egyszerű `participants` névlista kompatibilitási célból megmarad, mellette részletes `attendees` jelenléti ív működik.

Jelenléti adatok: név, cég/szervezet, beosztás/szerepkör, e-mail, jelenléti státusz, online vagy személyes részvétel, érkezési és távozási idő, külsős/vendég jelölés.

A szervező felvehet, szerkeszthet és törölhet személyeket. A résztvevői panel csak olvasható jelenléti listát mutat, e-mail-cím nélkül. A régi meetingek egyszerű résztvevőnév-listája automatikusan v3 jelenléti rekordokká alakul.

Működő sablonok: Általános értekezlet, Heti kooperáció, Tervezői egyeztetés, Műszaki ellenőri bejárás, Hiba- és hiányegyeztetés, Műszaki átadás-átvétel.

A szervező sablont tölthet be, egyedi napirendi pontot adhat hozzá, átnevezhet, törölhet, fel/le mozgathat, aktuálisnak vagy teljesítettnek jelölhet, valamint megosztott/privát állapotot állíthat. A résztvevői panel kizárólag a megosztott napirendi pontokat mutatja.

A PDF/HTML/JSON export részletes jelenléti ívet és a tényleges napirendet tartalmazza. A résztvevői exportból az e-mail-címek kimaradnak. Az archív keresés a jelenlévők nevére, szervezetére, szerepkörére és e-mail-címére is kiterjed.

Ellenőrzések: TypeScript sikeres, célzott és teljes ESLint 0 hibával, production build sikeres, PM2 restart sikeres, 15 lépéses élő API- és HTML-export teszt kétszer sikeresen lefutott.

## Napirendi pont részletes kidolgozása – 2026-07-20

A MeetingWorkspace adatmodell v4-re bővült. Minden napirendi pont a cím mellett külön tartalmi mezőket tárol: téma leírása / előkészítés, egyeztetés részletes tartalma, döntés / eredmény, nyitott kérdések, privát szervezői megjegyzés, utolsó módosítás ideje és módosítója.

A webes és Teams szervezői panelen a jelenléti ív után közvetlenül megjelenik a `Napirend és jegyzőkönyvi tartalom` blokk. A kiválasztott napirendi pont listája alatt mindig látható az `Aktuális napirendi pont kidolgozása` munkalap. A pont nevére kattintva váltható az aktuális munkalap. Mentetlen tartalom mellett a rendszer megerősítést kér másik pontra váltás előtt.

A sablonok minden napirendi ponthoz valódi, szerkeszthető mintaszöveget töltenek be. A résztvevői oldal csak a megosztott pontok megosztott tartalmát mutatja; a privát szervezői megjegyzés nem jelenik meg. A részletes tartalom bekerül a snapshotba, archív keresésbe és a PDF/HTML/JSON jegyzőkönyv-exportba.

## Sürgős jogosultsági és használhatósági fejlesztési kör – 2026-07-20

### Teams szervező–résztvevő szétválasztás

A párosítás két külön, meetinghez kötött tokent ad ki. A közös Teams contentUrl kizárólag `teams-participant-readonly` tokent tartalmaz. A párosítást végző Teams-kliens a `teams-organizer-editor` tokent csak a helyi böngészőtárban őrzi. A meghívottak nem kapják meg a szervezői tokent, nem látnak nézetváltót, és API-kéréssel sem kérhetnek szervezői szerepet.

A résztvevői GET válasz szűrt munkateret ad: privát jegyzetek, privát napirendi pontok, privát feladatok, nem megosztott mellékletek és AI-eredmények nélkül. Résztvevői tokennel tiltott a metaadat-, jegyzet-, jelenléti-, napirend-, feladat-, lezárási-, AI- és átiratkezelés.

A webes kétoldali nézet változatlanul teljes értékű értekezletvezető munkatér: bal oldalon a szervező dolgozik, jobb oldalon ugyanazon élő adatok résztvevői tükre látható.

### Napirendi automatikus mentés

A napirendi tartalomszerkesztő 1,4 másodperces késleltetéssel automatikusan ment. A felület külön jelzi: automatikus mentésre vár, mentés folyamatban, mentve. A kézi `Mentés most` gomb megmaradt.

### Teams átirat

Elkészült a Microsoft Graph átiratszinkron szerveroldali és felületi alapja. A szervező Microsoft Entra felhasználóazonosítót és Graph onlineMeeting azonosítót rendelhet a meetinghez. A szerver listázza és letölti a transzkripteket, VTT tartalmat időbélyeges/beszélős sorokká alakít, és a meeting átiratába menti. Beszélő-hozzárendelés tiltása esetén beszélő nélküli formátumra vált.

A Teams v0.1.4 manifest RSC-előkészítést tartalmaz: `OnlineMeeting.ReadBasic.Chat`, `OnlineMeetingTranscript.Read.Chat`. A valós Graph használathoz külön Microsoft 365 rendszergazdai beállítás szükséges; részletes leírás: `17_teams_atirat_graph_beallitas.md`.

### Második használhatósági kör

- MeetingWorkspace v6 értekezleti alapadatokkal és projektkapcsolattal.
- DIMPRO Drive projektlista választható a szervezői panelből.
- Értekezlet címe, típusa, helyszíne, kezdése/befejezése, szervezője, jegyzőkönyvszáma, dokumentumazonosítója, előző és következő alkalma menthető.
- Feladatok, döntések, kérdések és határidők napirendi ponthoz rendelhetők.
- Mellékletek napirendi ponthoz rendelhetők és leírással láthatók el.
- Elkészült a valódi szerkeszthető DOCX-export a PDF/HTML/JSON mellett.
- Az archívum értekezlettípus-szűrőt, projektkódot, helyszínt, jegyzőkönyvszámot, PDF/DOCX gombot és előző meeting kapcsolatot kapott.

Ellenőrzés: TypeScript sikeres, teljes ESLint 0 hibával (meglévő figyelmeztetések mellett), production build sikeres, 17 lépéses éles integrációs teszt sikeres, valódi DOCX- és PDF-bájtkimenettel.

## v0.1.5 – projektkapcsolt értekezleti dokumentáció

A részletes kiadási leírás: `18_dimpro_ertekezleti_asszisztens_v015.md`.

Fő változások: kompakt ikonos Teams-fejléc, teljes szélességű szekciók, projektadatlap és állandó tagok, ÁLT/KOOP/TERV alapú automatikus számozás, külön dokumentumforma, értekezletvezető/jegyzőkönyvvezető/jóváhagyó, Gyors/Joker témablokkok, élő összefüggő dokumentum, korábbi dokumentum modal, AI-megfogalmazó modal, lezáró üzenetek, következő időpont, résztvevői visszajelzés és SMTP-alapú kiküldés.
