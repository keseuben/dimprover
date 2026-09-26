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
- package és sender metadata elkülönül sessionenként.

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

## 4. Még szükséges kézi pilot acceptance

A következő pontok nem blokkálják a backend E2E-t, de valós felhasználói pilot előtt böngészőből ellenőrizendők:

1. DRIVE-ban a Beérkező Drop dokumentum review gombjai és státuszcímkéi vizuálisan megfelelőek-e.
2. `KIADOTT` dokumentumnál a Link ikon megjelenik-e, és a címzetti linkpanel jól használható-e.
3. Link másolás mobilon és desktopon.
4. PROJECT_MANAGER / REVIEWER / CONTRIBUTOR / VIEWER szerepkörök UI-szintű jogosultsági acceptance.
   - Automatikus backend/UI guard contract: PASS.
   - Jelenlegi policy szerint a REVIEWER rendelkezik `document.approve` joggal, ezért formális dokumentumkiadást is indíthat.
   - Valós multi-role pilot előtt üzleti döntés szükséges arról, hogy a `KIADOTT` művelet maradjon-e minden approver számára elérhető, vagy csak OWNER / PROJECT_MANAGER adhasson ki dokumentumot.
5. Valós projektből 1 PDF + 1 kép + 1 tipikus szakági fájl feltöltése.
6. Lejáró Beküldőkapu vizuális üzenete.
7. Címzetti link lejárati / inaktív kiadási hibaoldal UX: PASS. A publikus `/kiadas` oldal hibás, lejárt és nem aktív kiadásnál emberi magyar üzenetet ad; a projekt többi része továbbra is login-védett.

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

A következő fejlesztési munka elsődlegesen UX- és szerepkör-acceptance, nem alap backend hiány.
