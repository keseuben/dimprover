# DIMPRO Értekezleti Kísérő – élő követés, vezérlőkód, szöveges bejegyzések, Teams-átirat és jelenlét v0.1.9

Dátum: 2026-07-23

## Cél

A Teams jobb oldali DIMPRO-panel, a Teams közös meeting-stage és a webes értekezleti munkatér ne egymástól független, rögzített képernyőként működjön. A megosztott felület kövesse az aktív előadó nyilvános navigációját, közben a résztvevők szöveges bejegyzései, a jóváhagyott fotók, a Teams-átirat és a jelenléti adatok ugyanahhoz az összefüggő értekezleti dokumentumhoz kapcsolódjanak.

## 1. Dinamikus élő követés

Az alsó, fix kétsoros boardon új Élő követés gomb található.

Bekapcsolva a közös Teams-stage követi:

- az aktív nyilvános modult;
- az aktív napirendi pontot;
- a megnyitott mellékletet;
- a nyilvános dokumentumrészhez tartozó görgetési helyzetet;
- az Élő dokumentum / Élő követés / Rögzített nézet módot.

A rendszer nem képernyőképet vagy a szervezői UI teljes másolatát közvetíti. Csak a résztvevő számára engedélyezett tartalom kerül a megosztott nézetre. A privát szervezői jegyzetek, AI-költségadatok, jogosultsági és adminisztrációs elemek rejtve maradnak.

A prezentációs állapot külön, rövid időközönként frissülő szerveres állapotként működik. A normál munkatér továbbra is 5 másodperces adatfrissítést használ, a prezentációs navigáció körülbelül 0,9 másodpercenként ellenőrződik és 0,65 másodperces késleltetéssel kerül továbbításra.

## 2. Saját olvasás és visszatérés az előadóhoz

A közös Teams-stage felületén a résztvevő ideiglenesen szüneteltetheti a követést:

- `Saját olvasás`
- `Vissza az előadóhoz`

Saját olvasáskor az előadó navigációs változásai nem mozgatják a résztvevő felületét. A Vissza az előadóhoz gombbal az élő követés újra aktiválható.

## 3. Hatjegyű prezentációs vezérlőkód

A közös nézet vezérlése külön jogosultság, nem azonos a jegyzőkönyv-szerkesztési jogosultsággal.

A szervező vagy az aktív jegyzőkönyv-szerkesztő:

1. megadja a kijelölt személy nevét;
2. opcionálisan megadja az e-mail-címét;
3. létrehoz egy egyszer használatos, hatjegyű vezérlőkódot;
4. e-mail-cím esetén a DIMPRO privát levélben elküldi a kódot;
5. e-mail-hiba esetén a kód továbbra is létrejön és másolható.

A kód:

- egy konkrét meetingId-hez tartozik;
- alapértelmezetten 10 percig érvényes;
- egyszer használható;
- legfeljebb 5 hibás próbálkozást enged;
- opcionálisan egy konkrét e-mail-címhez kötött;
- aktiválás után külön `teams-presentation-controller` tokent ad;
- nem ad jegyzőkönyv-szerkesztési, szervezői vagy adminisztrátori jogot.

## 4. Szervezői azonnali visszavétel

A szervező a `Vezérlés azonnali visszavétele` gombbal bármikor, a másik fél jóváhagyása nélkül visszaveheti az irányítást.

Visszavételkor:

- az aktív prezentációs grant visszavonásra kerül;
- a korábbi vezérlő tokenje többé nem módosíthatja a nézetet;
- a szervező lesz az aktív vezérlő;
- az esemény auditnaplóba kerül.

A szervező normál navigációja nem írhatja felül véletlenül a delegált vezérlést. Ehhez explicit visszavétel szükséges.

## 5. Kétsoros fix alsó board

A panel alján mindig látható kétsoros board működik.

### Első sor – funkciógombok

- Teljes képernyős élő dokumentum;
- Élő követés be/ki;
- Vezérlőkód és vezérléskezelés;
- Szöveges gyorsrögzítés;
- Teams-stage megosztás;
- Munkamenet biztonságos bezárása.

### Második sor – állapot

Az alacsony állapotsor megjeleníti:

- mentési állapotot;
- élő szinkront;
- prezentációs módot;
- aktív vezérlő nevét;
- kapcsolati vagy mentési hibát.

## 6. Szöveges gyorsrögzítés

A lebegő gyorsrögzítő kártya megmaradt, és az alábbi mezőket kapta:

- bejegyző neve – kötelező;
- e-mail-cím – opcionális;
- kapcsolódó napirendi pont – opcionális;
- szöveg – kötelező;
- kerüljön az élő dokumentumba és exportba – alapértelmezetten bekapcsolva.

A `Résztvevő` általános név nem fogadható el valódi név helyett.

A résztvevői bejegyzés először jóváhagyásra vár. A szervezői vagy szerkesztői bejegyzés közvetlenül megosztott állapotba kerül.

## 7. Külön Szöveges bejegyzések modul

A felső modulikonok között külön `Szöveges bejegyzések` modul található.

Szervezői és szerkesztői funkciók:

- név, e-mail, szöveg és napirendi kapcsolat szerkesztése;
- jóváhagyás;
- kizárás X gombbal;
- dokumentumba kerülés szabályozása jelölőnégyzettel;
- napirendi ponthoz utólagos hozzárendelés.

A pipa kikapcsolása nem törli a bejegyzést. A tartalom megmarad a rendszerben és az auditfolyamatban, de kimarad az élő dokumentumból és exportból.

## 8. Teljes képernyős élő dokumentum

A Teljes összefüggő emlékeztető modul és az alsó board is megnyithatja a nagy, olvasásra optimalizált élő dokumentumot.

A dokumentum tartalmazza:

- értekezlet alapadatait;
- tényleges jelenlévőket;
- megosztott jegyzetet;
- nyilvános napirendi pontokat és témablokkokat;
- egyeztetési szöveget;
- döntéseket és nyitott kérdéseket;
- megosztott feladatokat és határidőket;
- jóváhagyott, dokumentumba jelölt szöveges bejegyzéseket;
- jóváhagyott fotókat és mellékleteket;
- képaláírást és feltöltő nevét.

A napirendi ponthoz rendelt bejegyzések és képek az adott témakörnél jelennek meg. A nem rendelt elemek általános szöveges bejegyzés vagy általános melléklet részbe kerülnek.

A Teams-stage `Élő dokumentum` módban automatikusan erre a nézetre vált.

## 9. Munkamenet biztonságos bezárása

A munkamenet-bezárás külön funkció a formális értekezletlezárástól.

Műveletei:

- utolsó mentési állapot rögzítése;
- prezentációs vezérlés elengedése;
- stage-megosztás leállításának kérése;
- opcionális automatikus átiratfigyelés bekapcsolása;
- auditbejegyzés;
- visszajelzés arról, hogy a Teams-panel biztonságosan bezárható.

Nem módosítja automatikusan az értekezlet formális státuszát, nem publikál és nem archivál.

## 10. Teams-átirat – automatikus Graph-import

Az automatikus import a meglévő Microsoft Graph alkalmazáskapcsolatra épül.

Szükséges adatok:

- szervező Entra felhasználóazonosító;
- Graph onlineMeeting ID;
- Microsoft Graph alkalmazásjogosultság;
- Teams-adminisztrációs átirat API hozzáférés;
- beszélőnevekhez speaker attribution engedély.

A `Bezárás és automatikus átiratfigyelés` bekapcsolása után a szerver legfeljebb 7 napig időszakosan ellenőrzi az átiratot.

Az automatikus figyelő:

- legfeljebb 30 aktív munkateret dolgoz fel egy futásban;
- deduplikálja az átiratsorokat;
- megőrzi a beszélőneveket és időbélyegeket;
- beolvassa a jelenléti jelentést is, ha elérhető;
- a résztvevői munkatérben nem mutatja meg a Graph belső azonosítóit vagy hibaadatait.

Védett végpont:

`POST /api/meeting-assistant/artifact-watch`

A végpont `MEETING_TRANSCRIPT_WATCH_KEY` vagy `DIMPRO_SERVER_MONITOR_KEY` fejlécazonosítást használ.

## 11. Kézi Teams-átiratimport

Graph-integráció nélkül vagy tartalék megoldásként támogatott:

- VTT;
- DOCX;
- TXT;
- beillesztett szöveg.

Beállítások:

- meglévő átirat kiegészítése;
- meglévő átirat teljes cseréje.

A rendszer:

- felismeri a VTT beszélőcímkéket;
- megőrzi az időbélyegeket;
- számolja az azonosított beszélőket;
- az eredeti fájlt alapértelmezetten nem tárolja;
- az importált sorokat az AI Dokumentumműhely számára elérhetővé teszi.

Fájlkorlát: 25 MB.

## 12. Teams-meghívottak és tényleges jelenlét

A Jelenlévők modulban új Microsoft Teams panel található.

### Értekezlet előtt

`Teams meghívottak betöltése`

A Graph naptáreseményből átvehető:

- szervező;
- kötelező és opcionális meghívottak;
- név;
- e-mail;
- meghívotti típus;
- válaszállapot.

### Értekezlet után

`Tényleges jelenlét frissítése`

A Teams attendance reportból átvehető:

- tényleges résztvevő;
- Teams-szerepkör;
- külső/vendég jelölés;
- be- és kilépési intervallumok;
- összes jelenléti idő;
- késői érkezés vagy korábbi távozás.

Az adatok Teams ID, e-mail vagy név alapján összefésülődnek a meglévő DIMPRO-jelenléti adatokkal. A DIMPRO-ban kézzel megadott szervezet, telefonszám és projektkapcsolat megmarad.

## 13. Adatbiztonság

- A prezentációs token nem használható jegyzőkönyv szerkesztésére.
- A résztvevői exportból a prezentációs grant, e-mail, Graph onlineMeeting ID, naptáresemény ID, attendance report ID és Graph hibaadatok törlődnek.
- A privát szervezői jegyzet nem kerül az élő stage-re.
- A kézi átiratfájl alapértelmezetten nem kerül tartós tárolásra.
- A prezentációs kód hash formában tárolódik.
- A szervezői visszavétel azonnal érvényteleníti a delegált vezérlést.

## 14. Microsoft-beállítási korlát

A kód és a DIMPRO-felület működése elkészült, de az automatikus Graph-átirat és attendance import tényleges Microsoft 365 adatokkal csak akkor működik, ha:

- a DIMPRO Entra alkalmazás regisztrálva van;
- a szükséges Graph alkalmazásengedélyek adminisztrátori jóváhagyást kaptak;
- az alkalmazáshoz szükséges Teams application access policy be van állítva, ha az adott tenant megköveteli;
- az átirat API hozzáférés és speaker attribution engedélyezve van;
- a megfelelő Graph meeting/event azonosítók elérhetők.

Ezek nélkül a felület egyértelmű `permission_required` vagy `not_configured` állapotot mutat. A kézi VTT/DOCX/TXT import ettől függetlenül működik.

## Rollback

`backups/meeting-live-control-attendance-20260723_100950`

## 15. Végső ellenőrzési eredmények

- v0.1.9 élő vezérlés és dokumentum integráció: 34/34 sikeres;
- v0.1.8 projekt, útmutató, capture és stage regresszió: 27/27 sikeres;
- v0.1.7 együttműködési regresszió: 22/22 sikeres;
- mellékletszerkesztő regresszió: 11/11 sikeres;
- szerkesztői jogosultság regresszió: 17/17 sikeres;
- lezárás és archiválás regresszió: 16/16 sikeres;
- összes célzott és regressziós ellenőrzés: 127/127 sikeres;
- TypeScript: sikeres;
- teljes ESLint: 0 hiba, 112 korábbi figyelmeztetés;
- production build: sikeres;
- Teams side panel: 200 OK;
- Teams stage: 200 OK;
- védett prezentációs API token nélkül: 401, elvárt;
- artifact watcher kézi futtatás: sikeres, 0 aktuális munkatér;
- PM2: online, unstable restart: 0;
- az éles újraindítás óta az error log nem kapott új bejegyzést.

A beépített általános smoke eszköz időkorlátba ütközött, de konkrét hibát nem adott. A részletes API-, böngészős, jogosultsági, dokumentum- és regressziós tesztek sikeresek.

## 16. Üzemeltetési állapot

Az artifact watcher védett kulcsa létrejött, és az alábbi cronfeladat telepítve van:

`*/10 * * * * /bin/bash /root/dimprover/scripts/run-meeting-artifact-watch.sh >> /var/log/dimpro-meeting-artifact-watch.log 2>&1`

A Microsoft Graph alkalmazáskapcsolat jelenleg nincs konfigurálva. Emiatt:

- a kézi VTT/DOCX/TXT és beillesztett szöveges átiratimport működik;
- a prezentációs vezérlőkód és e-mail-küldés a meglévő DIMPRO SMTP-beállítást használja;
- az automatikus Graph átirat- és attendance import csak a későbbi Entra/Graph beállítás után tud tényleges Microsoft-adatot letölteni.

## 17. Capture regresszió javítása

A végső ellenőrzés során a hiányzó vagy érvénytelen tokennel megnyitott capture útvonal egy kliensikonhoz tartozó Next.js route-manifest hibát okozott. A zárolt oldal ikonja teljesen szerveroldali SVG-re lett cserélve.

Végleges eredmény:

- token nélküli capture: 200 OK, zárolt tájékoztató oldal;
- szervezői tokenes capture: működő nagy rögzítő munkatér;
- résztvevői token: szervező-only zárolási üzenet;
- a végleges újraindítás óta nincs új PM2 error-log bejegyzés.
