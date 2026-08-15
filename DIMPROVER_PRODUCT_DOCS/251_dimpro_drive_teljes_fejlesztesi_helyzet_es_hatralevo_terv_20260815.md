# DIMPRO Drive – teljes fejlesztési helyzet és hátralévő fejlesztési terv

Dátum: 2026-08-15
Cél: tartós folytatási dokumentum a DIMPRO Drive web / Projektkapu Drive / Drop kapcsolathoz
Állapot: DEV fejlesztési baseline

## 1. Rövid vezetői összefoglaló

A DIMPRO Drive technikai magja már jelentősen előrehaladott. A privát object storage, Drive metadata, mappák, dokumentumverziók, signed upload/download, SHA-256 ellenőrzés, vírus-/karantén workflow, preview, Compare és HJ-kapcsolatok működnek és több körben valós DEV E2E tesztet kaptak.

A jelenlegi legfontosabb hiány nem egy új tárhelymotor, hanem az eddig elkészült komponensek teljes felhasználói workflow-vá összekötése.

A kívánt első teljes használati lánc:

`Saját DIMPRO Drive / projekt létrehozása`
→ `automatikus Drive provisioning`
→ `mappák létrehozása`
→ `normál vagy drag & drop fájlfeltöltés`
→ `Gyors KépSend / Drop projekt kiválasztása`
→ `ideiglenes Drop staging`
→ `vírusvizsgálat + képoptimalizálás`
→ `tartós projekt Drive archiválás`
→ `Beérkező Drop mappában azonnal látható fájl`
→ `Drop staging később biztonságosan törölhető`

Ez a lánc **még nincs végponttól végpontig kész és aktiválva**, de az elemeinek nagy része már létezik.

Becsült készültség a konkrét, most kért használati workflow szempontjából: **kb. 65–70%**.

Ez nem azt jelenti, hogy a teljes jövőbeli DIMPRO Drive termék 70%-os; a SmartSync, teljes Desktop kliens, megosztás, offline szinkron, konfliktuskezelés és további enterprise funkciók külön fejlesztési rétegek.

## 2. Termékhatárok – maradjon változatlan

A jelenlegi termékstruktúrát meg kell tartani:

### DIMPRO Drive web

Projektalapú webes fájltér és tartós műszaki dokumentumtár.

Fő feladat:

- projektmappák;
- dokumentumok;
- verziók;
- feltöltés/letöltés;
- preview;
- jogosultság;
- audit;
- Drop projektbeérkezés;
- webes Commander;
- Compare;
- közös Drive motor más DIMPRO modulok számára.

### DIMPRO Drive Desktop

Külön asztali kliens.

Feladata:

- helyi fájlkapcsolat;
- kézi feltöltés/letöltés;
- egyszerű fájlkezelő;
- később szinkron.

A teljes SmartSync / háttérben futó valós idejű szinkron **nem része a mostani webes MVP lezárásának és jelenleg nincs aktiválva**.

### DIMPRO Fájlműhely

Külön előfizetéses mérnöki asztali termék. Nem szabad összemosni a Drive Desktoppal.

A Fájlműhely speciális mérnöki modulokat tartalmazhat, míg a Drive Desktop elsődlegesen tárhely- és fájlkapcsolati kliens.

## 3. Jelenlegi Drive Core – mi van már kész

### 3.1. Project Core

Működik:

- `POST /api/projects` projektlétrehozás;
- projekt név/kód/leírás/fázis/időadatok;
- projekt létrehozója automatikusan `OWNER`;
- projektlista jogosultság alapján;
- projekt tagságok és permission engine;
- audit.

Fontos jelenlegi hiány:

**a projekt létrehozása nem indít automatikus Drive provisioning workflow-t.**

A projekt tehát létrejön, de a Drive alapmappák inicializálása ma külön admin bootstrap útvonalon történik.

### 3.2. Drive projekt bootstrap

Már létezik:

`bootstrapDriveProject(projectId, actorUserId)`

és az RPC:

`drive_core_bootstrap_project`

Jelenlegi admin endpoint:

`POST /api/projects/admin/bootstrap-drive-core`

Ez képes Drive alapmappákat létrehozni a projektekhez.

Hiány:

- automatikus meghívás új projekt létrehozása után;
- felhasználóbarát idempotens provisioning státusz;
- hiba esetén retry;
- Identity Core projekttel való egyidejű összekötés.

### 3.3. Drive adatmodell és web API

Már működő fő elemek:

- mappafa;
- dokumentum metadata;
- dokumentumverziók;
- dokumentum mozgatás;
- note/metadata;
- QR;
- változásnapló;
- sync cursor;
- review;
- security scan;
- storage cleanup;
- Compare;
- Compare Findings;
- Project Issue / HJ kapcsolatok.

### 3.4. Privát object storage

DEV health alapján jelenleg:

- storage configured: igen;
- S3-compatible provider: aktív;
- real object write: aktív;
- Drive security: ready.

Működő feltöltési lánc:

`upload init`
→ `short-lived signed PUT`
→ `privát object storage`
→ `complete`
→ `szerveroldali méret/SHA-256`
→ `Drive document/version`
→ `security scan / quarantine`

A HJ V0.4/V0.5 valós E2E-ben ez a lánc többször sikeresen lefutott.

### 3.5. Drive preview és download

Működik:

- Drive preview;
- PDF preview;
- kép preview;
- rövid életű secure download URL;
- `document.read` permission;
- security policy.

2026-08-15 live V0.5 acceptance:

- PDF preview HTTP 200;
- secure download HTTP 200.

### 3.6. Vírus / quarantine / review

Működik:

- fájl security állapot;
- quarantine;
- scanner workflow;
- `REJECTED` fájl blokkolása;
- review/cleanup alapok.

A Project Issue attachment E2E bizonyította, hogy REJECTED tesztverzió nem kapcsolható HJ-hoz.

## 4. Webes Drive felület – jelenlegi állapot

### 4.1. Mappalétrehozás

**KÉSZ / MŰKÖDIK.**

A webes Drive toolbarban van `Új mappa` funkció.

A felhasználó a kiválasztott mappa alatt új almappát hozhat létre.

### 4.2. Normál fájlfeltöltés

**RÉSZBEN KÉSZ.**

Működik:

- `Feltöltés` gomb;
- fájlválasztó;
- selected target folder;
- signed PUT;
- object storage;
- complete;
- SHA/security lánc.

Jelenlegi korlát:

- egyszerre csak **1 fájl** kerül kiválasztásra és feltöltésre.

### 4.3. Külső drag & drop feltöltés

**HIÁNYZIK.**

A Drive-ban van drag & drop logika, de az jelenleg belső Drive dokumentumok mappák közötti mozgatására szolgál.

Nincs még:

- Windows Intézőből behúzott fájl;
- Desktopról behúzott fájl;
- `dataTransfer.files` alapú külső upload dropzone;
- több fájl egyidejű drop feltöltése.

### 4.4. Következő web upload V1.1 követelmény

Kötelező cél:

- `<input type=file multiple>`;
- 1–N fájl kijelölése;
- Windows/Desktop drag & drop;
- kiválasztott célmappa;
- feltöltési queue;
- fájlonkénti státusz;
- progress;
- siker / hiba;
- újrapróbálás;
- cancel, amennyiben upload session még megszakítható;
- teljes queue után Drive tree refresh;
- ugyanaz a signed upload/security motor, nincs külön bypass út.

Javasolt első limit:

- kliensoldali queue;
- 2–3 párhuzamos feltöltés;
- később konfigurálható concurrency.

### 4.5. Commander

Már működik:

- kétpaneles Commander;
- bal/jobb mappa;
- belső Drive dokumentum drag & drop mozgatás;
- mappák közötti áthelyezés.

A külső OS fájldropot ehhez is hozzá lehet adni, de az elsődleges dropzone a teljes Drive workspace legyen, hogy minden nézetben működjön.

## 5. Compare / Findings / HJ integráció

Jelentősen előrehaladott.

Működik:

- dokumentum Compare;
- Compare Findings;
- emberi gate után HJ létrehozás;
- központi Issue Core;
- terepi FIELD_CAPTURE HJ;
- fotó/terv Drive melléklet;
- központi HJ mellékletlista;
- HJ audit;
- Drive preview/download a HJ felületből.

Aktív HJ V0.5 build 2026-08-15:

`_WHElecnVqTN-ASeiQC-q`

## 6. DIMPRO Drop / Gyors KépSend – mi van már kész

A Drop kódbázis jelentősen fejlettebb, mint amit a jelenlegi runtime feature state mutat.

### 6.1. Kódban létező fő funkciók

- Drop package engine;
- access gate;
- spaces;
- package creation;
- storage core;
- quarantine upload;
- image/file/ZIP/mixed upload;
- comments;
- PDF final report;
- retention worker;
- Drive archive service;
- group folders;
- Send;
- Gyors KépSend;
- project code validation;
- Identity Core entitlement;
- mobile/PWA irány;
- offline queue alap;
- képcsoportok;
- képenkénti megjegyzés;
- voice note → szöveg irány.

### 6.2. Képoptimalizálás

**KÓDBAN KÉSZ / MŰKÖDŐ IMPLEMENTÁCIÓ.**

A `dropUploadPreparation.ts` kezeli többek között:

- kép átméretezést;
- JPEG/WebP újrakódolást;
- minőségprofilokat;
- HEIC → JPEG konverziót;
- image orientation kezelést;
- megtakarítás számítást;
- optimalizálási státuszt;
- optimalizált képnél EXIF/GPS metaadat eltávolítást.

A Gyors KépSend UI megjeleníti az optimalizálási eredményt és a megtakarított méretet.

### 6.3. Project Drop Identity Core

Már létezik:

- `dimpro_projects`;
- `public_project_code`;
- `legacy_project_core_id`;
- `project_drop_enabled`;
- `dimpro_project_drop_settings`;
- `drive_folder_id`;
- `incoming_folder_name`, default: `Beérkező Drop`;
- project code verification RPC;
- entitlement `can_use_project_drop`;
- célmappa és virus scan policy visszaadása.

Ez jó alap a Project Core és Drive összekapcsolásához.

### 6.4. Gyors KépSend projektellenőrzés

Már működő kód:

- központi projektkód megadása;
- entitlement ellenőrzés;
- projekt hozzáférés ellenőrzés;
- verified Identity project;
- `dimproProjectId`;
- `projectPublicCode`;
- `targetFolder` workflow metadata.

## 7. Drop → Drive tartós archiválás – mi van már kész

### 7.1. Archív motor

Már létezik:

`app/lib/drop/archive/dropDriveArchiveService.ts`

Funkciók:

- projektkapcsolat betöltése;
- `archive_to_drive` flag;
- Drive célmappa ellenőrzése;
- alap archívummappa létrehozása;
- csomagmappa létrehozása;
- csoportmappák;
- fájlok Drive-ba másolása;
- Drive upload session;
- idempotens `dropArchiveKey`;
- Drive document/version;
- végleges PDF-riport archiválás;
- audit események;
- archiválási state;
- retention deletion gate.

### 7.2. Fontos biztonsági szabály már elkészült

A Drop retention worker a szükséges Drive archívum elkészülte előtt nem törölheti a kötelező ideiglenes forrást.

Ez a kívánt staging/permanent modell alapja:

- Drop = ideiglenes/staging példány;
- Drive = tartós projektpéldány.

## 8. Mi hiányzik a konkrét „saját projekt + Gyors KépSend → tartós Drive” használathoz

### HIÁNY 1 – Automatikus projekt provisioning

Jelenleg:

`POST /api/projects`

létrehozza a Project Core projektet és OWNER tagságot.

Hiányzó új orchestration:

`create project`
→ `bootstrap Drive project`
→ `create Beérkező Drop folder`
→ `create/link Identity project`
→ `set legacy_project_core_id`
→ `set project_drop_enabled`
→ `create/update dimpro_project_drop_settings`
→ `set drive_folder_id`
→ `audit`

Minden lépés legyen idempotens és retry-képes.

### HIÁNY 2 – Saját DIMPRO Drive és Projektkapu Drive ownership különválasztás

A végleges modellben továbbra is külön kell kezelni:

- Saját felhasználói DIMPRO Drive;
- Projektkapu Drive.

A közös blob/object storage használható, de a reference/ownership/ACL/retention külön legyen.

A „magamnak nyitok tárhelyet” első pilotja legyen valódi **saját Drive tulajdonú projekt/workspace**, ne csak egy olyan megosztott projekt, amelyben véletlenül egyedül vagyok tag.

A Project Core `organization_id = null` technikailag használható kiindulásnak, de a végleges ownership típust explicit módon kell modellezni és tesztelni.

### HIÁNY 3 – `Beérkező Drop` Drive mappa automatikus létrehozása

Projekt provisioningkor automatikusan létre kell jönnie például:

`/Beérkező Drop`

vagy projektsablon szerint:

- `01_Tervek`
- `02_Jegyzőkönyvek`
- `03_Fotók`
- `04_Beérkező Drop`
- `05_Kiadások`

A pontos alapstruktúra később sablonozható.

A `dimpro_project_drop_settings.drive_folder_id` mindig valódi, aktív Drive folder ID legyen.

### HIÁNY 4 – Project Core ↔ Identity Core automatikus projektazonosság

A szükséges mező már létezik:

`dimpro_projects.legacy_project_core_id`

Hiányzik az automatikus provisioning/binding.

A publikus projektkód csak külső/beküldési azonosító legyen.

A tartós Drive művelethez mindig a belső Project Core ID-t kell feloldani.

### HIÁNY 5 – Gyors KépSend public workflow → Drive archive bridge

A Gyors KépSend már eltárolja a verified Identity projekt metadataját, de a tartós archiváló motor jelenlegi `drop_space_projects` / package projektkapcsolati modelljéhez nincs teljesen bekötve.

Megoldás:

- finalizált Send workflow-ból feloldani `dimproProjectId → legacy_project_core_id`;
- meghatározni a `drive_folder_id` célmappát;
- közös `DropDriveArchiveContext` készüljön Space és Public Send forráshoz is;
- ne legyen szükség mesterséges Drop Space rekordra egy egyszerű Gyors KépSend miatt;
- az archiváló core legyen közös, a source adapter legyen eltérő.

### HIÁNY 6 – Az archiválás időzítése

A jelenlegi worker elsősorban lifecycle/retention folyamatban biztosítja az archiválást.

A felhasználói célhoz gyorsabb viselkedés kell:

Gyors KépSend véglegesítés után:

1. feltöltés lezárva;
2. security scan PASS;
3. szükséges final report elkészült vagy a workflow szerint nem kötelező;
4. **archive job azonnal queue-ba**;
5. Drive tartós példány elkészül;
6. UI: „Tartósan mentve a projekt Drive-ba”.

A retention worker később csak biztonsági utóellenőrzésként garantálja, hogy staging törlés előtt az archívum biztosan kész.

### HIÁNY 7 – Drop feature gate DEV aktiválás

2026-08-15 aktív runtime state:

- Drop version: `DROP 1.2.12`
- stage: `shell`
- `releaseGateEnabled = false`
- `sendEnabled = false`
- `driveArchiveEnabled = false`
- `spacesEnabled = false`
- `storageCoreEnabled = false`
- `quarantineUploadEnabled = false`
- `imageDropEnabled = false`
- `pdfReportEnabled = false`

Tehát a kódréteg létezik, de a jelenlegi fő app runtime-ban a Drop release gate zárt.

Nem szabad egyszerre vakon minden flaget bekapcsolni.

Szükséges kontrollált DEV aktiválási sorrend külön preflighttal.

### HIÁNY 8 – Webes multi-upload + külső drag & drop

Következő Drive UI slice.

Kötelező acceptance:

- 1 fájl gombbal;
- 10 fájl fájlválasztóból;
- 10 fájl Windows Intézőből drag & drop;
- célmappa helyes;
- queue progress;
- részleges hiba kezelése;
- retry;
- Drive tree refresh;
- vírusos fájl nem válik AVAILABLE dokumentummá;
- sikeres fájlok tartósak.

## 9. Javasolt fejlesztési sorrend

### P1 – Project Drive Provisioning V1

Cél:

Új projekt után azonnal használható Drive legyen.

Feladat:

- user-accessible provisioning service;
- Drive bootstrap;
- default folder template;
- `Beérkező Drop` folder;
- provisioning state;
- retry/idempotency;
- audit;
- saját Drive vs Projektkapu ownership előkészítés.

E2E:

`Új projekt → Drive megnyitás → mappák azonnal látszanak`.

### P2 – Drive Web Upload UX V1.1

Cél:

Mindennapi fájlkezelés használható legyen.

Feladat:

- multi file input;
- external drag & drop;
- upload queue;
- progress;
- retry;
- cancel;
- target folder;
- refresh;
- Commander drop támogatás opcionális második körben.

E2E:

`10 vegyes fájl → drag & drop → 10 Drive dokumentum/verzió → security státusz`.

### P3 – Project Identity Bridge V1

Cél:

A Project Core projekt és a publikus Project Drop kód egyazon projektre mutasson.

Feladat:

- Identity project provisioning;
- `legacy_project_core_id` binding;
- public project code;
- membership/entitlement mapping;
- `dimpro_project_drop_settings`;
- Drive folder ID binding.

E2E:

`Project Core project → Identity public code → verify → ugyanaz a Project Core ID és Beérkező Drop folder`.

### P4 – Quick Image Send → Permanent Drive V1

Cél:

A telefonos képküldés automatikusan tartós projektfájl legyen.

Feladat:

- Public Send archive adapter;
- verified Identity project → Project Core ID;
- `drive_folder_id`;
- immediate archive job;
- idempotency;
- source metadata;
- image group folders opcionális megőrzése;
- archive status UI.

E2E:

`telefon → Gyors KépSend → 5 optimalizált fotó → vírusvizsgálat → 5 tartós Drive document + final report`.

### P5 – Drop DEV Activation Gate

Cél:

A már meglévő Drop motor kontrollált bekapcsolása.

Javasolt sorrend:

1. release gate DEV preflight;
2. storage core;
3. quarantine upload;
4. image/file upload;
5. PDF report;
6. Send;
7. project Drop;
8. Drive archive;
9. worker/lifecycle;
10. full E2E.

Minden lépés után fail-closed health és rollback.

### P6 – Pilot hardening

- mobil iOS/Android;
- Windows Chrome/Edge;
- nagyobb képcsomag;
- megszakadt hálózat;
- offline queue;
- többszörös submit/idempotency;
- lejáró staging;
- Drive archive már elkészült staging törlés előtt;
- jogosultságvesztés;
- saját Drive vs Projektkapu Drive életciklus.

## 10. Első teljes, felhasználó által kipróbálható acceptance scenario

A fejlesztési szakasz akkor tekinthető első használható pilotnak, ha az alábbi végigmegy:

1. Bejelentkezett felhasználó létrehoz egy új saját projektet: `Saját próba Drive`.
2. A projekt létrehozója OWNER.
3. Drive provisioning automatikusan lefut.
4. Megjelennek az alapmappák és a `Beérkező Drop`.
5. Új mappa kézzel létrehozható.
6. Egy PDF feltölthető a Feltöltés gombbal.
7. Tíz fájl egyszerre kijelölhető.
8. Tíz fájl Windowsból drag & droppal behúzható.
9. Feltöltési queue/progress látható.
10. A sikeres fájlok document/version rekordot kapnak.
11. Security scan lefut; fertőzött fájl nem válik használhatóvá.
12. Telefonon megnyílik a Gyors KépSend.
13. A felhasználó kiválasztja / megadja ugyanennek a projektnek a kódját.
14. Öt fotó készül vagy kerül kiválasztásra.
15. A képek optimalizálódnak.
16. A Drop staging feltöltés és scan lezárul.
17. Az archive job automatikusan elindul.
18. Az öt kép tartós Drive document/version formában megjelenik a `Beérkező Drop` mappában.
19. A Drop staging későbbi törlése nem törli a Drive példányokat.
20. A Drive-ban a képek preview/download útvonalon megnyithatók.
21. Auditból visszakereshető a projekt, Drop csomag, archív Drive dokumentum és műveleti idő.

## 11. Becsült fejlesztési idő a konkrét első pilotig

A meglévő kódmennyiség miatt nem nulláról indulunk.

Becsült aktív fejlesztési idő:

- P1 Project provisioning: 0,5–1,0 nap
- P2 multi-upload + drag & drop: 0,75–1,5 nap
- P3 Project/Identity bridge: 0,75–1,5 nap
- P4 Quick Image Send → Drive bridge: 1,0–2,0 nap
- P5 kontrollált DEV aktiválás + teljes E2E: 0,5–1,0 nap

**Első használható DEV pilot: kb. 3,5–7 aktív fejlesztési nap.**

Pilot hardening, mobil/netmegszakadás, további retry/UX és security regresszió: további kb. 1–3 nap.

Ez becslés; DB/Identity migrációs igény vagy új párhuzamos fejlesztési konfliktus növelheti.

## 12. Mi NEM szükséges az első pilothoz

Nem kell megvárni:

- teljes SmartSync;
- automatikus Windows háttérszinkron;
- teljes DIMPRO Fájlműhely;
- minden enterprise megosztási workflow;
- PROD aktiválás.

Az első cél egy stabil web + mobil Drop + tartós Drive projektworkflow DEV-en.

## 13. Következő konkrét fejlesztési lépés

A következő Jázmin Drive fejlesztési szelet ajánlott neve:

**DIMPRO Drive Project Provisioning + Web Upload V1.1**

Első commit scope:

1. `POST /api/projects` utáni idempotens Drive provisioning;
2. default `Beérkező Drop` folder;
3. provisioning state/API;
4. webes multi-file input;
5. external drag & drop upload queue;
6. progress/retry;
7. contract;
8. minimum 10 valós DEV acceptance példa.

Ezután külön slice:

**Project Identity + Quick Image Send Permanent Archive V1**.

## 14. Aktuális biztonsági szabályok

Továbbra is kötelező:

- csak DEV, amíg külön PROD release gate nincs;
- backup minden DB-migráció előtt;
- feature flag fail-closed;
- nincs általános SQL executor;
- object-storage credential server-only;
- Drive signed URL rövid életű;
- vírus/security státusz megkerülése tilos;
- Drop staging törlés csak szükséges final report és Drive archive után;
- saját DIMPRO Drive és Projektkapu Drive ownership/ACL külön kezelendő;
- SmartSync és Private Vault külön explicit fejlesztési döntésig OFF.

## 15. Jelenlegi rögzített runtime baseline

2026-08-15, a dokumentum készítésekor:

- aktív DEV pointer: `.next-benjadmin-v12-field-v250-unified`
- aktív build: `_WHElecnVqTN-ASeiQC-q`
- source: `afd9f70f9830f8c5b776126a922dc59272b98fbb`
- Project Issue Core: 0.4.0
- Drive private S3: configured / real object write enabled
- Drive security: ready
- Drop runtime: `DROP 1.2.12`, stage `shell`, release gate OFF
- PROD: érintetlen

A következő beszélgetés vagy fejlesztő ebből a dokumentumból biztonságosan folytathatja a Drive projekt-tárhely és Drop→Drive workflow lezárását.
