# OutminAI — DIMPRO Commerce Core M0/M1 fejlesztési állapot

**Dátum:** 2026-08-18  
**Környezet:** DEV only  
**Worker:** OUTMINAI  
**Branch:** `feature/outmin-commerce-core-m0-m1-20260818`  
**Worktree:** `/srv/dimpro-dev/worktrees/outmin-commerce-core-m0-m1`  
**Baseline:** `integration/benjadmin-dev` @ `b569221475334b6f461d2188a275882621f04672`  
**PROD:** DENY / nem módosult

## FEJLESZTÉSI ÁLLAPOT

**Modul:** Commerce Core M0 + M1 előkészítés

**Elkészült:**
- külön OutminAI branch/worktree és koordinációs lock;
- új `app/lib/commerce` domainhatár létrehozva a régi `app/lib/aruter` kód módosítása nélkül;
- közös Commerce context/permission típusok;
- DecimalString alapú mennyiségi segédmotor lebegőpontos számítás nélkül;
- Product, ProductVariant, ProductIdentifier, Category, Brand, Manufacturer domain típusok;
- EAN/GTIN validáció, normalizálás és prioritásos identifier resolver alap;
- Warehouse, InventorySource, InventoryBalance, ExternalInventorySnapshot, StockMovement domain alap;
- `available = physical - reserved` inventory invariant;
- MediaAsset/MediaLink közös média-domain skeleton;
- Price entity előkészítés integer minor-unit összeggel;
- staged Commerce Core M0/M1 SQL bootstrap + rollback fájl;
- organization-scoped táblák és tenant SELECT RLS a canonical DIMPRO Identity Core membership függvényére építve;
- StockMovement idempotency kulcs és append-only ledger irány;
- Commerce server context + fail-closed role permission mapping;
- `/api/v1/commerce/context` route organization-váltási ellenőrzéssel;
- 21 acceptance ellenőrzés.

**Részben elkészült:**
- M0 tenant/authz: DB RLS olvasási határ + Commerce context/permission guard alap elkészült; további mutation permission enforcement még készül;
- M1 Product Engine: domain + resolver alap kész, repository/CRUD/API még készül;
- Inventory Engine: domain/invariant kész, tranzakciós ledger writer + balance rebuild még készül;
- Media Engine: adatmodell skeleton kész, képfeldolgozó pipeline még nincs implementálva;
- Pricing: csak alap Price entitás, teljes Pricing Engine későbbi milestone.

**Még hiányzik:**
- Product repository/service;
- Product CRUD API;
- `/api/v1/products/resolve?code=`;
- inventory read API + stock movement transaction service;
- DB migration DEV alkalmazása és rollback smoke;
- cross-tenant IDOR integrációs teszt valódi DEV DB-n;
- Termékek admin UI skeleton / inspector;
- Media upload pipeline.

**Módosított/létrehozott fő fájlok:**
- `app/lib/commerce/core/types.ts`
- `app/lib/commerce/core/decimal.ts`
- `app/lib/commerce/product/types.ts`
- `app/lib/commerce/product/identifier.ts`
- `app/lib/commerce/inventory/types.ts`
- `app/lib/commerce/inventory/math.ts`
- `app/lib/commerce/media/types.ts`
- `app/lib/commerce/pricing/types.ts`
- `app/lib/commerce/index.ts`
- `supabase/DIMPRO_COMMERCE_CORE_M0_M1_BOOTSTRAP.sql`
- `supabase/rollback/DIMPRO_COMMERCE_CORE_M0_M1_ROLLBACK.sql`
- `scripts/commerce-core-m0-m1-acceptance.ts`

**Adatbázis/migráció:**
- bootstrap és rollback elkészült;
- migráció még NINCS alkalmazva;
- Identity Core függőség: `dimpro_organizations`, `dimpro_is_organization_member`, `dimpro_set_updated_at`;
- közvetlen kliensírás M0/M1-ben szándékosan nincs RLS policy-val engedélyezve; mutation kizárólag guardolt server API-n át tervezett.

**API-k:**
- `/api/v1/commerce/context` forráskód elkészült; runtime aktiválás még nincs, mert a Commerce branch nincs DEV release-be integrálva.
- Product CRUD/resolve API még hiányzik.

**UI:**
- a meglévő Árutér UI változatlan;
- új Commerce admin UI még nincs rákötve, így nincs regressziós kockázat a jelenlegi felületen.

**Tesztek:**
- tsc: PASS
- lint: PASS (új Commerce scope)
- build: következő quality gate-nél
- smoke: runtime API/UI után
- acceptance: 21/21 PASS

**Ismert hibák / technikai adósság:**
- a régi `AruterProduct.stockQuantity` legacy modell továbbra is létezik a régi Árutér kódban; nem lett átírva, az új Commerce Core nem használja;
- SQL bootstrap előtt DEV DB schema/migration gate szükséges;
- Product/Variant/category relációknál a server service-ben kötelező lesz explicit organizationId ellenőrzés service-role használat esetén is;
- készlet ledger tranzakciós balance-frissítés még nincs implementálva.

**Következő fejlesztési blokk:**
1. Product repository/service + CRUD;
2. identifier resolve API;
3. DEV migration gate;
4. Inventory ledger transaction service;
5. Termékek admin UI első letisztult grid + inspector.

**Becsült következő fejlesztési ráfordítás:** 4–7 aktív fejlesztési óra a context + Product CRUD/API + első DB gate szintig.

## Készültség
- M0 Core + DB baseline: kb. 45%
- M1 Product + Media + Inventory: kb. 15%
- teljes Pilot: kb. 5%

## KÖTELEZŐ KOMPATIBILITÁSI SZABÁLY — KÜLSŐ ÁRUTÉR → KÖZPONTI PÉNZTÁR

A meglévő Árutér működés nem bontható le a Commerce Core átállás során.

Kötelező üzleti folyamat:

`külső Árutér / vásárlói kosár → közös Commerce rendelés/kosár → központi pénztári várólista → fizetve → kiadva`

Elvárások:
- a külső piactéren összeállított kosár/rendelés a belső központi pénztárban látható legyen;
- a pénztáros ugyanazokat a tételsnapshotokat, mennyiséget, árat, vevői adatot és átvételi információt lássa;
- a külső és belső értékesítési csatorna ne külön rendelési motort használjon, hanem egy közös Commerce Order/Checkout állapotgépre fusson be;
- a forráscsatorna külön mezővel legyen azonosítható (pl. STOREFRONT / INTERNAL_COLLECTOR / POS / B2B), de a pénztári queue közös;
- a jelenlegi `sent_to_cashier → paid → issued` viselkedés funkcionálisan megőrzendő;
- a meglévő `app/aruter/*` és `components/aruter/*` felületek a kontrollált átállásig érintetlen compatibility layerként működjenek;
- csak akkor köthető át új Commerce Order Engine-re, ha cross-surface acceptance bizonyítja, hogy a külső kosár megjelenik a központi pénztárban és végigvihető fizetett/kiadott állapotig.

Ez M0/M1-ben regressziós kapu, még akkor is, ha a teljes Order Engine későbbi milestone.

### 2026-08-18 esti checkpoint — Product API + Árutér pénztári kompatibilitás

Elkészült:
- a meglévő külső Árutér → központi pénztár működés kötelező kompatibilitási kapuként rögzítve;
- legacy Árutér / pénztár regressziós acceptance: 10/10 PASS;
- Commerce server DB helper és tenant context refaktor;
- Product list/create/get/update repository;
- Product CRUD API: `GET/POST /api/v1/commerce/products`, `GET/PATCH /api/v1/commerce/products/:id`;
- identifier resolver API: `GET /api/v1/commerce/products/resolve?code=...`;
- minden service-role query explicit `organization_id` szűrést kap;
- category/brand/manufacturer cross-tenant reference ellenőrzés;
- Product API contract: 14/14 PASS;
- TypeScript: PASS;
- célzott lint: PASS.

Részben elkészült:
- Product create jelenleg compensation delete-et használ, amíg a DEV migration/RPC tranzakciós gate nem kész; ezt a migráció alkalmazása előtt atomi DB RPC-re kell cserélni vagy megerősíteni;
- API runtime smoke csak a Commerce DEV migráció után futtatható.

Következő:
- DEV migration gate + rollback dry-run/contract;
- tranzakciós Product create RPC vagy biztonságos service transaction megoldás;
- Inventory ledger writer + balance update;
- letisztult Termékek admin UI skeleton.

### 2026-08-18 18:xx checkpoint — Migration gate + Inventory Engine + Termékek UI skeleton

Elkészült:
- canonical Commerce M0/M1 DEV migration: `supabase/migrations/20260818183000_dimpro_commerce_core_m0_m1.sql`;
- schema marker: `commerce-core` / `0.1.0`;
- server-only RLS/grant modell: anon/authenticated közvetlen tábla-hozzáférés tiltva, service API explicit jogokkal;
- `commerce_product_create_atomic` SECURITY DEFINER RPC, így Product + default Variant + Identifier + audit + outbox egy tranzakcióban készül;
- `commerce_inventory_apply_movement` SECURITY DEFINER RPC advisory xact lockkal, idempotencia-védelemmel és atomi balance + ledger + audit + outbox írással;
- StockMovement/InventoryBalance közvetlen UPDATE nincs kitéve service_role felé;
- Product repository átállt az atomi create RPC-re;
- Inventory read repository + `GET /api/v1/commerce/inventory`;
- Inventory movement API + `POST /api/v1/commerce/inventory/movements`, kötelező idempotency-key támogatással;
- új, a legacy Árutér admin oldalt nem felülíró letisztult Commerce Termékek oldal: `/aruter/admin/termekek`;
- desktop: Data Grid + jobb oldali inspector; mobil: kártyás lista; új termék gyorsfelvitel EAN/SKU/egység mezőkkel;
- a gridben az Ár / Belső készlet / Külső készlet oszlopok már helyet kaptak, adataggregátoruk következő blokk.

Migration/DB gate:
- preflight: PASS, tiszta Commerce baseline;
- tranzakciós rollback-test: PASS;
- teljes DB rollback acceptance: 15/15 PASS;
- valós DEV Identity sentinel ellenőrizve;
- tényleges migration apply még nem futott, mert a közös exclusive-operation lockot ÁrminAI build használta a blokk közben.

Acceptance:
- core: 21/21 PASS;
- legacy Árutér → központi pénztár kompatibilitás: 10/10 PASS;
- Product API contract: 14/14 PASS;
- Inventory API/ledger contract: 16/16 PASS;
- DB rollback E2E: 15/15 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

Következő blokk:
1. közös lock felszabadulása után koordinált DEV migration apply + verify;
2. Product + Inventory runtime smoke;
3. Product list summary aggregator: ár + belső/külső készlet;
4. Termékek UI összekötése az aggregált adatokkal;
5. Media Engine MVP előkészítés.

### 2026-08-18 18:30 checkpoint — Terméklista kereskedelmi összesítő

Elkészült:
- Product list summary aggregator: default variant, SKU, egység, aktív ár, belső SELLABLE készlet, külső készlet és külső sync státusz;
- belső és külső készlet külön marad a listában és az inspectorban;
- ár- és készletösszesítés minden lekérdezésnél explicit organization scope-pal történik;
- a Termékek admin grid már tényleges Commerce summary mezőket jelenít meg, nem placeholder készletmezőket;
- mobil lista és jobb oldali inspector változatlanul megmaradt.

Acceptance:
- Product summary contract: 14/14 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

### 2026-08-18 19:10 checkpoint — DEV migration + candidate build/smoke ZÖLD

A korábbi, „migration apply még nem futott” checkpointot ez a későbbi állapot felülírja.

DEV migration:
- `commerce-core` schema `0.1.0` ténylegesen alkalmazva a DEV adatbázisra koordinált migration lock alatt;
- migration SHA-256: `7ffb80339d3d129da59acbb85fcf4c8957940efcb067fddf36953935b453a367`;
- teljes pre-migration DEV backup elkészült: `/srv/dimpro-dev/backups/commerce-core-m0-m1/20260818T163147Z/supabase-dev-pre-commerce-core-m0-m1.dump`;
- backup SHA-256: `db61cedc032c4002cd1e3a0618a57bd513bef74c85ea704c20591176836e34ec`;
- migration verify: PASS;
- RLS/grant security verify: PASS minden Commerce táblán;
- PROD változatlan.

Candidate build:
- első Turbopack kísérlet a worktree gyökérből kifelé mutató `node_modules` symlink miatt fail volt;
- ezt csak az izolált OutminAI worktree-ben javítottuk: a node_modules külső symlink helyett ugyanazon DEV filesystemen hardlinkelt, lokális könyvtár készült;
- a buildhez a meglévő DEV `.env.local` biztonságos, gitignored, 0600 jogosultságú helyi példánya került az izolált worktree-be; tartalma nincs naplózva vagy commitolva;
- végleges koordinált Turbopack build: PASS;
- build ID: `pUuyrKXLQ8Mio-Xtw1AUh`;
- build source: `92eaa4980991ba948c77e6e03b559a7dfa52ce43`;
- standalone release: PASS;
- 249 statikus chunk: PASS;
- post-build storage retention: PASS;
- build operation exit code: 0.

Candidate smoke, izolált localhost porton:
- `/login`: HTTP 200;
- `/aruter/admin/termekek`: HTTP 307 → `/login` aktív session nélkül, a központi auth guard szerint;
- `/api/v1/commerce/context`: HTTP 307 → `/login` aktív session nélkül;
- `/api/v1/commerce/products`: HTTP 307 → `/login` aktív session nélkül;
- `/api/v1/commerce/inventory`: HTTP 307 → `/login` aktív session nélkül;
- build route manifest tartalmazza a Commerce Termékek és API route-okat;
- candidate standalone startup: PASS.

Megjegyzés: shared DEV runtime cutover még NEM történt. A candidate izoláltan zöld, így ÁrminAI/JázminAI aktuális release-e nem lett lecserélve.

### 2026-08-18 19:xx checkpoint — Media Engine M1 adatmodell + kliens előkészítés

Elkészült:
- külön `commerce_media_variants` modell: ORIGINAL / WEB / THUMBNAIL;
- külön, nem destruktív `commerce_media_overlays` modell: WATERMARK / LOGO / STAMP / ARROW / CIRCLE / TEXT / BLUR;
- `commerce_media_finalize_upload` atomi metadata-finalizáló RPC;
- organization + asset storage-prefix guard;
- WEB és THUMBNAIL kötelező; ORIGINAL alapértelmezetten tiltott, ha `retainOriginal=false`;
- Product és ProductVariant média-link tenant scope ellenőrzéssel;
- finalize audit + outbox esemény;
- Commerce kliens képelőkészítő wrapper a már meglévő közös Drop image engine-re építve, külön web és thumbnail outputtal, metaadat-strip alapértelmezéssel;
- Media M1 contract: 16/16 PASS;
- Media DB rollback E2E: 10/10 PASS;
- TypeScript: PASS; lint: PASS; diff-check: PASS.

A Media M1 migráció ekkor még staged; tényleges DEV apply külön koordinált migration gate után következik.

### 2026-08-18 19:25 checkpoint — Media Engine M1 DEV aktív + upload pipeline

A korábbi staged Media M1 állapotot ez a checkpoint felülírja.

DEV adatbázis:
- Commerce schema: `0.1.1`, migration count: 2;
- `commerce_media_variants` és `commerce_media_overlays` alkalmazva;
- `commerce_media_finalize_upload` service-only RPC aktív;
- Media migration SHA-256: `448f3894db5f97b225cd25fa2802a4b65b83e1c207113099a21b49b12e482970`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-media-m1/20260818T171548Z/supabase-dev-pre-commerce-media-m1.dump`;
- backup SHA-256: `85be46f25a745051fa45633f642f842edd2fc18fd65ab6796a1a19dcfd092f29`;
- migration verify + security gate: PASS;
- PROD változatlan.

Media upload pipeline:
- Commerce-specifikus S3 konfiguráció támogatott, DEV-ben a meglévő Drive object storage credential a fallback; külön `commerce/...` prefixet használ;
- böngésző nem kap közvetlen S3 credentialt és nem igényel új bucket CORS szabályt: a kép same-origin Commerce PUT API-n keresztül streamelődik az object storage-ba;
- HMAC-SHA256 upload ticket, user + organization + asset + target scope-pal és lejárattal;
- támogatott tárolt output: JPEG / PNG / WEBP; HEIC/HEIF a közös kliens image engine-ben konvertálható;
- WEB + THUMBNAIL kötelező, ORIGINAL csak explicit retentionnel;
- feltöltéskor content-type és content-length egyezés kötelező;
- finalize előtt minden objektum HEAD ellenőrzést kap, utána atomi DB metadata finalize;
- médiaolvasás rövid életű signed GET redirecten történik;
- Product list summary tartalmazza a primary media asset azonosítót;
- Termékek adminban elkészült a „Kép hozzáadása / Kép cseréje” workflow és a bélyegképes terméklista/inspector.

Tesztkapu:
- Media migration contract: 16/16 PASS;
- Media DB rollback E2E: 10/10 PASS;
- Media upload contract: 18/18 PASS;
- upload token roundtrip/tamper/expiry: PASS;
- object storage readiness PUT/HEAD/cleanup: 4/4 PASS;
- TypeScript: PASS;
- célzott lint: PASS, 0 warning;
- git diff --check: PASS.

Következő:
1. új Media route-okkal friss candidate build;
2. izolált candidate route/security smoke;
3. Commerce Media UI regresszió;
4. shared DEV cutover továbbra is csak integrációs kapu után, más workerek aktuális release-ének felülírása nélkül.

### 2026-08-18 19:xx záró checkpoint — Media runtime E2E + teljes esti quality gate

Runtime E2E:
- Media initiate + same-origin upload ticket: PASS;
- WEB objektum tényleges objektumtárhelyi feltöltése: PASS;
- THUMBNAIL objektum tényleges objektumtárhelyi feltöltése: PASS;
- atomi media finalize: PASS;
- finalize idempotencia: PASS;
- asset + variant + product-link DB perzisztencia: PASS;
- rövid életű signed thumbnail GET: PASS;
- eredeti kép alapértelmezetten nem maradt meg: PASS;
- tesztadat- és objektum-cleanup: PASS;
- runtime E2E összesen: 8/8 PASS.

Esti regressziós kapu:
- legacy Árutér → központi pénztár: 10/10 PASS;
- Product API: 14/14 PASS;
- Inventory ledger/API: 16/16 PASS;
- Product ár/készlet summary: 14/14 PASS;
- Media M1 contract: 16/16 PASS;
- Media upload contract: 18/18 PASS;
- Media DB schema/security verify: PASS;
- TypeScript: PASS;
- célzott lint: PASS, 0 error;
- git diff --check: PASS.

Candidate release:
- alkalmazáskód candidate source: `ec60f4c136d67b7d98618d95a5bdf8955ec8a3f7`;
- build ID: `CP9CzIEmhk_ssIx8NXUat`;
- standalone + 249 statikus chunk + post-build retention: PASS;
- izolált candidate smoke: PASS;
- shared DEV runtime cutover: NEM történt; ÁrminAI/JázminAI aktív release-e nem lett felülírva.

34. pont szerinti aktuális állapot:
- M0 Core + DB baseline: kb. 70% — tenant context, server-only security, audit/outbox alap, két DEV migráció és rollback/backup gate kész; feature-flag/context finomhangolás és teljes admin audit API még hiányzik.
- M1 Product + Media + Inventory: kb. 45% — Product CRUD/resolve, atomi Inventory ledger, terméklista price/internal/external summary, Media upload/render foundation és admin Termékek skeleton kész; külön Variant/Category/Brand/Manufacturer CRUD UI/API, Pricing kezelő, reservation engine, overlay szerkesztő és többképes rendezés még hiányzik.
- teljes Pilot: kb. 15% — a Commerce alap érdemben elindult, de Receiving/Order/Storefront Pilot még későbbi blokk.

Következő biztonságos fejlesztési sorrend:
1. Variant + Category + Brand/Manufacturer CRUD;
2. Pricing API/UI alap;
3. inventory reservation modell és service;
4. Media multi-image/primary/sort + overlay API;
5. Termékek inspector szerkesztő mód;
6. csak ezután Receiving és közös Order/Checkout bridge a meglévő Árutér pénztári flow megtartásával.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-18 20:xx checkpoint — Catalog master data + Variant CRUD

Elkészült:
- Category / Brand / Manufacturer server repository és tenant-scoped CRUD API;
- soft archive törzsadatokra, aktív termékhivatkozás esetén archiválási tiltás;
- kategória parent scope guard, self/cycle/depth guard, aktív alkategória esetén archiválási tiltás;
- ProductVariant create / update / archive API;
- variant SKU uniqueness konfliktuskezelés;
- készlethez kapcsolt variant archiválási tiltás;
- új admin oldal: `/aruter/admin/torzsadatok` — kategória/márka/gyártó létrehozás, szerkesztés, archiválás;
- kategória UI-ban szülőkategória-választás;
- legacy Árutér oldalakhoz nem nyúltunk.

Tesztkapu:
- Catalog API contract: 16/16 PASS;
- Catalog + Variant valós DEV runtime E2E: 12/12 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- QA rekordok cleanup után nem maradnak bent.

### 2026-08-18 20:xx checkpoint — Product UI törzsadat + Variant integráció

Elkészült:
- Termékek oldal betölti az aktív kategória/márka/gyártó törzsadatokat;
- új termék felvitelekor közvetlenül választható kategória, márka és gyártó;
- inspector mutatja a termék törzsadat-kapcsolatait;
- közvetlen „Törzsadatok” navigáció;
- inspectorban látható a variant lista;
- új variant név + SKU + egység gyorsfelvitel közvetlenül a termékből;
- desktop és mobil terméklista változatlanul megmaradt.

Tesztkapu:
- Product catalog/variant UI contract: 14/14 PASS;
- TypeScript: PASS;
- lint: PASS;
- diff-check: PASS.

### 2026-08-18 21:18 checkpoint — Pricing M1 DEV aktív

Elkészült:
- `commerce_price_set_active` atomi, service-only RPC;
- egy adott variant + currency esetén az új ár append/history logikával kerül be;
- korábbi aktív ár automatikusan INACTIVE lesz és `valid_until` értéket kap;
- árváltás tranzakciós advisory lock alatt fut;
- közvetlen service-role INSERT/UPDATE/DELETE tiltott a `commerce_prices` táblán;
- Pricing audit + outbox (`PRICE_SET_ACTIVE`, `PRICE_CHANGED`);
- tenant-scoped ártörténet GET és aktív ár POST API: `/api/v1/commerce/prices`;
- Termék inspectorban nettó HUF ár gyorsrögzítés, 27% ÁFA alapbeállítással;
- korábbi árak az ártörténetben megmaradnak.

DEV migráció:
- Commerce schema: `0.1.2`, migration count: 3;
- migration SHA-256: `d37aebfe4929a7c0e6e293c5e149bb5c8c578c9627ff7c1f5bc8adad277c399a`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-pricing-m1/20260818T191635Z/supabase-dev-pre-commerce-pricing-m1.dump`;
- backup SHA-256: `ffce9b8e0ae9dff086551eafb673e2db6e85923ca20240f917775d1d0e3d6633`;
- migration/security verify: PASS;
- PROD változatlan.

Tesztkapu:
- Pricing contract: 16/16 PASS;
- Pricing DB rollback acceptance: 10/10 PASS a tényleges apply előtt;
- Pricing valós DEV runtime E2E: 8/8 PASS;
- Product catalog/variant UI regresszió: 14/14 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- runtime QA rekordok cleanup után nem maradtak bent.

Aktuális készültségbecslés:
- M0 Core + DB baseline: kb. 75%;
- M1 Product + Media + Inventory + Pricing: kb. 55%;
- teljes Pilot: kb. 18%.

Következő blokk:
1. Inventory reservation modell + atomi reserve/release/consume service;
2. Media multi-image / primary / sort + overlay API;
3. Termék inspector teljes szerkesztő mód;
4. Receiving alap;
5. közös Order/Checkout bridge a meglévő Árutér → központi pénztár működés megtartásával.

### 2026-08-18 21:xx checkpoint — Inventory Reservation M1 staged

Elkészült kódszinten:
- explicit `commerce_inventory_reservations` entitás;
- külön reservation event ledger;
- reserve / release / consume workflow;
- foglaláskor `reserved_quantity` nő, fizikai készlet nem változik;
- release csak a foglalt mennyiséget csökkenti;
- consume egyszerre csökkenti a fizikai és foglalt mennyiséget;
- generated `remaining_quantity`;
- ACTIVE / PARTIAL / RELEASED / CONSUMED / EXPIRED státuszmodell;
- idempotens create/release/consume műveletek;
- lejárt, lezárt és fennmaradó mennyiséget meghaladó műveletek tiltása;
- minden módosítás a meglévő immutable StockMovement ledgeren keresztül fut;
- service-role közvetlen reservation-módosítás tiltott, RPC-only mutation;
- tenant-scoped reservation list/create API;
- külön release és consume API, kötelező `idempotency-key` támogatással;
- későbbi Order/Checkout bridge számára reference type/id támogatás.

Tesztkapu a staged migrációhoz:
- Reservation contract: 18/18 PASS;
- Reservation DB transaction + rollback acceptance: 15/15 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- migration preflight: PASS;
- migration SHA-256: `8fe89576dfbaf95fa19abbb72a96e10695383d07d82e9725999db0e79148c18a`.

Állapot:
- a Reservation 0.1.3 migráció ekkor még NINCS alkalmazva a DEV adatbázisra;
- oka: ÁrminAI központi coordinated build lockja aktív, ezért OutminAI nem indít párhuzamos migrációt/buildet;
- következő lépés a lock felszabadulása után: coordinated DEV backup + migration apply → verify → valós repository runtime E2E → candidate build.
- a lejárt reservation automatikus felszabadító worker még NINCS implementálva; ezt a későbbi Order/Checkout/expiry worker blokkban kell lezárni.
- PROD változatlan.

### 2026-08-18 21:xx checkpoint — Termék inspector szerkesztő mód

Elkészült:
- a jobb oldali Termék inspectorban közvetlen „Szerkesztés” mód;
- név, típus/modell, kategória, márka, gyártó és státusz egy helyen módosítható;
- mentés a meglévő tenant-scoped Product PATCH API-n keresztül;
- mentés után detail + lista frissül, oldalváltás nélkül;
- a szerkesztő megtartja a letisztult, kis kattintásszámú Árutér UI irányt.

Tesztkapu:
- Product inspector edit contract: 12/12 PASS;
- TypeScript: PASS;
- lint: PASS;
- git diff --check: PASS.

### 2026-08-18 21:32 checkpoint — Inventory Reservation M1 DEV aktív

A korábbi staged Reservation állapotot ez a checkpoint felülírja.

DEV migráció:
- Commerce schema: `0.1.3`, migration count: 4;
- `commerce_inventory_reservations` és `commerce_inventory_reservation_events` aktív;
- reserve/create és release/consume service-only RPC-k aktívak;
- migration SHA-256: `8fe89576dfbaf95fa19abbb72a96e10695383d07d82e9725999db0e79148c18a`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-reservation-m1/20260818T193047Z/supabase-dev-pre-commerce-reservation-m1.dump`;
- backup SHA-256: `21d11b57b99bb26d1602dd19d29f25e138b2632ca099c53985c7b12e2ffbb5b3`;
- migration/security verify: PASS.

Runtime ellenőrzés:
- valós DEV reservation repository E2E: 11/11 PASS;
- reserve: physical változatlan, reserved nő, available csökken;
- release: reserved csökken;
- consume: physical + reserved együtt csökken;
- create idempotencia: PASS;
- tenant-scoped reservation list: PASS;
- végső balance invariáns: PASS;
- QA cleanup: PASS.

Javítás a runtime E2E során:
- a Supabase numeric mezők bizonyos lekérdezéseknél number típusként érkeztek, miközben az Inventory repository korábbi `text()` helperje csak stringet kezelt;
- emiatt a készletmennyiségek üres stringgé válhattak az API mapping során;
- javítva: string / number / bigint numerikus értékek biztonságos DecimalString konverziója;
- a javítás után a valós inventory balance ellenőrzés zöld.

PROD változatlan; shared DEV runtime cutover továbbra sem történt.

### 2026-08-18 22:xx checkpoint — Media Management M1 DEV aktív

Elkészült:
- termékhez kapcsolt több média asset tenant-scoped listázása;
- atomikus termékkép sorrend + elsődleges kép kijelölés;
- adatbázis-szintű egy-elsődleges-kép invariáns aktív entity-linkenként;
- advisory lockkal védett `commerce_media_set_product_order` service-only RPC;
- sorrend/primary változás audit + outbox eseménnyel;
- meglévő `commerce_media_overlays` motorra épülő non-destructive overlay CRUD;
- engedélyezett overlay típusok: WATERMARK, LOGO, STAMP, ARROW, CIRCLE, TEXT, BLUR;
- overlay create/update/soft-archive tenant + asset scope ellenőrzéssel;
- API: `GET/PATCH /api/v1/commerce/media/products/[productId]`;
- API: `POST /api/v1/commerce/media/assets/[assetId]/overlays`;
- API: `PATCH/DELETE /api/v1/commerce/media/assets/[assetId]/overlays/[overlayId]`;
- WEB/THUMBNAIL content URL-ok a média listában elérhetők.

DEV migráció:
- Commerce schema: `0.1.4`, migration count: 5;
- migration SHA-256: `0c2760d8e84abaf60bf92ae28bd76c696cba2754c0c60c7421f38604c709bbea`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-media-management-m1/20260818T201012Z/supabase-dev-pre-commerce-media-management-m1.dump`;
- backup SHA-256: `ebc512d4f42a8605e7bfb644bf701b50ac5fd909e36be4e6ed6043252e57263c`;
- backup listing verify: PASS;
- migration/security verify: PASS;
- authenticated RPC: DENY; service-role RPC: ALLOW.

Tesztkapu:
- Media management contract: 20/20 PASS;
- Media management DB transaction + rollback acceptance: 11/11 PASS;
- valós DEV repository runtime E2E: 12/12 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- runtime QA cleanup: PASS.

Részben elkészült / hiányzik:
- a backend támogatja a többképes galériát, primary-t, sorrendet és overlay-ket, de a Termék inspector teljes galéria-kezelő UI-ja még nincs bekötve;
- overlay render/export pipeline még nincs lezárva; az overlay jelenleg szerkeszthető, nem destruktív meta-réteg;
- következő Media UI blokk: thumbnail galéria, primary kijelölés, sorrendmozgatás, alap overlay jelzések;
- az eredeti fájl továbbra is alapértelmezetten nem marad meg, a meglévő Media Engine policy szerint.

34. pont szerinti állapot:
- elkészült: M0 Commerce context/DB baseline; Product CRUD + identifier resolver; Inventory ledger/balance; Reservation workflow; Pricing history/active price; Media upload/storage core; Media management backend; Termék admin grid + inspector alap + inline product edit;
- részben elkészült: Media management UI; teljes variant edit; receiving; order/checkout bridge;
- hiányzik: Receiving/GoodsReceipt workflow, Order/Checkout domain bridge, teljes pénztár-készletfoglalás integráció, lejáró reservation worker, pilot teljes E2E;
- fő új fájlok: `app/lib/commerce/media/repository.ts`, `app/api/v1/commerce/media/products/[productId]/route.ts`, overlay API route-ok, Media management migration/gate/acceptance/runtime E2E;
- ismert hiba: jelen checkpointban nincs nyitott backend Media management hiba; UI galéria hiány funkcionális backlog;
- következő blokk: Termék inspector többképes galéria UI, utána Receiving alap;
- becsült aktív fejlesztési idő: Media galéria UI 1.5–2.5 óra; Receiving M1 alap 4–7 óra; Order/Checkout bridge 6–10 óra.

Kötelező környezeti állapot: PROD változatlan, PROD alkalmazásmódosítás nem történt, shared DEV runtime cutover nem történt.

### 2026-08-18 22:xx checkpoint — Termék többképes galéria UI

Elkészült:
- a Termék inspector korábbi egyképes feltöltője külön, újrahasznosítható `CommerceProductMediaGallery` komponensre váltott;
- több kép egyidejű kiválasztása és sorozatos feltöltése;
- PC/laptop drag & drop feltöltés;
- fájlszintű csomag-progressz (`aktuális/összes`);
- nagy WEB előnézet és vízszintes thumbnail-sáv;
- elsődleges kép egyértelmű jelölése és egy kattintással történő cseréje;
- képsorrend balra/jobbra mozgatással módosítható;
- a sorrend és primary státusz a Media Management M1 atomi PATCH/RPC útvonalán mentődik;
- az aktív non-destructive overlay-k képenként darabszámmal, a kijelölt képen pedig típuscímkékkel láthatók;
- a meglévő közös képoptimalizáló maradt: WEB + THUMBNAIL, eredeti nagy fájl alapból nem marad meg;
- média-változás után a Product summary újratöltődik, ezért a terméklista elsődleges thumbnailje is frissül.

UX irány:
- az inspector nem vált külön média-admin oldalra;
- a gyakori képműveletek egy helyen, kis kattintásszámmal érhetők el;
- mobilon/tableten a thumbnail-sáv vízszintesen görgethető;
- desktopon drag & drop és többes fájlválasztás támogatott.

Tesztkapu:
- Product Media Gallery UI contract: 18/18 PASS;
- Media upload regression: 18/18 PASS;
- Media management backend regression: 20/20 PASS;
- Product summary regression: 14/14 PASS;
- Product inspector edit regression: 12/12 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

Megjegyzés:
- a korábbi `768fb36` Media Management build első coordinated futása sikeresen lefutott; egy korábban sorba állt azonos második build később feleslegesen újraindult és hibával zárult, ezért a második futás eredménye nem release-jelölt. A forráskód tiszta checkpointból folytatódott.
- shared DEV runtime cutover és PM2 restart továbbra sem történt; PROD változatlan.

### 2026-08-18 22:48 checkpoint — Receiving M1 staged, DEV apply előtt

Elkészült kódszinten:
- GoodsReceipt fej + GoodsReceiptItem tétel domain;
- DRAFT / POSTED / CANCELLED státuszmodell;
- szervezet + raktár + belső készletforrás scope ellenőrzés;
- beszállítói név és bizonylatszám snapshot mezők;
- tételenként variant, készletállapot, mennyiség, egység, opcionális egységköltség, pénznem, LOT-kód és lejárat;
- bevételezés létrehozás/lista/részlet/módosítás/visszavonás API;
- tétel létrehozás/módosítás/soft-delete API;
- idempotens `commerce_goods_receipt_post` RPC;
- könyveléskor a készlet kizárólag az immutable `commerce_inventory_apply_movement` ledgeren keresztül nő;
- SELLABLE / QUARANTINE / DAMAGED / OUTLET bevételezési állapotok;
- post audit + outbox;
- külön receiving read/write/post permission;
- Commerce Media Engine célobjektumai bővítve GOODS_RECEIPT és GOODS_RECEIPT_ITEM típussal, így a bevételezéshez és tételhez később ugyanazzal a képmotorral csatolható fotó.

Tesztkapu a DEV apply előtt:
- Receiving contract: 26/26 PASS;
- DB transaction + rollback acceptance: 15/15 PASS;
- Media upload regression: 18/18 PASS;
- Media management regression: 20/20 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- migration preflight: PASS;
- migration SHA-256: `f998ef4487fa3cead26bcb8e54d6599bbb17b1c421cf750c3a2830da7da1e94b`.

Állapot:
- a Receiving 0.1.5 migráció ebben a checkpointban még NINCS alkalmazva;
- a központi coordinated build lockot tiszteletben tartjuk; alkalmazás csak szabad locknál történhet;
- PROD változatlan.

### 2026-08-18 22:5x checkpoint — Receiving admin UI skeleton

Elkészült:
- új `/aruter/admin/bevetelezes` letisztult adminfelület;
- bevételezési lista + jobb oldali inspector;
- vázlat bevételezés fej létrehozás: beszállító, bizonylatszám, raktár, belső készletforrás, megjegyzés;
- aktív raktár és belső készletforrás tenant-scoped options API;
- aktív termékekből tételfelvitel;
- mennyiség, egység, készletállapot, LOT-kód, lejárat és nettó egységköltség mezők;
- tétel soft-delete vázlatban;
- explicit, idempotens „Bevételezés könyvelése” művelet;
- könyvelt állapot vizuális visszajelzése;
- Termékek adminból közvetlen Bevételezés navigáció.

Tesztkapu:
- Receiving UI contract: 16/16 PASS;
- Receiving backend contract: 26/26 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

A UI a 0.1.5 Receiving schema DEV alkalmazása után lesz runtime E2E-re kész. PROD változatlan.

### 2026-08-18 22:54 Receiving media persistence gate javítás

A staged Receiving ellenőrzésekor kiderült, hogy az alkalmazásoldali Media upload target bővítés önmagában nem elég: a korábbi `commerce_media_finalize_upload` adatbázis-RPC még csak PRODUCT és PRODUCT_VARIANT linkeket fogadott el. Ezt a 0.1.5 migráció most kontrolláltan bővíti `GOODS_RECEIPT` és `GOODS_RECEIPT_ITEM` célokra, tenant-scope ellenőrzéssel. A rollback a pre-Receiving Media finalizer definíciót állítja vissza.

Frissített kapu:
- Receiving contract: 28/28 PASS;
- DB transaction + rollback acceptance: 17/17 PASS, benne receipt header + receipt item Media link finalization;
- migration SHA-256: `20b6ab00df66796e0510045ebadfe43f461a0491ac52e03d8dc3f93ed047ad34`;
- migration preflight: PASS;
- DEV apply továbbra is a központi lock felszabadulására vár; PROD változatlan.

### 2026-08-18 23:06 checkpoint — Receiving M1 DEV aktív

A staged 0.1.5 Receiving migráció a központi lock felszabadulása után coordinated módon sikeresen alkalmazva.

DEV migráció:
- Commerce schema: `0.1.5`, migration count: 6;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-receiving-m1/20260818T210216Z/supabase-dev-pre-commerce-receiving-m1.dump`;
- backup SHA-256: `b99a339dcf2b0f9608ee8b58a4dbcc18152712ab680f0b95527612ee73fde428`;
- migration SHA-256: `20b6ab00df66796e0510045ebadfe43f461a0491ac52e03d8dc3f93ed047ad34`;
- schema/security verify: PASS; authenticated post RPC DENY, service-role post RPC ALLOW.

Valós DEV runtime E2E:
- Receiving repository runtime: 12/12 PASS;
- tenant-scoped warehouse/source options: PASS;
- draft receipt create + supplier snapshot: PASS;
- SELLABLE + QUARANTINE tételfelvitel: PASS;
- receipt detail/list: PASS;
- service-only posting: PASS;
- posting idempotency: PASS;
- inventory ledger balance update: PASS;
- immutable RECEIPT StockMovement reference: PASS;
- runtime fixture cleanup: PASS.

Runtime QA során a tesztkontextust a valós Commerce context logikához igazítottuk: az aktív szervezet aktív membershipjének `user_id` mezője kerül a `created_by_user_id` auditmezőbe. PROD változatlan.

### 2026-08-18 23:xx checkpoint — Receiving M1 DEV aktív + runtime E2E

A korábbi staged Receiving checkpointot ez az állapot felülírja.

DEV migráció:
- Commerce schema: `0.1.5`, migration count: 6;
- `commerce_goods_receipts` + `commerce_goods_receipt_items` aktív;
- `commerce_goods_receipt_post` service-only RPC aktív;
- authenticated RPC: DENY; service-role RPC: ALLOW;
- migration SHA-256: `20b6ab00df66796e0510045ebadfe43f461a0491ac52e03d8dc3f93ed047ad34`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-receiving-m1/20260818T210216Z/supabase-dev-pre-commerce-receiving-m1.dump`;
- backup SHA-256: `b99a339dcf2b0f9608ee8b58a4dbcc18152712ab680f0b95527612ee73fde428`;
- backup listing verify: PASS;
- migration/security verify: PASS.

Valós DEV repository runtime E2E:
- 12/12 PASS;
- tenant-scoped warehouse/source options: PASS;
- draft receipt create: PASS;
- SELLABLE + QUARANTINE tétel létrehozás: PASS;
- beszállító/bizonylat snapshot visszaolvasás: PASS;
- DRAFT lista scope: PASS;
- service-only posting: PASS;
- posting idempotencia: PASS;
- inventory ledger balance: SELLABLE 5, QUARANTINE 2: PASS;
- StockMovement reference `GOODS_RECEIPT_ITEM`: PASS;
- POSTED állapot persistálás: PASS;
- runtime QA cleanup: PASS.

Runtime teszt közben javított ellenőrzés:
- az első fixture véletlen user UUID-val futott, ezért a `created_by_user_id -> dimpro_users(id)` FK helyesen 23503 hibát adott;
- a runtime E2E ezután valós aktív DEV user rekordot használ; üzleti kód módosítása emiatt nem volt szükséges.

34. pont szerinti állapot:
- elkészült: Commerce context/tenant/authz és DB baseline; Product CRUD + identifier resolver; Catalog törzsadatok; Inventory ledger/balance; Reservation; Pricing; Media upload/storage + management; Termék admin grid/inspector + inline edit + többképes galéria; Receiving backend + admin UI alap;
- részben elkészült: Receiving média UI bekötés; teljes variant edit; külső készlet connectorok; checkout/order bridge;
- hiányzik: Order/Checkout domain bridge a legacy Árutér pénztári flow megtartásával; reservation expiry worker; teljes pénztár-készletfoglalás integráció; teljes pilot E2E; receiving többképes dokumentációs UI;
- fő Receiving fájlok: `app/lib/commerce/receiving/*`, `app/api/v1/commerce/receiving/*`, `components/aruter/CommerceReceivingAdmin.tsx`, `app/aruter/admin/bevetelezes/page.tsx`, Receiving migration/gate/rollback/acceptance/runtime E2E;
- API: receipt list/create/detail/update/cancel, item create/update/archive, options, post;
- UI: `/aruter/admin/bevetelezes`;
- tsc: PASS; lint: PASS; diff-check: PASS; Receiving contract 28/28 PASS; DB rollback 17/17 PASS; runtime E2E 12/12 PASS; UI contract 16/16 PASS; teljes célzott Commerce regresszió PASS;
- build: a következő candidate build ehhez a checkpoint után indul, kizárólag szabad exclusive-operation lock mellett;
- smoke: shared DEV runtime cutover nem történt, ezért shared-runtime smoke még nem jelölhető PASS-nak;
- ismert hiba: nincs nyitott Receiving backend/runtime hiba; a Receiving képkezelő UI még backlog;
- következő legkorábbi hiányzó blokk: Receiving média UI összekötés, majd Order/Checkout bridge;
- becsült aktív fejlesztési idő: Receiving média UI 1.5–3 óra; Order/Checkout bridge 6–10 óra; expiry worker + pilot E2E 3–6 óra.

PROD változatlan, PROD alkalmazásmódosítás nem történt.

### 2026-08-18 23:14 checkpoint — Receiving Media UI + runtime

Elkészült:
- a közös Commerce képfeltöltő kliens általánosítva PRODUCT / PRODUCT_VARIANT / GOODS_RECEIPT / GOODS_RECEIPT_ITEM célokra;
- új tenant-scoped generikus linked-media lista repository + `GET /api/v1/commerce/media/links`;
- új `CommerceReceivingMediaAttachments` komponens;
- teljes bevételezési bizonylathoz több fotó csatolható;
- egyedi GoodsReceiptItem tételhez is több fotó csatolható;
- többes fájlválasztás, HEIC/HEIF input és közös WEB + THUMBNAIL optimalizáló marad;
- thumbnail előnézet és megnyitás;
- aktív non-destructive overlay jelenléte „jelölt” badge-dzsel látható;
- az eredeti nagy fájl továbbra sem marad meg alapértelmezetten.

Tesztkapu:
- Receiving Media UI contract: 16/16 PASS;
- valós DEV Receiving Media object-store/runtime E2E: 12/12 PASS;
- receipt-header és receipt-item upload ticket: PASS;
- WEB + THUMBNAIL objektumtárhely: PASS;
- DB media link scope: PASS;
- generic linked-media list: PASS;
- signed thumbnail GET: PASS;
- original retention policy: PASS;
- runtime cleanup: PASS;
- Media upload regression: 18/18 PASS;
- Receiving UI regression: 16/16 PASS;
- Receiving backend regression: PASS;
- legacy Árutér → központi pénztár regresszió: PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

Megjegyzés: a 23:07-kor indult korábbi Receiving candidate build a `4e2f28b` forráspontról futott. Mivel ezután új Receiving Media forrásmódosítás készült ugyanabban a worktree-ben, az a build nem tekinthető a jelen checkpoint release-candidate buildjének. A jelen commit után külön tiszta coordinated candidate build szükséges. PROD változatlan.

### 2026-08-18 23:47 checkpoint — Shared Order Core + legacy Árutér cashier bridge staged

Cél:
- a meglévő külső Árutér kosár → központi pénztár → Fizetve → Kiadva működés megtartása mellett létrejön a közös Commerce Order Engine;
- a legacy Árutér felület és Zustand/store működés ebben a blokkban NEM lett lecserélve vagy eltávolítva.

Elkészült kódszinten:
- `commerce_orders`, `commerce_order_items`, `commerce_order_status_events` domain és DB-séma;
- állapotlánc: DRAFT → SENT_TO_CASHIER → PAID → ISSUED, valamint kontrollált CANCELLED;
- explicit `EXTERNAL_MARKETPLACE` forráscsatorna;
- cashier queue index SENT_TO_CASHIER + PAID állapotokra;
- legacy tételsnapshot megtartható Product/Variant mapping nélkül is, `UNRESOLVED` inventory státusszal;
- opcionális `reservation_id` előkészítve a következő Order ↔ Inventory Reservation bridge blokkhoz;
- service-only, advisory lockkal védett atomikus rendelés-create RPC;
- teljes create payload hash alapú idempotencia: ugyanaz a kulcs + eltérő vevő/tétel/ár/adat payload elutasítva;
- service-only, idempotens status RPC és append-only status event ledger;
- audit + transactional outbox rendelés létrehozáskor és státuszváltáskor;
- külön Order jogosultságok: read / write / pay / issue;
- célzott szerepkörök: CASHIER, GOODS_RECORDER, WAREHOUSE_ISSUER;
- Commerce Order list/detail/create/status API;
- `legacy-bridge` API és mapper a jelenlegi `AruterOrder` objektumokhoz;
- legacy státuszok: `sent_to_cashier` → `SENT_TO_CASHIER`, `paid` → `PAID`, `issued` → `ISSUED`;
- legacy egységek, nettó ár, ÁFA és storageZone snapshotként átvihetők.

Tesztkapu a DEV apply előtt:
- Order Core contract: 30/30 PASS;
- Order DB transaction + rollback acceptance: 17/17 PASS;
- teljes payload idempotency mismatch teszt: PASS;
- legacy snapshot tétel Product/Variant mapping nélkül: PASS;
- SENT_TO_CASHIER → PAID → ISSUED state machine: PASS;
- authenticated RPC: DENY; service-role RPC: ALLOW;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- migration preflight: PASS;
- migration SHA-256: `dcb720b6e7842bd19cd8ecff09becb648feea34159a45122745b7298f2dce1e1`.

34. pont szerinti állapot:
- elkészült: shared Order domain skeleton, cashier workflow state machine, API és legacy mapper/bridge;
- részben elkészült: legacy Árutér dual-write/mirror még nincs bekapcsolva; Order ↔ Inventory Reservation kapcsolat csak mezőszinten előkészített;
- hiányzik: resolved variant automatikus készletfoglalás, cancel release, issued consume, cashier Commerce UI bekötés, teljes pilot E2E;
- DB/migration: 0.1.6 staged, még nincs DEV-re alkalmazva ebben a checkpointban;
- ismert tech debt: unmapped legacy tétel `UNRESOLVED` marad, ezt a pénztárban később figyelmeztetéssel kell jelezni; nem blokkolhatja a rendelés láthatóságát;
- következő blokk: coordinated DEV apply + runtime E2E, majd Order ↔ Reservation bridge;
- becsült aktív idő: Order DEV apply/runtime 1–2 óra; Reservation bridge 4–7 óra; cashier UI kontrollált bekötés 3–5 óra.

PROD változatlan; shared DEV runtime cutover nem történt.

### 2026-08-18 23:49 checkpoint — Order Core 0.1.6 DEV aktív

A staged Shared Order Core migráció coordinated DEV művelettel sikeresen alkalmazva.

DEV migráció:
- Commerce schema: `0.1.6`, migration count: 7;
- migration SHA-256: `dcb720b6e7842bd19cd8ecff09becb648feea34159a45122745b7298f2dce1e1`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-order-core-m1/20260818T214758Z/supabase-dev-pre-commerce-order-core-m1.dump`;
- backup SHA-256: `f95e6b114d3bf9a8271f16769539bb630a7f05031bcab7029bf9e77a30c5a60b`;
- schema/security verify: PASS;
- authenticated create/status RPC: DENY; service-role create/status RPC: ALLOW.

Valós DEV Order runtime E2E:
- 14/14 PASS;
- külső piactéri rendelés `SENT_TO_CASHIER` állapotban létrejön;
- azonos create payload replay idempotens;
- ugyanaz a kulcs eltérő teljes payload esetén elutasítva;
- központi cashier queue látja a külső rendelést;
- nem map-elt legacy tételsnapshotok `UNRESOLVED` állapotban is olvashatók;
- cashier `PAID` + CARD + pénztáros rögzítés: PASS;
- PAID replay idempotens;
- PAID rendelés a cashier queue-ban marad;
- `ISSUED` + kiadó rögzítés: PASS;
- ISSUED rendelés kikerül az aktív cashier queue-ból;
- append-only status ledger SENT_TO_CASHIER → PAID → ISSUED: PASS;
- audit + outbox: PASS;
- runtime cleanup: PASS.

Legacy Árutér cashier regresszió továbbra is kötelező; a meglévő store/UI nincs lecserélve. Következő blokk: resolved Commerce variantok Order ↔ Inventory Reservation kapcsolata. M1 szabály: PAID állapotban a foglalás megmarad, fizikai készlet csak ISSUED esetén fogy; CANCELLED esetén a foglalás felszabadul. A legacy `UNRESOLVED` tétel láthatóságát ez nem blokkolhatja.

PROD változatlan; shared DEV runtime cutover nem történt.

### 2026-08-18 23:55 checkpoint — Order ↔ Inventory Reservation Bridge M1 staged

Elkészült kódszinten:
- Order `fulfillment_source_id` előkészítés belső készletforráshoz;
- explicit `commerce_order_reserve_inventory` service-only RPC;
- mapped Commerce variant tétel készletfoglalása a meglévő Reservation motoron keresztül;
- legacy/unmapped tétel nem blokkolja a rendelés láthatóságát, `UNRESOLVED` marad;
- OrderItem `reservation_id` + `RESERVED` státusz;
- Order inventory event ledger és idempotens reserve művelet;
- reserve idempotencia source + expiry eltérésre is védett;
- PAID állapotban a foglalás megmarad;
- ISSUED csak teljes, aktív mapped reservation mellett engedélyezett, majd a reservation CONSUME fizikai készletet csökkent;
- CANCELLED esetén aktív reservation automatikusan RELEASE, a fizikai készlet változatlan;
- teljesen unresolved legacy rendelés továbbra is végigmehet PAID → ISSUED állapotig;
- új `POST /api/v1/commerce/orders/[orderId]/reserve` API;
- repository szinten `commerce.order.write` + `commerce.inventory.move` jogosultság szükséges.

Tesztkapu DEV apply előtt:
- Order Inventory Bridge contract: 27/27 PASS;
- DB transaction + rollback acceptance: 20/20 PASS;
- mapped + unresolved vegyes rendelés: PASS;
- reserved balance invariáns: PASS;
- PAID nem fogyaszt készletet: PASS;
- ISSUED consume: PASS;
- CANCELLED release: PASS;
- mapped, de nem foglalt PAID rendelés kiadása blokkolt: PASS;
- unresolved-only legacy rendelés nem blokkolt: PASS;
- authenticated reserve RPC DENY, service-role ALLOW;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS;
- migration preflight: PASS;
- migration SHA-256: `edb44dba30646aae6230d7fbe8b0cd3141ea3d3157550b2e0f60cb8d0813d4ec`.

34. pont szerinti állapot:
- elkészült: Order ↔ Reservation DB/service/API alap és M1 készlet-életciklus szabály;
- részben elkészült: automatikus variant/SKU feloldás a legacy bridge-ben és automatikus reserve trigger az Árutér dual-write során;
- hiányzik: Commerce cashier UI tényleges bekötés, legacy dual-write, lejáró reservation worker, mapped/unmapped figyelmeztetés a pénztári UI-ban;
- DB/migration: 0.1.7 staged, még nincs DEV-re alkalmazva ebben a checkpointban;
- következő lépés: coordinated DEV apply → runtime E2E → cashier bridge következő integrációs réteg;
- PROD változatlan.

### 2026-08-19 00:03 checkpoint — Legacy Árutér SKU resolution bridge

Elkészült:
- a legacy Árutér Order bridge opcionálisan Commerce Product/Variant azonosítást végez SKU alapján;
- készletmapping csak akkor aktív, ha kontrollált `fulfillmentSourceId` is rendelkezésre áll;
- forrás nélkül a legacy tétel snapshot-only / UNRESOLVED marad, így a jelenlegi pénztári láthatóság nem kerül veszélybe;
- azonosításkor a matched identifier variant az elsődleges, majd aktív variant fallback;
- map-elt order esetén a bridge a reserve műveletet a PAID/ISSUED státusz replay előtt futtatja;
- DRAFT és CANCELLED legacy import nem kényszerít foglalást;
- bridge válaszban mapped/unresolved darabszám és reservation eredmény is megjelenik.

Tesztkapu:
- legacy resolution contract: 16/16 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

A 0.1.7 Order Inventory Bridge DEV apply továbbra is a központi build lock felszabadulására vár. PROD változatlan.
