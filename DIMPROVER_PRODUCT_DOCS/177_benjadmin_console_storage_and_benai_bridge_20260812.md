# 177 — BENJADMIN Konzol: Hetzner tárhelymodell és Ben-AI végrehajtási híd

Dátum: 2026-08-12  
Környezet: DEV  
Kapcsolódó dokumentum: `176_benjadmin_developer_console_v1_20260812.md`

## 1. Cél

A Fejlesztői Konzol V1 napi használatú működésének következő két hardening blokkja:

1. a DIMPRO Drive / Drop Hetzner Object Storage kapacitásának valós, nem félrevezető megjelenítése;
2. a BENJADMIN beviteli utasítás és a B3 task/worker motor közötti Ben-AI koordinációs híd első, auditálható rétege.

PRODUCTION továbbra is read-only. Éles collector, restart, migráció vagy deploy nem történt.

## 2. HQ csapatavatar checkpoint

A Fejlesztési Tárból a következő kötelező segédanyag került feldolgozásra:

- resource ID: `devres-bbf18b64-5a7d-408a-8105-b73ad96d39d0`
- fájl: `01_BenjADMIN.zip`
- SHA-256: `0cfd37db903fcb27d42c19d08e94052047eeb67dae05e6c7d9e53ae13747e24d`
- 5/5 eredeti PNG: 1536×1024, alpha csatornával.

A biztonságos import pipeline dry-run után backupot készített, majd 768×512, alpha-kompatibilis, 94-es minőségű WebP asseteket állított elő. A Konzol browser acceptance a cserével 36/36 PASS volt.

Commit: `d98c1ef feat(benjadmin): upgrade team avatars from development resource`.

## 3. Hetzner Object Storage modell

A Drive és Drop konfigurált S3 endpointja Hetzner Object Storage (`*.your-objectstorage.com`). A szolgáltatói modell és a DIMPRO belső keret két külön fogalomként kezelendő.

### Szolgáltatói tények

- a Hetzner bázisdíja 1 TB tárolást tartalmaz account-szinten;
- ez közös szolgáltatói báziskeret, nem külön 1 TB Drive + 1 TB Drop bucket-kapacitás;
- a használat időarányosan TB-óra alapon számolódik;
- a báziskeret fölötti tárolás pay-as-you-go;
- egy bucket technikai felső korlátja 100 TB.

A fenti szolgáltatói adatokat 2026-08-12-én a Hetzner hivatalos Object Storage dokumentációja és termékoldala alapján ellenőriztük.

### DIMPRO hard keret

A meglévő változók változatlanul belső DIMPRO bucket-limitet jelentenek:

- `DIMPRO_DRIVE_S3_QUOTA_BYTES`
- `DIMPRO_DROP_S3_QUOTA_BYTES`

Ezek jelenleg nincsenek konfigurálva. Nem állítjuk őket automatikusan 1 TB-ra, mert az félrevezetően két külön 1 TB-os hard keretet mutatna.

### API modell

Az infrastruktúra összesítő új szolgáltatói mezői:

- `provider = HETZNER_OBJECT_STORAGE`
- `includedStorageBytes = 1_000_000_000_000`
- `bucketHardLimitBytes = 100_000_000_000_000`
- `includedScope = ACCOUNT_SHARED`
- `billingModel = BASE_PLUS_PAY_AS_YOU_GO`

A top-level `storageBilling` összesítés a Drive és Drop megfigyelt használatát közösen értelmezi az 1 TB account-báziskerethez.

A `capacityBytes` továbbra is kizárólag a DIMPRO saját hard bucket-kerete. Konfiguráció hiányában `null` marad.

### UI

A BENJADMIN Csapat / infrastruktúra kártyák és a Szerverközpont storage részletező külön mutatják:

- foglalt tárhely;
- DIMPRO hard keret;
- Hetzner 1 TB közös báziskeret;
- 100 TB bucket technikai limit;
- objektumszám;
- S3 kapcsolat állapota.

## 4. Ben-AI koordinációs híd

Új modul: `app/lib/dev-center/benai-dispatch.ts`.

A cél az, hogy a Konzolból küldött természetes nyelvű BENJADMIN utasítás már auditálhatóan továbbmenjen a task/worker lánc felé, miközben a rendszer nem állít olyan autonóm végrehajtást, amely még nincs bekötve.

### Bridge módok

- `MANUAL_CHATGPT_BRIDGE`
- `OPENAI_RESPONSES`

Alapértelmezés: `MANUAL_CHATGPT_BRIDGE`.

Az API mód csak akkor aktív, ha a később külön jóváhagyott szerveroldali provider-konfiguráció ténylegesen rendelkezésre áll. Titkot a böngésző nem kap.

### Executor állapot

A `DIMPRO_BENJADMIN_WORKER_EXECUTOR_URL` hiányában a Konzol explicit jelzi:

`Natív worker executor még nincs bekötve.`

Ez fontos fail-safe szabály: egy queued task vagy Ben-AI koordinátori bejegyzés nem jelenhet meg úgy, mintha a worker már ténylegesen kódolna.

### Dispatch szakaszok

- `CHAT_ONLY` — csak beszélgetési üzenet;
- `COORDINATOR_ROUTING` — Ben-AI feladatbontás / worker-választás szükséges;
- `EXECUTOR_NOT_CONFIGURED` — explicit worker kijelölve, de natív végrehajtó még nincs;
- `TASK_ASSIGNED` — a későbbi executor-bekötés után használható állapot.

### Címzettfeloldás

- `@Ármin-AI` → `worker_arminai`
- `@Jázmin-AI` → `worker_jazminai`
- `@Outmin-AI` → `worker_outminai`
- `@Ben-AI` / `@Mindenki` → Ben-AI koordinációs routing, automatikus worker-kitalálás nélkül.

A meglévő B3 / B3.2 izolációs ellenőrzések változatlanul érvényesek. Outmin-AI belső DIMPRO projektre továbbra sem rendelhető.

## 5. Konzol UX

A runtime context most láthatóan jelzi a híd állapotát:

- `AI HÍD · KÉZI`
- később konfigurált provider esetén `AI HÍD · API`.

BENJADMIN utasítás küldése után a Konzol azonnal megjeleníti a Ben-AI koordinátori választ ugyanabban a közös beszélgetési idővonalban.

Kézi híd esetén a Ben-AI koordinációs kártyához biztonságos `ChatGPT/MCP átadó másolása` gomb tartozik. A prompt tartalmazza a taskot, projektet, felelőst és a DEV-only fejlesztési kapukat, de nem tartalmaz titkot.

## 6. Miért nem indul még automatikusan worktree

A jelenlegi DIMPROVER monorepo egy fizikai repository (`repo_dimprover`). A fejlesztési projektek több logikai projektként szerepelnek, miközben a scope lock egy repository ID-n belül véd a konfliktusoktól.

Nem hozunk létre ugyanarra a fizikai Git repositoryra projektenként külön repository ID-kat, mert ezzel a scope lock konfliktusvédelem megkerülhető lenne.

A natív automatikus worker indítás előtt ezért következő architekturális hardening szükséges:

1. közös belső monorepo ↔ logikai projekt kötési modell;
2. egyetlen fizikai repository ID megtartása;
3. globális scope-lock konzisztencia;
4. trusted baseline/integration branch kijelölése az új worker worktree-khez;
5. allowlistelt worker executor;
6. ezután a teljes session handshake automatizálása:
   `SESSION_OPEN -> BENAI_ASSIGNED -> WORKER_BOUND -> TASK_BOUND -> BRANCH_BOUND -> WORKTREE_BOUND -> READY`.

## 7. Biztonság

- PROD read-only marad.
- Nincs automatikus PROD deploy / restart / migration.
- Kliensoldalra nem kerül OpenAI kulcs, service-role kulcs, SSH kulcs vagy más secret.
- A Ben-AI híd konfiguráció nélkül fail-safe kézi mód.
- Outmin-AI partner izoláció változatlan.
- A ChatGPT/MCP átadó DEV-only utasítást tartalmaz.

## 8. Acceptance terv

Kötelező:

- Ben-AI pure dispatch contract;
- valós Konzol POST → task + BENJADMIN worklog + Ben-AI worklog → cleanup;
- Fejlesztői Konzol teljes browser acceptance;
- Team/infrastructure storage acceptance;
- Server table-first storage acceptance;
- TypeScript;
- full lint;
- production build;
- koordinált DEV restart;
- smoke.


## 9. 2026-08-12 DEV acceptance eredmény

- Ben-AI pure dispatch contract: **13/13 PASS**.
- Konzol valós dispatch integráció: **8/8 PASS**; a fixture task és munkanapló a teszt végén törlésre került.
- Fejlesztői Konzol browser acceptance: **38/38 PASS**.
- BENJADMIN Csapat / infrastruktúra acceptance: **46/46 PASS**.
- Szerverközpont table-first acceptance: **21/21 PASS**.
- TypeScript: PASS.
- Full lint: **0 error / 104 meglévő warning**.
- Build: **`5orXg8lm8xXY-rqXCXcae`**.
- DEV PM2: online.
- PROD: nem módosult.

A natív worker executor továbbra sincs bekötve, ezért a Konzol ezt `AI HÍD · KÉZI` állapottal jelzi; autonóm kódfuttatást nem színlel.
