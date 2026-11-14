# Grid 0.1.138 – közvetlen csevegési indítás és Drive-forrás

## Bizonyított élő hiba

A 0.1.137-ben az Outmin-csevegőből érkező „Folytassuk a DIMPRO Drive fejlesztését…” utasítás új taskot indított, BOOT ACK-validálással. A modul mégis DIMPRO Projektkapu lett. A generikus, dátumot és workernevet tartalmazó csevegéscím nem adott egyértelmű modult; a `Folytassuk` alakot a célkiválasztó nem ismerte fel, a legújabb utasításban pedig a Projektkapu gomb is szerepelt. A kód egy korábbi, csak Projektkaput említő utasítást választott moduljelzésnek.

Az automatikus indítás az ismeretlen modulhoz a Grid runtime foundation commitját használta. A `dd2242e55218` forrásból hiányzik a Drive V0.9.68 verziófájlja és a Projektkapu kiadási oldala, és nincs benne a sikeresen kihelyezett Drive `41aacbe30b55` commitja. A `components/project-gate` listázás EXECUTION_SCOPE_DENIED eredménnyel megállt. A GIT_STATUS és LIST_FILES eredményei DELIVERED → ACKNOWLEDGED → COMPLETED állapotig jutottak; itt nem a kézbesítés akadt el. Fájlírás nem történt.

A valódi emberi üzenet 1005 karakteres: ez nem csonkolódott. A vizsgálat külön talált egy 1800 karakteres kliensoldali csonkolást; hosszabb utasításoknál ez elhagyhatott volna fontos korlátokat.

## Javítás

- A `Folytassuk` is fejlesztési felszólítás. Az első utasításmondat egyértelmű elsődleges modulja elsőbbséget kap a későbbi gombnevekkel és függőségekkel szemben. Nem általános nyelvi értelmező: többértelmű, ismert cím nélküli kérés nem indul el régebbi utasítás scope-jában.
- Az emberi utasítás teljes szövege, sortörései és végén álló korlátai megmaradnak. A 12000 karakteres összesített promptlimit túllépése hibát ad, nem levágott Launch Packetet. A szerver a közvetlen túl hosszú kérésnél is elutasít.
- Az automatikus indításnak modulforrás-katalógus kell. Ismeretlen modul nem eshet vissza észrevétlenül a Grid kiadási forrására. A kézi út meglévő explicit forráskezelése nem változik.
- A DIMPRO Drive kanonikus forrásága `codex/drive-validated-dev-baseline`, minimuma a ténylegesen ellenőrzött és DEV-re kihelyezett `41aacbe30b5514c3fe60c033d7dd8c6a0a4f80d0` commit. A verziófájl és kiadási oldal kötelező forrásfájl. A régi BOOT ACK nem adható át egy másik forrásra.
- Ugyanabban a csevegésben egy meglévő, más modulhoz kötött taskot az új utasítás nem folytathat észrevétlenül. Ehhez a meglévő, ellenőrzött újfeladat-leváltási út szükséges; aktív munka és jogosultság nem retargetálódik automatikusan.

## Ellenőrzés

Az eredeti 0.1.137 kódon a regresszió reprodukálható: DIMPRO Projektkapu != DIMPRO Drive. Az új nyolc kliensoldali és hét szerveroldali szerződéspróba tényleges függvényeket futtat, nem csak feliratokat ellenőriz. A két teszt a Windows-csomag kötelező check láncának része. A valódi 1005 karakteres emberi utasítás read-only replay-je a Drive modult választja és a teljes utasítást megtartja. A tényleges DEV canonical Git-repository-n a forrásresolver a V0.9.68-at adja vissza, a régi Grid commitot Drive-baseline-ként elutasítja.

## Üzemeltetés és határok

Ez Grid-javítás. A három új Drive-funkció ettől még nem készült el; az elakadt `dev-task-grid-4dd4fce4e6cc0ab0c81d` feladatot nem írjuk át kézzel és a scope-tilalmat nem kerüljük meg. A kiadás után az élő Windows újfeladat-előnézetében a megfelelő Drive modulnak, V0.9.68 forrásnak és Drive-előzménynek kell megjelennie.

A kanonikus Drive-baseline további előreléptetése csak új, ellenőrzött forrás/DEV-kiadás után történhet. A zöld modulírás és a review-köteles shared fájlok meglévő szabályai, a taskhoz kötött Git-mentési és DEV-kihelyezési engedélyek megmaradnak. Ez a javítás nem ad automatikusan jóváhagyást bármely shared fájlhoz, Git-mentéshez vagy kihelyezéshez a szöveges modulnév alapján.

Kiadási routing: `/api/dev/grid/`, system-health, valamint a Context Workspace lista és handoff végpontok együtt kövessék az új pinned runtime-ot. Drive3462 és AUTH változatlan; PROD DENY.
