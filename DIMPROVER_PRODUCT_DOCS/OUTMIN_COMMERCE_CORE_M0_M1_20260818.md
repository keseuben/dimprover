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
