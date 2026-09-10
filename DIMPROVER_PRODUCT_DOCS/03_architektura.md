# 03 Architektúra

## Alap technológia

- Next.js
- React
- TypeScript
- Tailwind CSS
- PDF.js / pdfjs-dist
- Puppeteer alapú PDF export API

## Moduláris komponensszerkezet

A fő UI komponensek `components/` alatt, az oldal belépési pontok az `app/` mappában találhatók.

## Viewer architektúra

A terv- és dokumentumnézők közös viewer típusokat használnak:

- `PlanViewerFile`
- `PdfPlanViewer`
- `PlanViewerShell`
- `PlanIssueMarker`

A markeradatok százalékos pozíciót használnak, ezért a PDF zoomtól és canvas mérettől függetlenül tárolhatók.

## DIMPRO licencszerver MVP architektúra

A DIMPRO / DIMPROVER alapú kliensprogramok licencellenőrzéséhez külön licencmotor készült az `app/lib/license/` mappában.

Fő részek:

- `app/lib/license/types.ts` – licencstátuszok, kérés/válasz típusok, token payload és adatmodell típusok.
- `app/lib/license/store.ts` – MVP fájlalapú licenc-adattár a `.dimprover/data/license-store.json` fájlban.
- `app/lib/license/crypto.ts` – Ed25519 kulcsgenerálás, aláírás, tokenkészítés és publikus kulcs lekérése.
- `app/lib/license/service.ts` – aktiválási és ellenőrzési üzleti logika.

API route-ok:

- `POST /api/license/activate`
- `POST /api/license/check`
- `GET /api/license/public-key`

Biztonsági alapelv:

- A kliens nem dönthet arról, hogy egy licenc aktív-e.
- A lejárat, tiltás, próbaállapot, függő állapot, gépszám limit és moduljogosultság szerveroldalon dől el.
- A kliens csak a szerver által visszaadott `licenseState` és Ed25519 aláírt token alapján engedélyezheti a funkciókat.

Kulcskezelés:

- Éles üzemben a privát Ed25519 kulcs szerveroldali környezeti változóban legyen: `DIMPRO_LICENSE_PRIVATE_KEY_PEM` vagy `DIMPRO_LICENSE_PRIVATE_KEY_BASE64`.
- Ha nincs megadott privát kulcs, az MVP szerver lokálisan generál egy Ed25519 kulcspárt a `.dimprover/license/` mappába.
- A kliens `dimpro_license_config.json` fájljába a publikus kulcs `serverPublicKeyBase64` mezőbe kerül.

MVP megjegyzés:

A jelenlegi fájlalapú licenc-adattár később adatbázisra cserélhető anélkül, hogy a kliens API-szerződését módosítani kellene.

### HAGE-INVEST / DIMPRO 118 licencvédett csomagolás

A HAGE-INVEST munkafelületből két külön csomag készül:

- `HAGE_DEV_118.zip` – fejlesztői csomag teljes forráskóddal, csak tulajdonosi / ChatGPT továbbfejlesztési célra.
- `HAGE_RUN_118.zip` – kiadható futtatási csomag OneDrive / SharePoint megosztásba, fejlesztői forrás és `launcher_source` nélkül.

A felhasználók nem központi szervergépről használják a rendszert. Minden gépen a tálcára rögzített `DIMPRO_HAGE_Indito.exe` indítja a helyi futtatási csomagot. A közös OneDrive / SharePoint mappa csak a RUN csomag terjesztési és elérési helye; nem klasszikus központi alkalmazásszerver.

RUN csomag alapelvek:

- A `launcher_source` mappa nem kerülhet bele.
- A fejlesztői `app/`, `components/`, `scripts/`, TypeScript/TSX forrás nem kerülhet bele.
- A build `standalone` kimenetre készül, source map nélkül.
- A launcher a `dimpro_hage_license_config.json` fájlból olvassa a `licenseServerUrl` értékét.
- Alapértelmezett licencszerver: `https://license.dimpro.hu`.
- A licenckulcs nincs beégetve az EXE-be; első használatkor kerül megadásra és helyi cache-be.
- Lejárt, tiltott vagy gépszám-limitet elért licencnél az indító nem engedi elindítani a munkafelületet.

Csomagoló parancs:

```txt
npm run package:hage:118
```

## Licencadmin alatti fejlesztői központ és release védelem

A DIMPRO szoftverfejlesztői központ és a Fájlműhely release lista a licencadmin belépési logikához tartozik, nem a normál DIMPROVER app-loginhoz.

Fő útvonalak:

- `https://license.dimpro.hu/admin` – licencadmin belépés és belépés utáni választófelület.
- `https://license.dimpro.hu/admin/dev` – védett DIMPRO szoftverfejlesztő kezdőlap.
- `https://license.dimpro.hu/admin/fajlmuhely-verziok` – védett DIMPRO Fájlműhely verziólista.
- `https://license.dimpro.hu/admin/releases` – admin release feltöltő.
- `https://license.dimpro.hu/admin/drive` – Drive fejlesztői admin.
- `https://license.dimpro.hu/admin/szerver` – szerverállapot admin.

A `/admin/dev` és `/admin/fajlmuhely-verziok` oldalak kliensoldalon ellenőrzik a böngészőben tárolt `dimproLicenseAdminKey` értéket, majd a szerveroldali admin API-k felé igazolják. A release lista nem közvetlen szerveroldali nyílt fájllistából épül, hanem a védett `GET /api/releases/list` végponton keresztül, `x-dimpro-license-admin-key` headerrel.

A régi `https://dimprover.hu/releases/dimpro-fajlmuhely` és `https://license.dimpro.hu/releases/dimpro-fajlmuhely` útvonal admin célra nem használandó; átirányításra kerül az új `/admin/fajlmuhely-verziok` oldalra.

## DIMPRO Drive webes admin előnézet belépési logika

A webes DIMPRO Drive MVP jelenleg admin/fejlesztői előnézetként működik, nem végleges ügyféloldali Drive portálként.

Útvonalak:

- Elsődleges admin előnézet: `https://license.dimpro.hu/drive`.
- A régi / korábbi app előnézeti cím: `https://app.dimpro.hu/drive` átirányít a license domain alatti `/drive` oldalra.

Indoklás:

- A licencadmin belépés után a böngésző `localStorage` tárhelyében a `dimproLicenseAdminKey` csak azon a domainen érhető el, ahol a belépés történt.
- Emiatt a webes Drive admin előnézetet a `license.dimpro.hu` domain alatt kell futtatni, különben az `app.dimpro.hu` nem látja a licencadmin kulcsot.
- A `/drive` oldal kliensoldalon ellenőrzi a `dimproLicenseAdminKey` értéket a `GET /api/drive/health` végponton keresztül.
- Sikeres ellenőrzés után a Drive API hívások `x-dimpro-license-admin-key` headerrel futnak.
- A külön `x-dimpro-drive-dev-token` mező tartalék fejlesztői tesztként megmaradt, de normál admin használatban nem szükséges.

## DIMPRO Drive webes admin UI működési réteg

A `/drive` webes admin előnézet jelenlegi működése:

- licencadmin munkamenet ellenőrzése `dimproLicenseAdminKey` alapján;
- automatikus Drive adatbetöltés sikeres admin ellenőrzés után;
- `GET /api/drive/health` – API státusz;
- `GET /api/drive/projects` – projektlista;
- `GET /api/drive/projects/[projectId]/files` – kiválasztott projekt fájlmetadata listája;
- `GET /api/drive/storage-plan` – Object Storage előkészítő állapot.

A felület a fájlokat metadata szinten kezeli. A letöltés, feltöltés, előnézet, jogosultságos megosztás és DocumentViewer integráció későbbi lépés. A részletpanelben ezek csak előkészített, nem aktív műveletként jelennek meg.

UI funkciók:

- projektlista bal oldalon;
- középső fájltábla;
- jobb oldali részletpanel;
- keresés fájlnév, útvonal, státusz és kiterjesztés alapján;
- státusz és típus szűrés;
- látható fájlok száma és metadata méret összesítés;
- upload-preview és folder rekordok gyors kimutatása;
- storage provider információ megjelenítés.

## DIMPRO Drive download-init UI szerződés

A `/drive` webes admin előnézetben a kijelölt fájl részletpanelén a „Letöltés előkészítése” gomb a meglévő Drive API szerződésre kötött:

- `POST /api/drive/files/[fileId]/download/init`.

A végpont jelenlegi MVP működése:

- licencadmin vagy Drive dev-token alapú API hitelesítés;
- fájlazonosító normalizálása;
- fejlesztői download session adatok visszaadása: `downloadId`, `fileId`, `mode`, `clientId`, `expiresAt`, `note`;
- még nem ad vissza valós, aláírt fájlletöltési URL-t.

A webes UI a választ megjeleníti a jobb oldali részletpanelen. Ez a desktop Fájlműhely / DIMPRO Drive Desktop kliens későbbi letöltési szerződésének webes tesztfelületeként is használható.

## DIMPRO Drive upload-init UI szerződés

A `/drive` webes admin előnézet bal oldali panelén megjelent az „Upload init teszt” blokk. Ez a meglévő Drive API feltöltési előkészítő szerződését hívja:

- `POST /api/drive/projects/[projectId]/upload/init`.

A webes blokk mezői:

- fájlnév;
- relatív útvonal;
- fájlméret byte-ban;
- MIME típus.

A végpont jelenlegi MVP működése:

- licencadmin vagy Drive dev-token alapú API hitelesítés;
- projektazonosító és relatív útvonal normalizálása;
- upload session létrehozása;
- visszaadja az `uploadId`, `projectId`, `fileName`, `relativePath`, `fileSizeBytes`, `mimeType`, `status`, `createdAt`, `updatedAt`, `clientId` és `nextEndpoint` értékeket;
- még nem tölt fel valós fájlt, csak előkészíti a chunk alapú feltöltési workflow-t.

Ez a webes tesztfelület a későbbi DIMPRO Drive Desktop / DIMPRO Fájlműhely kézi feltöltés és szinkron funkció szerződését készíti elő.

## DIMPRO Drive Desktop GUI – kézi upload-init előkészítés

A `desktop_clients/dimpro_drive_client_mvp/dimpro_drive_gui.py` GUI kiegészült helyi fájl kiválasztással és upload-init előkészítéssel.

Új funkciók:

- helyi fájl kiválasztása feltöltés előkészítéshez;
- fájlméret megjelenítése;
- MIME típus automatikus javaslata;
- relatív szerverútvonal automatikus javaslata;
- upload-init meghívása a kiválasztott projektre;
- `defaultUploadRelativePath` token nélküli config mező.

Relatív útvonal logika:

- ha a fájl a kiválasztott helyi Drive mappán belül van, a GUI ebből képez relatív útvonalat;
- ha nincs a helyi Drive mappán belül, alapértelmezett útvonal: `99_Feltoltesek/[fájlnév]`.

MVP korlát: a GUI ebben a körben még nem küld fájltartalmat, nem küld chunkot, nem hív complete végpontot, nem szinkronizál és nem töröl. A művelet csak feltöltési sessiont készít elő.

## DIMPRO Drive Desktop GUI – kis fájl teljes MVP feltöltés

A desktop kliens és GUI kiegészült a kis fájl teljes MVP feltöltési láncával.

Új kliensmetódusok:

- `request_raw(method, path, payload, extra_headers)`;
- `upload_chunk(upload_id, chunk_index, payload)`;
- `upload_complete(upload_id)`;
- `upload_small_file(project_id, file_path, relative_path, mime_type, max_bytes)`.

A GUI új gombja:

- „Kis fájl feltöltése MVP”.

A gomb workflow-ja:

1. `POST /api/drive/projects/[projectId]/upload/init`;
2. `PUT /api/drive/uploads/[uploadId]/chunk`;
3. `POST /api/drive/uploads/[uploadId]/complete`;
4. siker esetén projektfájllista frissítés.

MVP korlátok:

- legfeljebb 10 MB;
- egy fájl;
- egy chunk;
- nincs retry;
- nincs megszakított feltöltés folytatása;
- nincs automatikus háttérszinkron;
- nincs helyi fájltörlés.

Ez az első működő desktop oldali feltöltési előkészítésből teljes kisfájlos feltöltéssé bővített workflow.

## DIMPRO Drive Desktop GUI – download-init, műveleti napló és előzmények

A desktop kliens több új MVP-szinttel bővült:

1. Kijelölt szerverfájl download-init:
   - a szerverfájllista táblázatból kiválasztott fájlra meghívható a `POST /api/drive/files/[fileId]/download/init` végpont;
   - ez még nem tényleges fájlletöltés, hanem letöltési session előkészítése.

2. Helyi műveleti napló:
   - JSONL formátumú naplófájl: `dimpro_drive_operations.jsonl`;
   - minden sor külön JSON esemény;
   - naplózott mezők: időpont, művelet, sikeresség, cél, teljes payload.

3. Műveleti előzmények panel:
   - a GUI-ban külön előzménytáblázat jelenik meg;
   - oszlopok: idő, művelet, OK, cél;
   - a GUI-ból frissíthető és megnyitható a napló.

4. CLI naplófunkciók:
   - `--log-file` egyedi naplófájl megadásához;
   - `--show-log` a napló JSON formátumú megjelenítéséhez.

Ezek a funkciók továbbra is kizárólag a desktop kliensmappát érintik, a Next.js webapp modulstruktúráját nem.

## DIMPRO Drive Desktop GUI – letöltési mentési terv

A desktop GUI letöltési workflow-ja kiegészült helyi mentési célútvonal kezelésével.

Új GUI elemek:

- „Kézi letöltés előkészítés” panel;
- cél helyi fájlútvonal mező;
- „Mentési hely választása” gomb;
- „Download-init + mentési terv” gomb.

Működés:

- a szerverfájllista kiválasztott fájljából a GUI helyi célútvonalat javasol;
- ha van helyi DIMPRO Drive mappa, a szerver relatív útvonalát ez alá képezi le;
- ha nincs helyi Drive mappa, a felhasználó Downloads mappájába javasol mentési helyet;
- a download-init API válasz és a helyi célútvonal együtt kerül a műveleti előzményekbe és JSONL naplóba.

MVP korlát: a fájltartalom tényleges letöltése még nem történik meg. Ehhez később signed URL / stream / objektumtár letöltési API szükséges.

## 2026-07-12 – Értesítési Központ architektúra

A webes Értesítési Központ szerverközpontú elven működik. A hivatalos állapot nem a böngészőben és nem az asztali kliensben van, hanem a DIMPROVER szerveren.

Új szerkezeti elemek:
- `app/lib/notifications/types.ts` – Notification, NotificationRecipient, ActivityLog típusok.
- `app/lib/notifications/notificationStore.ts` – MVP file-backed szerveroldali értesítési tároló.
- `app/lib/notifications/notificationAuth.ts` – web session és Drive Desktop token alapú API azonosítás.
- `app/api/notifications/*` – közös web/desktop Notifications API.
- `components/notifications/*` – webes NotificationBell, lista, kártya, részletező panel és teljes központ komponensek.

MVP tárolás:
- `.data/dimpro-notifications/notifications.jsonl`
- `.data/dimpro-notifications/recipients.jsonl`
- `.data/dimpro-notifications/activity.jsonl`

Későbbi irány: Supabase/PostgreSQL táblákra migrálás `notifications`, `notification_recipients`, `activity_log`, `project_members` szerkezettel.

## 2026-07-31 – Háromszerveres célarchitektúra és rendszerstruktúra oldal

Tervezett infrastruktúra:

- PROD VPS: meglévő Ubuntu 24.04 LTS éles szerver;
- DEV VPS: új Ubuntu 24.04 LTS Prémium Large szerver `dev.dimpro.hu` címmel;
- DATABASE VPS: új Ubuntu 24.04 LTS Prémium Medium szerver `db.dimpro.hu` címmel;
- külön privát S3-kompatibilis Object Storage a fájlokhoz.

A PROD, DEV és DATABASE környezet külön MCP-/hozzáférési határt kap. Normál fejlesztési build a DEV VPS-en történik. A PROD csak backup, release és DEV jóváhagyás után módosítható.

A rendszerstruktúra és átalakítási terv védett belső oldala:

- `https://license.dimpro.hu/admin/dev/rendszerstruktura`

Az oldal külön adatfájlból épül, és a jelenlegi állapotot a tervezett célállapottal párosítva mutatja. A tervezett elemek sötétszürkék, a folyamatban lévők türkizek, a külső lépésre várók borostyánszínűek, a teljesítettek zöldek.

## 2026-08-01 – Projektkapu Project Core MVP

Új közös szerveroldali réteg:

- `app/lib/project-core/types.ts` – projekt, tagság, szerepkör, jogosultság, lifecycle és audit típusok;
- `app/lib/project-core/permissions.ts` – szerepkör-alapú engedélymátrix;
- `app/lib/project-core/store.ts` – atomi file-backed MVP repository, későbbi PostgreSQL migrációs határral;
- `app/lib/project-core/auth.ts` – route-szintű session/token feloldás és minden kérésnél `project_id + membership + permission` ellenőrzés;
- `app/api/projects/*` – projektlista, projektadat, dashboard, tagság és életciklus API-k.

Az önálló Projektkapu és a többprojektes DIMPROVER ugyanazt a projektazonosítót és később ugyanazt a PostgreSQL Project Core-t használja. A projekt nem másolódik a két termék között. A file-backed repository csak MVP és fejlesztési átmenet; a cél külön PostgreSQL repository.

A Projektkapu vizuális rendszerének közös témaváltozói a `ProjectGateShell.module.css` és `ProjectListClient.module.css` fájlokban vannak. A paletta türkiz–petrol–zsályás-türkiz; neon lime a Projektkapu felületén nem használható.

## 2026-08-02 – Projektkapu hibrid shell architektúra

A Projektkapu saját, egyprojektes munkatér-shellt használ. Az elrendezés három logikai területből áll: összecsukható bal projektmenü, maximális középső munkaterület és összecsukható jobb projektkontextus-panel. A jobb panel desktopon grid-oszlop, 1260 px alatt fix drawer, mobilon pedig alapértelmezetten zárt. A panelállapotok `localStorage` kulcsokon keresztül felhasználói munkamenetek között megmaradnak. Ez a megoldás nem duplikálja a DIMPROVER teljes AppLayout motorját, és nem kényszeríti a Projektkaput állandó háromoszlopos nézetre.

## 2026-08-02 – Project Core repository és provider-határ

A Project Core üzleti API-k a `store.ts` façade-on keresztül repositoryt választanak. A `fileRepository.ts` a visszaállítható MVP adapter, a `databaseRepository.ts` a központi PostgreSQL adapter. A provider explicit környezeti változóval váltható. Supabase módban adatbázishiba esetén nincs automatikus file fallback, mert az kettős, eltérő hivatalos állapotot hozhatna létre. A séma és bootstrap állapot külön health szerződéssel ellenőrizhető.

## 2026-08-02 – Project Core hivatalos állapotforrás

A Projektkapu Project Core hivatalos állapotforrása a Supabase/PostgreSQL repository. A file-backed repository nem aktív adatforrás, kizárólag rollback adapter. A két provider között nincs automatikus fallback. Az aktív provider környezeti beállítása: `PROJECT_CORE_STORAGE_PROVIDER=supabase`.

## 2026-08-02 – Projektkapu DRIVE Core 0.3.0

A Projektkapu Dokumentumtár külön `drive-core` szerveroldali repository-rétegre épül, de a projektazonosítót, tagságot, jogosultságokat és auditot a Project Core-tól örökli. A webes Projektkapu és a későbbi Drive Desktop ugyanazt a mappa-, dokumentum-, verzió- és változáskurzor-modellt használja. A régi `/api/drive` fejlesztői előnézet elkülönítve megmarad, amíg a desktop kliens átállása be nem fejeződik. A 0.3.0 tárolási módja `METADATA_ONLY`; objektumírás nincs engedélyezve.

## Projektkapu DRIVE Object Storage 0.4.0

A DRIVE fájlbájt-tárolás külön, opcionális réteg a stabil DRIVE Core 0.3.0 fölött. A két réteg külön health állapotot használ, így a tárhely-séma vagy az S3-konfiguráció hiánya nem tiltja le a projektmappákat, metaadatokat, auditot vagy szinkronkurzort.

A kliens nem kap tartós tárhelykulcsot. A szerver Project Core jogosultság után rövid életű, egy objektumra szóló signed PUT/GET URL-t készít. A végleges dokumentum- és verziórekord csak a tárhelyobjektum szerveroldali HEAD ellenőrzése után, atomikus PostgreSQL-függvényben jön létre.

## Project Calendar Core

A projekt-naptár közös engine, nem külön D6 főmodul. Elsődleges felülete a DOCK. A DIALOG, DECIDE, DIARY és DRIVE modulok saját entitásaikhoz kapcsolt naptáreseményt hozhatnak létre a közös `project_calendar_events` táblában. A személyes `/naptar` felület később összesített, felhasználóhoz rendelt projekt-eseményeket olvashat, de a hivatalos projektadat a Project Calendar Core marad.

## DIALOG Communication Core 0.6.0

A DIALOG a Project Core projektazonosítójára és szerepköreire épülő egyeztetési motor. A témakártyák projektenként sorszámozottak, hozzászólásfolyamuk külön táblában tárolódik. A válaszadási határidő ugyanabban az adatbázis-tranzakcióban hoz létre vagy frissít `source_module = DIALOG` Project Calendar eseményt. A lezárás, megoldás és visszavonás a kapcsolódó naptáresemény állapotát is szinkronizálja.

## DECIDE Workflow Core 0.7.0

A DECIDE a Project Core szerepkörökre és egy további adatbázis-szintű kijelölt-jóváhagyó ellenőrzésre épül. A kérelmek több, egymás után aktiválódó jóváhagyási szakaszt tartalmaznak. Egy szakasz `ALL` módban minden kijelölt válaszát, `ANY` módban legalább egy jóváhagyást igényel. A workflow-válasz, a következő szakasz aktiválása, a kérelem végállapota, a Project Calendar esemény és a projekt-audit egyetlen PostgreSQL-tranzakcióban frissül.

## DIARY Project Log Core 0.8.0

A DIARY a Project Core jogosultságokra, napi projekt–dátum egyediségre, optimista verzióvédelemre, központi auditnaplóra és Project Calendar eseményekre épül. A napi napló és események minden módosítása atomikus PostgreSQL-függvényen keresztül történik. A modul nem hivatalos e-építési napló, hanem projekt-előkészítő és nyomon követő munkatér.

## DRIVE Private S3 Activation 0.8.1

A DRIVE valós objektumtárhelyének aktiválása külön privát S3-kompatibilis bucketre épül. A credential kizárólag szerveroldali `.env.local` fájlban tárolható. Az aktiválás sorrendje: `disabled` konfiguráció → bucket preflight → CORS → `quarantine` mód → signed PUT → HEAD/méretellenőrzés → atomikus véglegesítés → review → cleanup → csak ezután `active` letöltési mód. A DROP tárhelyét és kulcsait tilos újrahasználni.

## DROP Private S3 Storage Core 0.4.0

A DROP külön privát S3-kompatibilis tárhelyet és külön credentialt használ; a DRIVE bucketje és access keye runtime szinten tiltott. A böngésző partonként rövid életű signed PUT URL-t kap, közvetlenül a bucketbe tölt, majd a szerver `ListParts`, ETag, part SHA-256 és méret alapján rögzíti a részt. A véglegesítés `CompleteMultipartUpload` és `HEAD` után `PART_MANIFEST_SHA256` integritástípussal karanténba helyezi a fájlt. A multipart abort és objektumtörlés tartós, újrapróbálható cleanup-sorra épül. A helyi privát adapter rollbackként megmarad; nyilvános letöltés vírusellenőrző nélkül nem engedélyezhető.

## DROP Malware Scan és biztonságos build/deploy szabály

A DROP 0.5.0 ClamAV `INSTREAM` workerrel vizsgálja a privát S3 quarantine objektumokat. A worker csak localhost hostról és külön worker secrettel érhető el. A clean eredmény teljes fájl SHA-256 értéket és `ready` biztonsági állapotot hoz létre; fertőzésnél az objektum tartós cleanup-soron keresztül törlődik. Letöltési URL csak clean + ready fájlhoz adható, token- és csomaglejárathoz korlátozott idővel. Lejárati fizikai törlés csak sikeresen kiküldött végleges PDF-riport után engedélyezett.

Futó PM2 mellett az éles `.next` könyvtárba buildelni tilos. A build elkülönített dist/release könyvtárban készül, candidate teszteken megy át, majd teljes könyvtár atomikus cseréjével és azonnali PM2 restarttal kerül élesítésre. A korábbi build kötelező rollbackpont.

### DROP 0.5.0 végleges release-üzem

A végleges éles release a `.next-v050-release-final` könyvtárból, a `.dimprover/active-next-release` pointer alapján indul. Az aktív build `MytO_BxO69Vg1bSK-VX99`. A DROP storage mód `active`, a ClamAV és a kétpercenkénti systemd worker aktív. A release pointeres indítás biztosítja, hogy a futó release könyvtára új build közben ne változzon; rollbackhez az előző release pointere és az aktiválás előtti környezeti mentés áll rendelkezésre.

## 2026-08-08 – Projektkapu Workspace shell: fix rail + lebegő projektboard

A Projektkapu korábbi összecsukható, munkateret átméretező bal sidebar modellje megszűnt. Az új shell két külön navigációs réteget használ: 58 px fix navy rail és ebből nyíló 226 px `position: fixed` projekt/modul board. A második board overlayként lebeg a munkatér fölött, ezért sem nyitáskor, sem záráskor nem módosítja a központi workspace geometriáját. A központi munkatér csak a fix raillel számol. Mobilon 900 px alatt a rail/board helyett alsó D6 navigáció működik.

A Projektkapu vizuális alapja a közös DIMPRO enterprise tokenrendszer: `#06182c`, `#092641`, `#1167ee`, `#edf3f8`, `#f7fafc`, `#ffffff`, `#dce6ef`, `#64748b`, `#13233a`. Az általános türkiz/zöld Projektkapu brand-háttér megszűnt; zöld kizárólag státusz/siker jelentéssel használható. A modulok identitása kis ikon-, badge- vagy aktívvonal-akcentussal marad meg.

A D6 gyors modulváltás shell-szintű szolgáltatás: `Ctrl+Alt+M` nyitja a palettát; Tab/Shift+Tab és nyilak választanak, Enter nyit, Esc zár, 1–6 közvetlenül választ modult. A modulregistry továbbra is az egyetlen modulnév/útvonal adatforrás.

### BENJADMIN Developer Grid v0.1.31 – Supabase DEV / PROD monitoring
A System Health külön DEV és PROD analytics adatforrást kezel. A meglévő scoped token megmarad; a PROD project ref külön admin-megerősített, analytics-only validált konfiguráció. Minden projekt saját státuszt és cache-elt request-metrikát kap, a hiányzó érték nem nulla. A forgalmi időszak a Management API alapértelmezése, nem teljes billing-ciklus. Szervezeti egress nem osztható fel automatikusan és nem számítható request-darabszámból. A kód kizárólag DEV-ben fut; PROD adatbázis- vagy alkalmazásmódosítást nem végez. A v0.1.30 kiadás változatlanul visszaállítási pont.

### BENJADMIN Developer Grid v0.1.32 – Protected VPS telemetry

A korábbi augusztus 11-i erőforrásminta történeti adat, nem LIVE mérés. A DEV oldali védett telemetria regisztrációja admin-jóváhagyott, node-hoz és megbízható forrás-IP-hez kötött, 10 percig érvényes egyszeri kódot használ. A szerver csak a kód SHA-256 lenyomatát tárolja, a külön node-kulcs 0600 jogosultságú, meglévő kulcs nem íródik felül. Az adatfogadó a node-kulcsot és a forráscímet is ellenőrzi. A két VPS csak helyi /proc és statvfs rendszeradatokat küld HTTPS-en a DEV-be. Nincs távoli parancscsatorna, alkalmazás-deploy vagy adatbázis-írás. A kezdeti, jóváhagyott telepítés root jogosultságot igényel, a periodikus szolgáltatás DynamicUser és systemd LoadCredential használatával, jogosultságok és írási hozzáférés nélkül fut. A timer csak az első sikeres mintavétel után aktiválódik. A hiányzó vagy lejárt minta nem LIVE. A telepítéshez a védett gép tényleges, ellenőrzött konzolhozzáférése szükséges; a DEV forrás tesztelése nem bizonyítja a PROD/DB telepítését.

### BENJADMIN Developer Grid v0.1.33 – Central Core Conversation Memory és végrehajtható 6-stage workflow

A Developer Grid fejlesztési folytonossága három fizikailag és logikailag külön rétegre épül. A Fekete doboz (`RAW_CHAT_TRANSCRIPT_V1`) a taskhoz rögzített ChatGPT `/c/...` beszélgetés nyers, append-only delta naplója; minden új állapot teljes snapshot-hashsel és előző lánchashsel kapcsolódik. A nyers réteg nem promptforrás. A `BENJADMIN_CONTEXT_SNAPSHOT_V1` ebből és a Diagnostic Evidence Engine-ből készített sanitizált állapot: task, worker, projekt/modul, stage, branch/worktree/HEAD, utolsó releváns kontextus, blokkolók és következő fázis. A `BENJADMIN_HANDOFF_PACK_V1` a lezárási bizonyítékokból készül, és 6/6 + current-HEAD PASS build + PASS teszt + blockermentesség esetén kanonikus Development Handoffot hoz létre.

A Central Core work-start a DevCenter engine taskot nem csak routolja, hanem valódi worker sessiont indít. A ChatGPT conversation binding `HANDED_OFF`, a validált BOOT ACK `RUNNING` bridge-állapotot szinkronizál. A hat fázis közül 1→2, 2→3 és 3→4 gépi `BENJADMIN_STAGE_REPORT_V1` evidence alapján léphet. A 3→4 átmenet PASS TEST evidence-et követel és a DevCenter taskot TESTING állapotba viszi. A 4→5 kizárólag V.Guard PASS/PASS_WITH_NOTES, az 5→6 kizárólag BUILD01/BUILD02 FULL BUILD PASS után engedélyezett. A 6/6 Closure Gate után a DevCenter task és a Grid session is lezáródik. Stage-regresszió, stage-skip, worker-oldali 4→6 átmenet, DEV-host FULL BUILD fallback és PROD művelet fail-closed.

A desktop 8 másodperces memory monitorja kizárólag az authoritative taskhoz kötött, aktuálisan megnyitott beszélgetést vizsgálja; generálás közben nem ment és változatlan transcriptet nem ír újra. A tároló alapútvonala `/srv/dimpro-dev/coordination/developer-grid/conversation-memory`, könyvtári módja 0700, fájljai 0600. A következő azonos projekt/modul task csak a sanitizált Context Snapshotot/handoffot kapja folytatási kontextusként. A Central Core külön `BLACK BOX`, `CONTEXT`, `HANDOFF` státuszt és stale authoritative-state jelzést mutat.


### v0.1.33 canonical source baseline
A Developer Grid foundation alapértelmezett authoritative forrása a `feature/benjadmin-developer-grid-v013-outminai-20260905` branch és a `/srv/dimpro-dev/worktrees/benjadmin-developer-grid-v013-outminai-20260905` worktree. A régi 2026-08-27 foundation worktree csak történeti forrás; új Central Core task nem indulhat róla. Környezeti override továbbra is lehetséges, de source provenance ellenőrzés fail-closed.

### BENJADMIN Developer Grid v0.1.34 – Central Core routing recovery és kártyanavigáció

- A Central Core explicit worker routing előtt csak a kijelölt worker történeti sessionjeit vizsgálja. Automatikusan kizárólag olyan nem lezárt session szabadítható fel, amelynél a session heartbeat, a session frissítése és a kapcsolt task frissítése is legalább 72 órája elavult.
- A stale session felszabadítása a meglévő atomikus session-release RPC-n keresztül történik, auditbejegyzéssel és `requeueTask=false` szabállyal. A történeti task nem minősül automatikusan késznek és nem kerül újra végrehajtási sorba.
- Egy korábban `PREFERRED_BUSY` miatt `queued` állapotban maradt, azonos idempotencyKey-jű Central Core task új munkaindításkor újra routolható; explicit worker és STRICT/no-fallback szabály változatlan.
- A Central Core fejléc alatti sticky kártyanavigáció: MUNKA, MEMÓRIA, EVIDENCE, BUILD, CONTEXT, ÁTADÁSOK.
- A munkaindítás success/waiting/error visszajelzése közvetlenül a munkaindító kártyában jelenik meg, ezért nem szükséges a panel aljára görgetni a hiba megértéséhez.

### BENJADMIN Developer Grid v0.1.35 – state mutation lock recovery

A Central Core authoritative state/event store továbbra is cross-process `mutation.lock` sorosítást használ. A v0.1.35 a megszakadt folyamatból hátramaradt lockokhoz fail-safe recoveryt ad: 30 másodpercnél frissebb lockhoz nem nyúl; régi locknál PID és Linux process-start identity alapján ellenőrzi a tulajdonost. Élő vagy bizonytalan tulajdonos esetén a lock védett marad. Csak bizonyítottan halott, PID-reuse-os vagy régi sérült lock távolítható el. DEV ONLY · PROD DENY.

