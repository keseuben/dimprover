# DIMPRO Projektkapu DROP / DRIVE Pilot Readiness V0.1.0

Dátum: 2026-09-26
Környezet: DEV ONLY
PROD access: DENY
Pilot projekt: D6 Irodaépület (`d6-irodaepulet`)

## 1. Pilot cél

A Projektkapu dokumentumforgalmi pilot célfolyamata:

külső Beküldőkapu → DROP → S3 karantén → ClamAV → finalize → DRIVE / Beérkező Drop → DRIVE ellenőrzés → ERVENYES → formális KIADOTT → kontrollált címzetti letöltés.

## 2. Runtime E2E-vel bizonyított pontok

### Projektkapu belépés és projektkörnyezet

PASS:
- külön `projektkapu.dev.dimpro.hu` DEV belépő;
- ideiglenes 6 számjegyű code-auth;
- Project Core jogosultsági bridge;
- D6 Irodaépület megjelenik OWNER jogosultsággal;
- külön candidate runtime: `127.0.0.1:3299`;
- PROD routing nem változott.

### Beküldőkapu

PASS:
- projektből Beküldőkapu létrehozás;
- aktív gate;
- publikus URL kizárólag `https://drop.dev.dimpro.hu`;
- ugyanaz az aktív kapulink több külön publikus sessionből használható;
- package és sender metadata elkülönül sessionenként;
- runtime újrafelhasználhatóság bizonyított: ugyanazon `project-7a50edfcae` gate-en külön finalize-lock, scan-trigger, PDF és DXF csomag jött létre, miközben a gate továbbra is `active`;
- a projekt Beküldőkapu tehát nem egyszer használatos link.

### Fájlfeltöltés

PASS:
- S3-compatible multipart upload;
- SHA-256 és ETag part confirm;
- upload complete;
- upload-session secret;
- robotvédelmi minimum várakozás;
- PDF feltöltés runtime bizonyítva;
- JPG feltöltési út korábban létrehozta a fájlrekordokat;
- UI mixed módban dokumentum/fájl-központú, nem kényszerített camera/image mode.

PDF E2E:
- package: `36e8b89b-0f90-4c49-afbd-a4282bd2fe5a`;
- file: `fe1a41b1-9784-4f32-8f61-129ec055be66`;
- filename: `D6_PDF_DROP_DRIVE_E2E_20260926T093816Z.pdf`;
- MIME: `application/pdf`;
- SHA-256: `043b4f863ed0a3ff11dee2f37f8a2946f0345962d0f46f13af292b5064e0a158`;
- finalize: első próbálkozás 425, második 200;
- DRIVE import: completed.

### Malware scan

PASS:
- ClamAV 1.5.4;
- 2 perces fallback systemd timer aktív;
- immediate scan systemd path-trigger aktív;
- candidate runtime explicit trigger path:
  `/srv/dimpro-dev/runtime/drop-worker-trigger`;
- upload complete után az immediate worker ténylegesen elindult;
- runtime scan acceptance: 2.637 s a file-created → scan-complete idő;
- fallback timer a mérés közben nem kellett.

### Finalize retry-lock

PASS:
- scan-pending finalize claim azonnal felszabadul;
- első azonnali finalize: 425 `DROP_PUBLIC_FILES_NOT_READY`;
- második azonnali finalize: 425 `DROP_PUBLIC_FILES_NOT_READY`;
- további 15 retry során 0 db `DROP_PUBLIC_FINALIZE_IN_PROGRESS`;
- scan clean után ugyanazon package finalize: HTTP 200;
- DRIVE incoming: completed.

### DROP → DRIVE incoming

PASS:
- DEV migration: `drive-drop-incoming-source-v010-20260926`;
- upload source constraint: WEB / DESKTOP / DROP / SYSTEM;
- DB authoritative import;
- folder: `Beérkező Drop`;
- source: `DROP`;
- source_channel: `DROP`;
- DROP package provenance tárolva;
- business status: `ELLENORZES_ALATT`;
- review decision: `PENDING`;
- technical version: `QUARANTINED`.

PDF DB acceptance:
- document: `drive-document-566020896b22`;
- version: `drive-version-38eab51788cd`;
- folder: `Beérkező Drop`;
- source: `DROP`;
- MIME: `application/pdf`;
- business: `ELLENORZES_ALATT`;
- review: `PENDING`.

### DRIVE review → ERVENYES

PASS szintetikus DEV dokumentumon:
- S3 objektum visszaolvasás;
- SHA-256 egyezés;
- DRIVE ClamAV CLEAN evidence;
- technical transition: QUARANTINED → AVAILABLE;
- business transition: ELLENORZES_ALATT / PENDING → ERVENYES / APPROVED;
- reviewer: `dev-web-user`;
- audit: MARKED_VALID + VERSION_APPROVED.

### Formális KIADOTT

PASS:
- külön issue RPC;
- csak AVAILABLE + ERVENYES + APPROVED állapotból;
- legalább egy címzett kötelező;
- issue number: `KIA-00001`;
- issue status: `ISSUED`;
- business status: `KIADOTT`;
- recipient rekordok külön táblában;
- audit: VERSION_ISSUED.

### Kontrollált címzetti letöltés

PASS:
- HMAC-aláírt, lejáratos recipient token;
- purpose-separated signing key;
- aktív ISSUED issue ellenőrzés;
- KIADOTT/ISSUED governance ellenőrzés;
- AVAILABLE S3 verzió ellenőrzés;
- friss rövid életű S3 signed URL;
- valid token → final HTTP 200;
- invalid token → HTTP 401;
- letöltött SHA-256 megegyezik a DRIVE verzió hashével;
- `downloaded_at` rögzítve;
- Project Core audit: `DRIVE_DOCUMENT_ISSUE_RECIPIENT_DOWNLOADED`;
- már kiadott dokumentumhoz permission-guarded link-regeneráló API készült;
- DRIVE UI Link ikon és másolható recipient-link panel elkészült.

## 3. Automatikus / contract ellenőrzések

PASS:
- Projectkapu DEV auth contract;
- candidate staging contract;
- DROP multipart / public workflow regressziók;
- DROP finalize retry contract;
- DROP immediate scan-trigger contract;
- DRIVE core contract;
- DRIVE object storage contract;
- DRIVE document flow contract;
- DRIVE issue-access contract;
- Projektkapu DRIVE role-matrix contract: 14/14 PASS;
- full Next compile;
- full TypeScript;
- route generation;
- standalone build;
- `git diff --check`.

## 4. Pilot UI acceptance

Headless Chromium/Puppeteer böngészős acceptance a tényleges DEV felületen:

1. DRIVE / Beérkező Drop review műveletek: **PASS action-level**.
   - bejelentkezés a külön Projektkapu loginon: PASS;
   - D6 Irodaépület → DRIVE betöltés: PASS;
   - `D6_PDF_DROP_DRIVE_E2E_20260926T093816Z.pdf` látható: PASS;
   - `Beérkező Drop` látható: PASS;
   - a PDF mellett a `vírusellenőrzése`, `jóváhagyása`, `elutasítása` műveleti gombok ténylegesen megjelentek.
   - A business státuszkódokat a UI nem nyers `ELLENORZES_ALATT/PENDING` szövegként jeleníti meg; a mélyebb DOM státuszszöveg-ellenőrzést a platform biztonsági rétege blokkolta, ezért ezt nem kerülgettük.
2. `KIADOTT` dokumentum Link ikon + címzetti panel: **PASS**.
   - a kiadott E2E dokumentum látható;
   - `kiadási linkjei` művelet megjelent;
   - kattintás után a `data-drive-issue-access="0.1.0"` panel megjelent;
   - 1 címzett, 1 kiadási link, 1 `Link másolása` gomb;
   - technikai browser error nem jelent meg.
3. Link másolás: desktop UI gomb jelenléte PASS; tényleges clipboard-write és mobil acceptance még nyitott.
4. Projekt szerepkörök és jogosultságok:
   - végleges magyar UI-nevek: `OWNER` → **Beruházási projektvezető**, `PROJECT_MANAGER` → **Projektvezető**, `REVIEWER` → **Ellenőrző**, `CONTRIBUTOR` → **Közreműködő**, `VIEWER` → **Megtekintő**;
   - a belső technikai kódok csak API/adatmodell azonosítóként maradnak meg;
   - automatikus magyar role-label contract: 8/8 PASS;
   - automatikus backend/UI guard contract: 14/14 PASS;
   - élő multi-role böngészős acceptance még nyitott;
   - **végleges jogosultsági döntés:** REVIEWER ellenőrizhet, jóváhagyhat és elutasíthat, de formális dokumentumkiadást nem indíthat;
   - új külön permission: `document.issue`;
   - `document.issue` kizárólag OWNER és PROJECT_MANAGER szerepkörhöz tartozik;
   - formális `KIADOTT` művelet és a kiadási címzetti linkek újragenerálása `document.issue` jogosultságot igényel;
   - CONTRIBUTOR továbbra is read/write, VIEWER read-only.
5. Projektfájl acceptance: szintetikus PDF runtime PASS, képfolyamat korábban tesztelve, valamint szakági DXF runtime E2E PASS (`application/dxf` → S3 → ClamAV → DRIVE / Beérkező Drop). Valós céges fájl pilot-próba még javasolt, de a fájltípus-folyamat technikailag bizonyított.
6. Lejáró Beküldőkapu vizuális üzenete még nyitott.
7. Címzetti link lejárati / inaktív kiadási hibaoldal UX: **PASS**. A publikus `/kiadas` oldal hibás, lejárt és nem aktív kiadásnál emberi magyar üzenetet ad; a projekt többi része továbbra is login-védett.

## 4/A. DEV tárhely – pilot operációs blokk

2026-09-26 tárhelynyomáskor mért állapot:
- filesystem: 118 GiB;
- használt: kb. 107 GiB;
- szabad: kb. 4,6 GiB;
- kihasználtság: 96%;
- canonical `preBuildHardMinFreeGiB`: 15 GiB;
- target free: 30 GiB.

Ebben az állapotban új full build nem indulhatott.

OutminAI tárhelyrendezése utáni aktuális állapot:
- használt: kb. 94 GiB;
- szabad: kb. 18 GiB;
- kihasználtság: kb. 85%;
- a 15 GiB-os pre-build hard minimum teljesül;
- a Projektkapu full candidate build sikeresen lefutott;
- build ID: `xGKy6L_yn5eWkUNrkwS-d`;
- buildelt source commit: `86e9a96bcad79eaad0fc200940574985df7629d4`.

Read-only / dry-run audit:
- Projektkapu candidate root teljes méret: kb. 8,0 GiB;
- candidate `.next` build outputok összesen: kb. 5,574 GiB;
- approved V2 retention worktree dry-run: 0 build candidate, 0 dependency candidate, 34 build védett;
- backups/artifacts/worktrees automatikus törlése tiltott;
- candidate retention inventory: 12 build;
- current runtime: 1 PROTECTED;
- rollback candidate: 1 PROTECTED;
- 6 régi teljes build: `PROVEN_REGENERABLE_PENDING_APPROVAL`;
- 4 candidate: `UNKNOWN_DENY`;
- külön dry-run candidate guard potenciális visszanyerése: 3,713 GiB;
- `--apply` szándékosan nincs implementálva és RC=77 DENY.

A Safe Delete skill és directive SHA-256 ellenőrzése PASS. A BenjaminAI által készített candidate-retention guard dry-run-only maradt; abból törlés nem történt. A tényleges DEV tárhelyrendezést OutminAI kezelte külön approved cleanup workflow-val.

## 5. Tudatosan későbbre hagyott elemek

Nem része az első céges pilot minimális indulásának:
- PROD rollout;
- automatikus e-mail kézbesítés (DEV-ben továbbra is tiltott);
- teljes Drive Desktop sync;
- AI dokumentumelemzés;
- CAD/BIM mélyfeldolgozás;
- komplex többkörös jóváhagyás;
- issue withdrawal / supersede részletes üzleti UI, amíg a végleges üzleti szabály nincs rögzítve;
- systemd worker source-worktree refaktor, mert a jelenlegi stabil worker runtime kompatibilitása bizonyított.

## 6. Jelenlegi pilot következtetés

A fő dokumentumforgalmi backend lánc DEV környezetben teljes E2E-vel működik:

Beküldőkapu → DROP → S3 → azonnali ClamAV → DRIVE Beérkező Drop → ellenőrzés → ERVENYES → KIADOTT → kontrollált letöltés.

A fő backend és az elsődleges DRIVE UI műveletek pilot szinten működnek. A magyar szerepkör-nevek és a külön `document.issue` jogosultság már a publikus DEV candidate-ben aktív. A következő fejlesztési munka elsődlegesen a maradék multi-role/mobil és lejáró Beküldőkapu UI acceptance.
