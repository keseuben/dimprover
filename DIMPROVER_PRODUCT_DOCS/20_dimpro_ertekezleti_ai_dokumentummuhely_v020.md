# DIMPRO Értekezleti Asszisztens – AI dokumentumműhely v0.2.0

## Cél

A DIMPRO Értekezleti Asszisztens Microsoft Teams-átiratból, napirendből, jóváhagyott döntésekből, feladatokból, jegyzetekből és kijelölt képi/PDF-mellékletekből professzionális, szerkeszthető értekezleti dokumentumtervezetet készít.

A Teams oldalsó panel az élő értekezlet rögzítésére és összekapcsolására szolgál. A részletes AI-feldolgozás a DIMPRO webes értekezleti munkatér külön, teljes méretű AI dokumentumműhelyében történik.

Alapelv:

> A Teams Kísérő rögzít és összekapcsol. A DIMPRO tárol, feldolgoz, összefoglal és dokumentumot készít.

## Felületi felépítés

### Bal oldali forráspanel

- Microsoft Teams-átirat sor-, szó- és becsült tokenszáma;
- AI-feldolgozásra kijelölt képek és PDF-részletek;
- feltöltött PDF-, DOCX-, TXT- és ZIP-források;
- résztvevők száma;
- korábbi közzétett dokumentumverziók.

### Középső munkaterület

Lapok:

1. Összefoglaló – AI-javaslat és kézzel szerkeszthető dokumentumtervezet.
2. Átirat – eredeti, változatlan Teams-átirat.
3. Döntések – jóváhagyott döntésjegyzék.
4. Feladatok – feladatok, felelősök, határidők és nyitott kérdések.
5. Mellékletek – AI-ba bevont és kizárt mellékletek.
6. Dokumentum-előnézet – DIMPRO arculatú, export előtti dokumentumnézet.
7. AI-előzmények – token-, költség-, modell- és hibainformációk.

Az AI-válasz nem írja automatikusan felül a dokumentumot. A felhasználó külön választhat:

- Átemelés a tervezetbe;
- Hozzáfűzés;
- Elvetés.

### Jobb oldali AI-panel

- szélessége 330–620 px között húzható;
- összecsukható;
- modellszint-választó;
- műveletválasztó;
- minimum, várható és maximális Ft-költség;
- becsült input- és outputtoken;
- havi felhasználói keret és felhasználási sáv;
- külön költségjóváhagyás;
- prémium modellnél külön prémium-jóváhagyás;
- DOCX- és PDF-export.

## AI-modellszintek

A modellnevek, szolgáltatók és árak szerveroldali környezeti változókból érkeznek, nem a kliensbe vannak fixen beégetve.

### Gyors / takarékos

Feladatok:

- átirat előfeldolgozása;
- technikai zaj és ismétlés felismerése;
- témakörök elkülönítése;
- résztvevők felismerése;
- nyers döntés-, feladat- és határidőjelöltek.

### Kiegyensúlyozott szakmai

Feladatok:

- tárgyilagos szakmai összefoglaló;
- témakörönkénti dokumentum;
- döntések és nyitott kérdések szétválasztása;
- „Lényeg röviden” blokkok;
- szerkesztett átirat;
- általános dokumentumkészítés.

### Prémium / magas pontosság

Feladatok:

- összetett műszaki vagy szerződéses értekezlet;
- több szakágat érintő egyeztetés;
- nehezen értelmezhető összefüggések;
- végső szakmai és nyelvi finomítás.

A prémium modell külön felhasználói jóváhagyás nélkül nem indítható.

### Ellenőrző / audit

Feladatok:

- tervezet összevetése az eredeti forrással;
- döntések, feladatok, felelősök és határidők ellenőrzése;
- nem igazolt állítások kiszűrése;
- kihagyott témák és ellentmondások jelzése.

Az auditmodell csak javítási javaslatot készít, nem írja felül automatikusan a dokumentumot.

## AI-műveletek

### Előfeldolgozás

- Átirat elemzése;
- Témakörök felismerése;
- Résztvevők felismerése.

### Dokumentumkészítés

- Döntések kigyűjtése;
- Feladatok kigyűjtése;
- Rövid értekezleti összefoglaló;
- Értekezleti összefoglaló készítése;
- „Lényeg röviden” blokkok készítése;
- Szerkesztett átirat készítése;
- Teljes dokumentumcsomag szövegének elkészítése.

### Ellenőrzés

- Határidők és felelősök ellenőrzése;
- AI-ellenőrzés.

### Finomítás

- Nyelvi és szakmai finomítás;
- Rövidebb változat készítése;
- Részletesebb változat készítése.

A keskeny Teams-panelen csak négy gyorsművelet marad:

- rövid összefoglaló;
- feladatok és döntések felismerése;
- dokumentumtervezet;
- minőségellenőrzés.

## Dokumentumszabályok

Az AI rendszerprompt kötelező szabályai:

- kizárólag a bemenetben szereplő információ kezelhető tényként;
- felelős, határidő, döntés, résztvevő és műszaki adat nem található ki;
- bizonytalan adat jelölése: „egyeztetendő”, „pontosítandó” vagy „az átirat alapján nem egyértelmű”;
- minden fontos témakörhöz 2–4 pontos „LÉNYEG RÖVIDEN” blokk készíthető;
- félkövér kiemelés csak döntéshez, elfogadott irányhoz, fontos műszaki adathoz, konkrét feladathoz, felelőshöz, határidőhöz vagy kritikus kérdéshez használható;
- döntéshez és feladathoz lehetőség szerint időbélyeg, beszélő vagy forrásmondat tartozik;
- az AI-eredmény tervezet;
- automatikus kiküldés és véglegesítés tilos.

## Költségbecslés és jóváhagyás

Minden művelet előtt megjelenik:

- szolgáltató;
- modell és modellszint;
- becsült inputtoken;
- maximális outputtoken;
- minimum költség;
- várható költség;
- maximális engedélyezett költség.

Futtatási feltételek:

1. a felhasználó elfogadja a maximális költséget;
2. prémium modellnél külön prémium-jóváhagyást ad;
3. a szerver újraszámolja a becslést;
4. a kérés nem lépheti túl a szerveroldali műveleti és modelllimitet.

## Költség- és auditnapló

Az AI-használati napló v2 mezői:

- értekezlet;
- projekt;
- felhasználó/token kibocsátási célja;
- művelet;
- szolgáltató;
- modellszint;
- modellazonosító;
- becsült input- és outputtoken;
- tényleges input-, cache- és outputtoken;
- becsült költség;
- jóváhagyott maximális költség;
- tényleges USD- és Ft-költség;
- futási idő;
- státusz;
- hibaszöveg;
- újrapróbálkozások száma;
- kezdés és befejezés időpontja.

A workspace auditnapló külön eseményt kap minden sikeres AI-futtatásról.

## Szerveroldali konfiguráció

Fő környezeti változók:

- `OPENAI_API_KEY`;
- `MEETING_AI_USD_HUF_RATE`;
- `MEETING_AI_MAX_SINGLE_REQUEST_HUF`;
- `MEETING_AI_FAST_*`;
- `MEETING_AI_BALANCED_*`;
- `MEETING_AI_PREMIUM_*`;
- `MEETING_AI_AUDIT_*`;
- `MEETING_AI_MONTHLY_USER_BUDGET_HUF`;
- `MEETING_AI_MONTHLY_PROJECT_BUDGET_HUF`;
- `MEETING_AI_MONTHLY_ORGANIZATION_BUDGET_HUF`;
- `MEETING_AI_BUDGET_WARNING_PERCENT`.

Minden modellhez külön beállítható:

- szolgáltató;
- modellazonosító;
- megjelenített név;
- inputár;
- cache-inputár;
- outputár;
- aktív állapot;
- műveletenkénti költséglimit.

## Érintett fájlok

- `app/lib/meeting-assistant/ai.ts`;
- `app/api/meeting-assistant/ai/route.ts`;
- `app/lib/meeting-assistant/types.ts`;
- `components/meeting-assistant/MeetingAiDocumentStudio.tsx`;
- `components/meeting-assistant/MeetingAssistantWorkspace.tsx`;
- `components/meeting-assistant/MeetingAssistantPanel.tsx`.

## Kipróbálás

1. Nyisd meg az `/ertekezleti-kisero?meetingId=<azonosító>` munkateret.
2. Válaszd az `AI dokumentumműhely` nézetet.
3. Ellenőrizd a bal oldali forrásokat.
4. Válassz AI-műveletet és modellszintet.
5. Tekintsd meg a token- és Ft-becslést.
6. Nyisd meg a jóváhagyó ablakot.
7. Fogadd el a maximális költséget; prémium modellnél a külön prémium-feltételt is.
8. Indítsd el a futtatást.
9. Az eredményt emeld át, fűzd hozzá vagy vesd el.
10. Szerkeszd és mentsd a tervezetet.
11. Ellenőrizd a dokumentum-előnézetet.
12. Exportáld DOCX- vagy PDF-formátumban.

## Rollback

A fejlesztés előtti fájlok mentési helye:

`backups/meeting-ai-studio-20260722_200809`

A visszaállításhoz a backupban lévő fájlokat kell visszamásolni az eredeti útvonalukra, majd TypeScript-, lint- és production build után a `dimprover` PM2-folyamatot újraindítani.

## Teamsből nyitható teljes képernyős AI-munkatér

A teljes dokumentumműhely organizer-token birtokában külön Teams/DIMPRO mélylinkről is megnyitható:

`/teams/meeting-assistant/studio?meetingId=<meetingId>&accessToken=<organizerToken>`

Az útvonal a Teams-alkalmazás publikus útvonalcsaládjába tartozik, de érvényes organizer-token nélkül a workspace- és AI API nem szolgáltat értekezleti adatot. Ez készíti elő a későbbi „Megnyitás nagy ablakban / Folytatás a DIMPRO-ban” gombot.

## Költségbecslés-versenyhelyzet elleni védelem

Művelet- vagy modellváltáskor az előző becslés azonnal érvénytelenné válik. A futtatási gomb csak akkor engedélyezett, ha:

- a becslés művelete megegyezik az aktuálisan kiválasztott művelettel;
- a becslés modellszintje megegyezik az aktuálisan kiválasztott modellszinttel;
- az új becslés sikeresen visszaérkezett;
- a felhasználó elfogadta a maximális költséget;
- prémium modellnél a külön prémium-jóváhagyás is megtörtént.

## Ellenőrzési eredmények

- TypeScript: sikeres;
- teljes lint: 0 hiba, 112 korábban meglévő figyelmeztetés;
- production build: sikeres;
- böngészős AI dokumentumműhely smoke: 22/22 sikeres;
- valódi AI API-próba: sikeres;
- teszt tényleges AI-költsége: 0,802 Ft;
- editor jogosultsági regresszió: 17/17 sikeres;
- lezárás és archiválás regresszió: 16/16 sikeres;
- mellékletszerkesztő regresszió: 11/11 sikeres.

## Párhuzamos mentések stabilitása

A workspace-, pairing-, editor-pairing-, projektprofil- és AI-használati napló mentései kriptográfiailag egyedi ideiglenes fájlnevet használnak. Az ideiglenes név részei:

- célfájl neve;
- Node folyamat azonosítója;
- időbélyeg;
- `randomUUID()` érték.

Ez megakadályozza, hogy ugyanabban a milliszekundumban induló párhuzamos mentések ugyanazt az ideiglenes fájlt próbálják átnevezni.

Ellenőrzés:

- 30 párhuzamos workspace-mentés;
- 30/30 sikeres válasz;
- új `ENOENT rename` hiba nem keletkezett.

Kapcsolódó rollback backup:

`backups/meeting-atomic-write-20260722_211124`
