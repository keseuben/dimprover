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

### 2026-08-19 00:06 checkpoint — Commerce központi pénztár UI skeleton

Elkészült új, párhuzamos Commerce adminfelület:
- `/aruter/admin/penztar` — a legacy `/aruter/penztar` változatlanul megmaradt;
- közös Commerce cashier queue SENT_TO_CASHIER + PAID rendelésekkel;
- Külső Árutér forrás egyértelmű badge-dzsel;
- kosártétel-snapshotok: terméknév, SKU, mennyiség, raktárhely, nettó/bruttó összeg;
- UNRESOLVED legacy tétel figyelmeztetést kap, de nem tűnik el a pénztárból;
- RESOLVED / RESERVED / CONSUMED készletállapot megjelenítés;
- jogosultságvezérelt reserve, pay és issue kezelősáv;
- készletforrás-választás és Order reserve API bekötés előkészítve;
- CARD / CASH / TRANSFER / LATER fizetési mód;
- külön `commerce.order.pay` és `commerce.order.issue` UI gate;
- a Termékek adminból külön Pénztár navigáció.

Tesztkapu:
- Commerce Cashier UI contract: 20/20 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

A Commerce pénztár még nem váltotta le a legacy pénztárat, és shared DEV runtime cutover nem történt. A 0.1.7 készletfoglalási bridge DEV apply szükséges a reserve/issue teljes runtime E2E előtt. PROD változatlan.

### 2026-08-19 00:12 checkpoint — Order Inventory Bridge 0.1.7 runtime zöld

A 0.1.7 bridge tényleges DEV runtime-on ellenőrizve, és a korábbi QA fixture biztonságosan semlegesítve maradt auditálható módon: aktív rendelés nem maradt a pénztári sorban, a tesztkészlet nullára lett állítva StockMovement ADJUSTMENT-tel, a QA termék/variant/raktár/forrás archiválva lett. Destruktív adatbázis-törlés nem történt.

Valós DEV runtime E2E, önsemlegesítő QA életciklussal:
- Order Inventory Bridge runtime: 14/14 PASS;
- fizikai készlet ledgeren indítva: PASS;
- mapped + unresolved vegyes külső rendelés: PASS;
- csak mapped tétel foglalódik: PASS;
- reserve replay idempotens: PASS;
- physical / reserved / available invariáns: PASS;
- PAID nem fogyaszt fizikai készletet: PASS;
- ISSUED reservation consume: PASS;
- mapped item CONSUMED, legacy item UNRESOLVED marad: PASS;
- mapped PAID rendelés reservation nélkül nem adható ki: PASS;
- order inventory event ledger: PASS;
- QA rendelések terminális állapotba kerülnek: PASS;
- QA készlet nullázva auditált StockMovementtel: PASS;
- QA product/source/warehouse archiválva: PASS;
- QA rendelések nincsenek aktív cashier queue-ban: PASS.

Teljes célzott regresszió:
- Order Core contract: 30/30 PASS;
- Order Inventory Bridge contract: 27/27 PASS;
- Legacy SKU resolution bridge: 16/16 PASS;
- Commerce Cashier UI: 20/20 PASS;
- Inventory contract: 16/16 PASS;
- Reservation contract: 18/18 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- Commerce schema/security verify: 0.1.7 / 8 migráció PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- elkészült: Product/Catalog/Pricing/Media/Inventory/Reservation/Receiving/Shared Order Core/Order↔Reservation backend alap, Commerce cashier UI skeleton és legacy SKU resolver bridge;
- részben elkészült: legacy Árutér tényleges feature-flagelt dual-write/mirror; teljes cashier böngészős E2E; reservation expiry worker;
- hiányzik: kontrollált legacy mirror bekapcsolás, Storefront Pilot teljes Commerce Order átállás, Connector/NaturaSoft és későbbi POS réteg;
- DB: Commerce 0.1.7, 8 migráció;
- API: Order create/list/detail/status/reserve + legacy bridge aktív kódszinten;
- UI: új `/aruter/admin/penztar` elkészült, legacy `/aruter/penztar` változatlan;
- ismert hiba: jelen checkpointban nincs nyitott Order/Reservation backend regresszió; a shared DEV runtime még nem erre a forráspontra van cutoverelve;
- következő lépés: tiszta candidate build erről a checkpointról, majd feature-flagelt legacy mirror előkészítés;
- becsült aktív idő: candidate build + smoke 1–2 óra; legacy mirror 3–5 óra; cashier browser E2E 2–4 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 00:48 checkpoint — Legacy Árutér → Commerce fail-open mirror staged

Elkészült a meglévő Árutér működését megőrző, kontrollált Commerce Order mirror első integrációs rétege.

Működési szabály:
- a legacy Árutér rendelés és státuszváltozás továbbra is ELŐSZÖR a meglévő repository-ban készül el;
- a Commerce mirror csak feature flaggel kapcsolható be: `ARUTER_COMMERCE_ORDER_MIRROR_ENABLED=1`;
- alapállapotban kikapcsolva marad (`0`);
- a Commerce mirror Next.js `after()` callbackben fut, ezért nem része a legacy API válasz kritikus útjának;
- Commerce hiba esetén a legacy rendelés/pénztár eredménye nem fordul vissza és nem lesz hibás válasz;
- mirror hiba strukturált `[ARUTER_COMMERCE_MIRROR]` szervernaplóval rögzül;
- opcionális `ARUTER_COMMERCE_FULFILLMENT_SOURCE_ID` mellett SKU/Variant feloldás + készletfoglalás is kérhető;
- fulfillment source nélkül a mirror nem kényszerít készletfoglalást, az unmapped legacy tétel továbbra is snapshotként megmarad;
- create/reserve/status mirror műveletek stabil legacy order-alapú idempotency kulcsokat használnak.

Érintett fő fájlok:
- `app/lib/aruter/commerceMirror.ts`
- `app/api/aruter/orders/route.ts`
- `app/api/aruter/orders/[orderId]/status/route.ts`
- `app/lib/aruter/aruter-env.example`
- `scripts/commerce-legacy-mirror-contract.mjs`

Tesztkapu:
- fail-open mirror contract: 22/22 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott lint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- elkészült: feature-flagelt, post-response fail-open legacy → Commerce Order mirror alap;
- részben elkészült: tényleges DEV flag-bekapcsolás és böngészős dual-write E2E még nincs végrehajtva;
- hiányzik: tartós mirror health/admin státusz, retry/reconciliation queue, böngészős cashier mirror E2E;
- DB/migration: nincs új DB migráció ebben a blokkban, Commerce továbbra is 0.1.7 / 8;
- API: legacy create/status route adapterrel bővült, legacy válaszszerződés változatlan;
- UI: nincs legacy UI-csere, `/aruter/penztar` változatlan;
- ismert tech debt: a strukturált mirror failure jelenleg szerverlog alapú; tartós reconciliation státusz későbbi blokk;
- következő blokk: candidate build/smoke, majd DEV-only feature flaggel kontrollált mirror E2E;
- becsült aktív idő: build + smoke 1–2 óra; mirror E2E + reconciliation alap 2–4 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 01:10 checkpoint — 2df7b74 candidate build PASS

A 2df7b74 legacy Árutér → Commerce fail-open mirror checkpoint teljes Next.js candidate buildje sikeresen elkészült.

Build eredmény:
- source commit: `2df7b7479edd885f99f587e9e2c56bc537640b3e`;
- branch: `feature/outmin-commerce-core-m0-m1-20260818`;
- build ID: `l4utaJJATPZ4Jzw7eu5RP`;
- coordinated build exitCode: `0`;
- build művelet: 2026-08-19 01:00:38–01:09:35 CEST;
- standalone output: jelen van;
- `.dimpro-release.json`: build ID, commit és branch egyezés ellenőrizve.

Candidate manifest smoke:
- `/aruter/penztar`: route manifestben PRESENT;
- `/aruter/admin/penztar`: route manifestben PRESENT;
- `/api/v1/commerce/orders`: route manifestben PRESENT;
- `/api/v1/commerce/context`: route manifestben PRESENT.

Regresszió/kapuk a build után:
- legacy mirror contract: 22/22 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- elkészült: 2df7b74 candidate build + release meta + manifest smoke;
- részben elkészült: külön, élő HTTP candidate runtime smoke még hátravan; shared DEV cutover nem történt;
- hiányzik: DEV-only feature-flag mirror E2E, cashier böngészős E2E, tartós mirror reconciliation;
- DB/migration: nincs új migráció, Commerce schema továbbra is 0.1.7 / 8;
- API/UI: buildbe bekerült a feature-flagelt fail-open bridge, legacy pénztár változatlan;
- ismert tech debt: mirror hibaállapot még szerverlog-alapú, tartós reconciliation státusz nincs;
- következő blokk: kontrollált DEV mirror E2E előkészítése, majd reconciliation alap;
- becsült aktív idő: mirror E2E 1–2 óra, reconciliation alap 2–4 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 07:xx checkpoint — Mirror Reconciliation M1 DEV aktív

A legacy Árutér → Commerce Order fail-open mirror tartós health/reconciliation rétege elkészült és DEV adatbázisban aktiválva lett.

Elkészült:
- új tenant-scoped `commerce_order_mirror_attempts` tábla;
- PENDING / SUCCEEDED / FAILED állapotmodell;
- próbálkozásszám, utolsó hiba, következő retry időpont, Commerce order kapcsolat, mapped/unresolved darabszám;
- legacy order snapshot tárolása kontrollált újrapróbáláshoz;
- service-only `commerce_order_mirror_record` RPC advisory transaction lockkal;
- sikertelen és sikeres mirror esemény audit + transactional outbox;
- külön `commerce.order.reconcile` jogosultság; OWNER / ADMIN / MANAGER / STORE_MANAGER kapja meg;
- tenant-scoped reconciliation lista API: `GET /api/v1/commerce/mirror/reconciliation`;
- explicit retry API: `POST /api/v1/commerce/mirror/reconciliation/:attemptId/retry`;
- már sikeres attempt újrapróbálása tiltott;
- friss PENDING attempt 2 perces párhuzamos retry-védelemmel rendelkezik;
- automatikus legacy mirror a Commerce művelet előtt PENDING állapotot rögzít, majd SUCCEEDED/FAILED állapotot;
- a mirror továbbra is fail-open: a Commerce/reconciliation hiba nem ronthatja el a legacy Árutér API válaszát.

DEV adatbázis:
- Commerce schema: `0.1.8`;
- migration count: `9`;
- migráció: `supabase/migrations/20260819073000_dimpro_commerce_order_mirror_reconciliation_m1.sql`;
- rollback: `supabase/rollback/DIMPRO_COMMERCE_ORDER_MIRROR_RECONCILIATION_M1_ROLLBACK.sql`;
- migration SHA-256: `c9cd46b8b9757c13a23da3a319bd3c0d5d70d09db5c93eb060d21eda95653b2a`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-order-mirror-reconciliation-m1/20260819T052926Z/supabase-dev-pre-commerce-order-mirror-reconciliation-m1.dump`;
- backup listing verify: PASS;
- schema/security verify: authenticated table access DENY, authenticated RPC EXECUTE DENY, service-role table/RPC ALLOW.

Tesztkapuk:
- mirror reconciliation contract: 26/26 PASS;
- migration/rollback acceptance: 17/17 PASS;
- valós DEV repository/DB runtime E2E: 13/13 PASS;
- legacy mirror contract: 22/22 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

Runtime E2E ellenőrizte:
- PENDING persistálás és attemptCount=1;
- FAILED állapot + retry időpont;
- tenant-scoped FAILED lista;
- új retry attemptCount növelés;
- stable legacy idempotency kulcsos Commerce Order létrehozás;
- SUCCEEDED → Commerce Order kapcsolat;
- hiba/backoff mezők törlése siker után;
- tenant isolation;
- FAILED + SUCCEEDED audit;
- FAILED + SUCCEEDED outbox;
- final state replay nem növeli tévesen az attemptCount értéket;
- QA attempt archiválás.

34. pont szerinti állapot:
- elkészült: tartós mirror health/reconciliation backend, DB schema, API és manuális retry foundation;
- részben elkészült: tényleges böngészős legacy → Commerce feature-flag mirror E2E még hátravan;
- hiányzik: reconciliation admin UI, automatikus retry worker, teljes cashier browser E2E, Storefront Pilot Commerce átállás;
- fő fájlok: `app/lib/aruter/commerceMirror.ts`, `app/lib/commerce/order/mirrorReconciliation.ts`, mirror reconciliation API route-ok, 0.1.8 migráció/gate/acceptance/runtime E2E;
- DB/migration: 0.1.8 / 9, backup + rollback rendelkezésre áll;
- API: reconciliation list + retry elkészült;
- UI: ebben a blokkban nem változott;
- ismert tech debt: context resolution előtti mirror hiba továbbra is csak strukturált szerverlogban rögzíthető, mert még nincs hitelesített organization context;
- következő blokk: teljes candidate build + HTTP smoke, majd kontrollált DEV feature-flag mirror browser/API E2E;
- becsült aktív következő idő: build/smoke 1–2 óra; feature-flag mirror E2E 1–3 óra; reconciliation admin UI 2–4 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 07:xx checkpoint — Mirror Reconciliation admin UI

Elkészült a letisztult Commerce admin egyeztetési felület:
- új oldal: `/aruter/admin/egyeztetes`;
- FAILED / PENDING / SUCCEEDED összesítő kártyák;
- szűrhető mirror eseménylista;
- legacy rendelés státusz, próbálkozásszám, mapped/unresolved tételszám;
- Commerce order kapcsolat, utolsó próbálkozás és következő retry időpont;
- hiba kód + felhasználóbarát hibaüzenet;
- jogosultságos kézi újrapróbálás;
- sikeres attemptnél a retry gomb eltűnik és sikerállapot jelenik meg;
- a központi pénztár fejlécében az `Egyeztetés` link csak `commerce.order.reconcile` jogosultsággal látható;
- a felület külön jelzi, hogy a legacy Árutér működés elsődleges és a Commerce mirror hibája nem fordítja vissza a pénztári műveletet.

Tesztkapuk:
- reconciliation UI acceptance: 18/18 PASS;
- reconciliation backend contract: 26/26 PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- elkészült: reconciliation backend + admin UI + manuális retry;
- részben elkészült: teljes böngészős feature-flag mirror E2E még hiányzik;
- hiányzik: automatikus retry worker, teljes cashier browser E2E, Storefront Pilot Commerce átállás;
- UI: `/aruter/admin/egyeztetes` új, pénztárból jogosultságosan elérhető;
- következő blokk: legfrissebb candidate build + HTTP smoke, majd DEV-only feature-flag mirror E2E;
- becsült aktív idő: 2–4 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 07:xx checkpoint — Esedékes mirror retry admin batch

Elkészült az egyeztetési modul kontrollált kötegelt újrapróbálása:
- tenant-scoped `FAILED` attempt lekérdezés;
- csak `next_retry_at <= now()` tételek kerülnek a kötegbe;
- legrégebbi retry időpont szerinti sorrend;
- maximum 25 tételes backend limit, admin UI alapból 10 tételt kér;
- ugyanazt az idempotens single-retry útvonalat használja minden tételhez;
- egy sikertelen elem nem szakítja meg a teljes köteget;
- részleges siker esetén HTTP 207 + requested/succeeded/failed összesítő;
- új admin gomb: `Esedékesek újrapróbálása`;
- a művelet Commerce session + `commerce.order.reconcile` jogosultság mögött marad.

Tesztkapuk:
- due retry contract: 15/15 PASS;
- reconciliation admin UI: 20/20 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- elkészült: kézi egyedi és kötegelt reconciliation retry;
- részben elkészült: automatikus service worker még nincs, mert külön worker-identitás/secret szerződést kell rögzíteni;
- hiányzik: teljes feature-flag browser E2E és automatikus retry scheduler/worker;
- DB: nem igényelt új migrációt, schema marad 0.1.8 / 9;
- API: új `POST /api/v1/commerce/mirror/reconciliation/retry-due`;
- UI: az egyeztetési fejlécből indítható a max. 10 esedékes tétel kontrollált újrapróbálása;
- következő blokk: candidate build/smoke, majd DEV-only feature-flag mirror E2E.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 07:xx checkpoint — Legacy mirror lifecycle runtime E2E

A tényleges mirror service lifecycle valós DEV adatbázison végigtesztelve:
- `sent_to_cashier` → Commerce `SENT_TO_CASHIER`;
- ugyanazon legacy rendelés `paid` frissítése ugyanazt a Commerce ordert használja és `CARD` fizetést rögzít;
- `issued` frissítés ugyanazt a Commerce ordert viszi `ISSUED` állapotba;
- a nem azonosított legacy tétel `UNRESOLVED` marad és nem blokkolja a pénztári életciklust;
- három lifecycle mirror hívásból pontosan egy aktív Commerce order jön létre;
- reconciliation állapot `SUCCEEDED`, attemptCount=3, legfrissebb legacy snapshot=`issued`;
- PAID/ISSUED státuszesemények, mirror audit és outbox események rögzülnek;
- terminális ISSUED rendelés kikerül az aktív cashier queue-ból;
- hibás tenanttal kiváltott Commerce hiba strukturált fail-open eredményt ad és nem dob kezeletlen kivételt;
- QA attempt és QA Commerce order a teszt végén archiválva.

Valós DEV runtime E2E: 14/14 PASS.

Kiegészítő javítás:
- a due-batch result TypeScript union kezelése explicit `errorCode in result` guardot kapott, így standalone/egyedi TS fordításban is típusbiztos.

34. pont szerinti állapot:
- elkészült: service-level teljes legacy mirror lifecycle E2E;
- részben elkészült: HTTP/session/Next `after()` feature-flag E2E candidate runtime-on még hátravan;
- hiányzik: shared DEV feature flag tartós aktiválása — ezt továbbra sem kapcsoljuk be a candidate bizonyítás előtt;
- DB: 0.1.8 / 9 változatlan;
- teszt: `scripts/commerce-legacy-mirror-runtime-e2e.ts` 14/14 PASS;
- következő lépés: `c6a68ca` utáni legfrissebb commit candidate build + külön HTTP smoke.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 07:xx checkpoint — HTTP/session mirror E2E harness staged

Elkészült a candidate runtime-ra szánt teljes HTTP/session E2E harness:
- ideiglenes DEV Supabase auth user + DIMPRO identity + ADMIN organization membership;
- valós SSR auth cookie előállítás;
- Commerce context + `commerce.order.reconcile` ellenőrzés;
- legacy `POST /api/aruter/orders` → Next `after()` → Commerce reconciliation polling;
- külső rendelés megjelenése a Commerce cashier queue-ban;
- legacy `paid` és `issued` státusz API-k végigvezetése;
- ugyanazon Commerce order újrahasználata és `UNRESOLVED` tétel non-blocking ellenőrzése;
- terminális rendelés cashier queue-ból kikerülése;
- `/aruter/admin/egyeztetes` és legacy `/aruter/penztar` route ellenőrzés;
- Commerce QA rekordok archiválása és ideiglenes identity/auth fixture törlése.

A harness szerződéses ellenőrzése: 17/17 PASS.
A tényleges HTTP E2E futtatás a legfrissebb Outmin candidate build elkészülte után történik, `ARUTER_COMMERCE_ORDER_MIRROR_ENABLED=1` kizárólag a külön candidate processben.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 10:xx checkpoint — Commerce numerikus schema conformance v0.1.9 előkészítve

A Commerce Core kötelező adatmodell-szabályainak auditja valós DEV `information_schema` alapján kimutatta, hogy a korábbi pilot migrációkban maradtak `NUMERIC(20,6)` mennyiségek és `bigint` alapú, `_minor` nevű pénzmezők. Ez ellentétes a rögzített Commerce hard rule-lal, ezért új funkció helyett előbb forward hardening migráció készült.

Elkészült:
- canonical money: `NUMERIC(19,4)`;
- canonical quantity: `NUMERIC(19,6)`;
- `commerce_prices.amount_minor` → `amount NUMERIC(19,4)`;
- `commerce_goods_receipt_items.unit_cost_minor` → `unit_cost NUMERIC(19,4)`;
- `commerce_order_items.price_net_minor` → `price_net NUMERIC(19,4)`;
- inventory, reservation, receiving, order és external snapshot mennyiségek `NUMERIC(19,6)`;
- generated `available_quantity` és `remaining_quantity` `NUMERIC(19,6)`;
- exact TypeScript `normalizeMoney` / `normalizeQuantity` precision gate;
- Pricing / Product summary / Receiving / Order repository és admin UI canonical mezőkre átállítva;
- legacy input aliasok (`amountMinor`, `unitCostMinor`, `priceNetMinor`) átmenetileg csak bemeneti kompatibilitási fallbackként maradnak, új output és DB mező már canonical;
- fresh bootstrap is a canonical `NUMERIC(19,4)` / `NUMERIC(19,6)` szabályt használja;
- rollback fail-closed, ha a 0.1.9 után tört pénzérték kerül be, amelyet a régi bigint modell már nem tudna veszteség nélkül visszaállítani.

Új fájlok:
- `supabase/migrations/20260819104500_dimpro_commerce_schema_conformance_v019.sql`;
- `supabase/rollback/DIMPRO_COMMERCE_SCHEMA_CONFORMANCE_V019_ROLLBACK.sql`;
- `scripts/commerce-schema-conformance-v019-contract.mjs`;
- `scripts/commerce-schema-conformance-v019-db-rollback-acceptance.mjs`;
- `scripts/commerce-schema-conformance-v019-migration-gate.mjs`.

QA:
- schema conformance contract: 25/25 PASS;
- forward → verify → rollback → outer rollback valós DEV DB acceptance: 15/15 PASS;
- migration gate preflight: PASS;
- Commerce statikus regresszió: minden futtatott Product/Catalog/Pricing/Inventory/Reservation/Media/Receiving/Order/Cashier/Mirror csomag PASS;
- legacy Árutér → központi pénztár regresszió: 10/10 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- FEJLESZTÉSI ÁLLAPOT: KÓDOLÁS ALATT, numerikus hardening release-candidate kész;
- Modul: Commerce Core M0/M1 schema conformance;
- Elkészült: kód + forward migráció + rollback + gate + statikus és tranzakciós acceptance;
- Részben elkészült: DEV apply és post-migration runtime E2E még hátravan;
- Még hiányzik: új candidate build + HTTP/session mirror E2E a 0.1.9 kóddal; reservation expiry/cleanup csak ezután;
- DB/migration: jelen pillanatban a tényleges DEV továbbra is 0.1.8 / 9, a 0.1.9 / 10 migráció még nincs alkalmazva;
- API/UI: canonical money mezőnevek stagingben elkészültek;
- ismert tech debt: régi, már alkalmazott migrációs történet megőrzi a korabeli mezőneveket; a végállapotot forward conformance migráció korrigálja. A soft-delete `deleted_at` canonicalizálása külön hardening blokk marad, mert a jelenlegi Commerce pilot több helyen még `archived_at` kompatibilitási mezőt használ;
- következő blokk: DEV backup + 0.1.9 apply + verify + Pricing/Inventory/Reservation/Receiving/Order/Mirror runtime regresszió + candidate build;
- becsült következő aktív idő: 1–2 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 11:xx checkpoint — Commerce 0.1.9 DEV aktiválva + teljes mirror candidate E2E zöld

A numerikus schema conformance ténylegesen aktiválva lett kizárólag DEV-en.

DEV migráció:
- Commerce schema: `0.1.9`;
- migration count: `10`;
- migration SHA-256: `b98323c7f0826b69b6f837ff1f8707f3958bb1fbfbce881dce926654e601d396`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-schema-conformance-v019/20260819T090240Z`;
- backup dump SHA-256: `e8e6a6bf93b23ade92c0edb3761b4764a553683d940e44e30e62ca8d7ab4a30f`;
- backup listing: VERIFIED;
- post-apply gate verify: PASS;
- canonical monetary mezők: `amount`, `unit_cost`, `price_net` → `NUMERIC(19,4)`;
- ellenőrzött készlet/rendelés mennyiségek → `NUMERIC(19,6)`;
- régi `_minor` DB oszlopok: nincsenek a 0.1.9 végállapotban.

Post-migration runtime regresszió:
- Pricing: 8/8 PASS, beleértve tört `NUMERIC(19,4)` értéket és direct service mutation tiltást;
- Inventory Reservation: 11/11 PASS;
- Receiving: 12/12 PASS;
- Order Core: 14/14 PASS;
- Order ↔ Inventory Bridge: 14/14 PASS;
- Mirror Reconciliation: 13/13 PASS;
- legacy mirror lifecycle: 14/14 PASS.

Candidate build:
- source commit: `a664b8d`;
- dist: `.next-commerce-schema-v019-a664b8d`;
- Build ID: `Fnzq-woxoq3dHHKruTtoV`;
- Next.js build exitCode: 0 / PASS;
- külön localhost candidate runtime: `127.0.0.1:3288`;
- a mirror feature flag csak ebben a külön candidate processzben volt `1`;
- candidate process a teszt után leállítva; 3288 port felszabadítva;
- candidate logban uncaught/unhandled/fatal/error találat: 0.

Teljes HTTP/session mirror E2E candidate runtime-on: 18/18 PASS:
- ideiglenes hitelesített DIMPRO session;
- legacy order HTTP 201;
- Next `after()` mirror → reconciliation `SUCCEEDED`;
- external marketplace order látható a Commerce cashier queue-ban;
- legacy `paid` → ugyanazon Commerce order `PAID`;
- legacy `issued` → ugyanazon Commerce order `ISSUED`;
- `UNRESOLVED` legacy tétel látható marad és nem blokkolja a kiadást;
- ISSUED után a rendelés kikerül az aktív cashier queue-ból;
- reconciliation admin HTTP 200;
- legacy `/aruter/penztar` továbbra is elérhető.

34. pont szerinti állapot:
- FEJLESZTÉSI ÁLLAPOT: DEV KÉSZ a numerikus schema hardening és a feature-flagged mirror candidate bizonyítására;
- Modul: Commerce Core M0/M1 + legacy Árutér mirror/reconciliation;
- Elkészült: schema 0.1.9 apply, backup, verify, runtime regresszió, candidate build, teljes HTTP/session mirror E2E;
- Részben elkészült: a mirror shared DEV feature flag továbbra is OFF, kontrollált cutover külön döntési kapu;
- Még hiányzik: reservation expiry/cleanup worker, soft-delete canonical `deleted_at` hardening, Storefront Pilot következő integrációs lépései;
- DB/migration: 0.1.9 / 10 tényleges DEV állapot;
- API/UI: canonical monetary output aktív a 0.1.9-re épülő candidate-ben;
- ismert tech debt: `archived_at` kompatibilitási modell több Commerce táblában; canonical `deleted_at` külön migrációt igényel;
- következő blokk: Reservation expiry/cleanup service-only, idempotens RELEASE + audit/outbox;
- becsült következő aktív idő: 2–4 óra.

Shared DEV runtime mirror flag nem lett tartósan bekapcsolva. Shared DEV PM2 cutover nem történt ebből a Commerce candidate-ből.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 11:xx checkpoint — Reservation Expiry / Cleanup M1 előkészítve

Új blokk: lejárt `ACTIVE` / `PARTIAL` készletfoglalások kontrollált felszabadítása.

Elkészült:
- új service-only RPC: `commerce_inventory_expire_due_reservations`;
- tenant-scoped, max. 100 foglalás/ciklus;
- organization-szintű advisory lock + `FOR UPDATE SKIP LOCKED`;
- csak `expires_at <= now()`, nem archivált, pozitív remaining foglalás dolgozható fel;
- expiry során csak a reserved készlet csökken, physical készlet változatlan;
- foglalás státusz `EXPIRED`, remaining = 0;
- `EXPIRE` reservation event stabil idempotency kulccsal;
- immutable StockMovement `RESERVATION_RELEASE` stabil reservation-alapú kulccsal;
- kapcsolt Commerce order item `RESERVED` → `RELEASED`, hogy újrafoglalható legyen és ne lehessen lejárt reservationből kiadni;
- audit + transactional outbox `INVENTORY_RESERVATION_EXPIRED`;
- repository szinten `commerce.inventory.move` + `commerce.inventory.adjust` együttes jogosultság szükséges;
- új admin/session API: `POST /api/v1/commerce/inventory/reservations/expire-due`, limit 1–100;
- automatikus scheduler később ugyanazt a service-only RPC-t használhatja; külön worker-secret szerződés még nincs tartósan bekötve.

DB terv:
- target schema: 0.1.10 / 11;
- forward: `supabase/migrations/20260819112500_dimpro_commerce_reservation_expiry_m1.sql`;
- rollback: `supabase/rollback/DIMPRO_COMMERCE_RESERVATION_EXPIRY_M1_ROLLBACK.sql`;
- migration SHA-256: `d9930dbccffe7cbe7b356b64fe70c2d49e538e5d44b2a8bd8bf65508b8205a57`;
- forward → rollback tranzakciós acceptance: PASS, DEV végállapot 0.1.9 / 10 maradt.

QA:
- expiry contract: 27/27 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

34. pont:
- FEJLESZTÉSI ÁLLAPOT: KÓDOLÁS ALATT, migration-ready;
- Elkészült: DB/API/repository/runtime-test kód;
- Részben elkészült: DEV apply és valós expiry runtime E2E;
- Még hiányzik: automatikus ütemezett worker trigger és shared DEV release integráció;
- Következő blokk: backup → 0.1.10 apply → runtime E2E → regresszió → checkpoint.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 11:xx checkpoint — Reservation Expiry / Cleanup M1 DEV aktiválva

A Reservation Expiry / Cleanup M1 ténylegesen aktiválva lett kizárólag DEV-en.

DEV migráció:
- Commerce schema: `0.1.10`;
- migration count: `11`;
- migration SHA-256: `d9930dbccffe7cbe7b356b64fe70c2d49e538e5d44b2a8bd8bf65508b8205a57`;
- pre-migration backup: `/srv/dimpro-dev/backups/commerce-reservation-expiry-m1/20260819T092900Z`;
- backup dump SHA-256: `6e21de8edea7eef5fd9bd8ecb30fce3a54193031819c02520f9295a7c0208bf1`;
- backup méret: kb. 2.9 MB;
- backup listingben ellenőrizve: reservation, reservation event, inventory balance és order item táblák;
- post-apply verify: RPC létezik, authenticated EXECUTE=false, service_role EXECUTE=true, due index=true, EXPIRE action=true.

Valós DEV runtime E2E: 13/13 PASS:
- 10 egység fizikai készlet ledgeren keresztül létrehozva;
- 4 egység rövid lejáratú + 2 egység jövőbeni reservation;
- induló készlet: physical 10 / reserved 6 / available 4;
- cleanup pontosan az egy lejárt reservationt dolgozta fel;
- lejárt reservation: `EXPIRED`, remaining 0, released 4;
- jövőbeni reservation változatlanul `ACTIVE`, remaining 2;
- cleanup után physical 10 / reserved 2 / available 8;
- ismételt cleanup: 0 tétel, tehát idempotens;
- `EXPIRE` esemény StockMovement hivatkozással;
- pontosan egy audit + egy outbox expiry esemény;
- QA készlet nullára semlegesítve, fixture-ek archiválva.

Kapcsolódó regresszió:
- Reservation contract: 18/18 PASS;
- Reservation Expiry contract: 27/27 PASS;
- Order ↔ Inventory Bridge contract: 27/27 PASS;
- Order ↔ Inventory runtime: 14/14 PASS;
- Order Core: 30/30 PASS;
- Cashier UI: 20/20 PASS;
- legacy mirror: 22/22 PASS;
- reconciliation: 26/26 PASS;
- legacy Árutér → központi pénztár: 10/10 PASS;
- TypeScript: PASS;
- célzott ESLint: PASS;
- git diff --check: PASS.

34. pont szerinti állapot:
- FEJLESZTÉSI ÁLLAPOT: DEV KÉSZ;
- Modul: Commerce Inventory Reservation Expiry / Cleanup M1;
- Elkészült: DB, rollback, repository, admin/session API, valós runtime E2E, regresszió;
- Részben elkészült: automatikus időzített worker trigger még nincs; ugyanaz a service-only RPC készen áll worker használatra;
- Még hiányzik: worker-auth/secret szerződés + ütemezés, illetve shared DEV release integráció;
- DB: 0.1.10 / 11;
- API: `POST /api/v1/commerce/inventory/reservations/expire-due`;
- UI: nincs külön új felület; admin/session API kézi kontrollált indításra kész;
- ismert tech debt: `archived_at` soft-delete kompatibilitási modell; canonical `deleted_at` hardening későbbi blokk;
- következő blokk: legfrissebb Commerce candidate build + route smoke, majd worker trigger vagy Storefront Pilot integráció;
- becsült aktív idő: candidate build/smoke 0.5–1 óra; worker trigger 2–4 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.

### 2026-08-19 14:xx checkpoint — Reservation Expiry Worker foundation

A már DEV-aktivált `commerce_inventory_expire_due_reservations` RPC-re elkészült az automatikus worker alap úgy, hogy nem kellett a közös `proxy.ts` fájlhoz nyúlni.

Elkészült:
- közvetlen service-role worker: `scripts/run-commerce-reservation-expiry-worker.mjs`;
- explicit engedélyezési kapu: `DIMPRO_COMMERCE_EXPIRY_WORKER_ENABLED=true`;
- alapból tiltott állapot; tiltva már adatbázis-hozzáférés előtt leáll;
- Commerce schema minimum: `0.1.10 / 11`;
- kizárólag aktív szervezetek feldolgozása;
- alapértelmezett szervezeti batch: 200, hard max: 1000;
- reservation batch szervezetenként: alap 50, hard max 100;
- opcionális `DIMPRO_COMMERCE_EXPIRY_WORKER_ORGANIZATION_ID` kontrollált teszt-/célfuttatáshoz;
- szervezetek szekvenciális feldolgozása, egy szervezet hibája nem rejti el a többi eredményt;
- service secret soha nem kerül a worker outputba; `secretsExposed:false`;
- readiness: `scripts/commerce-reservation-expiry-worker-readiness.mjs`;
- systemd service/timer sablonok az `ops/systemd` mappában;
- timer terv: boot után 3 perc, utána 2 percenként, 15 mp jitter, persistent;
- service hardening: oneshot, UMask 0077, NoNewPrivileges, PrivateTmp, ProtectSystem/Kernel/ControlGroups, 300 mp timeout;
- `DIMPRO_APP_ROOT` segítségével DEV/PROD telepítési gyökér külön konfigurálható.

QA:
- worker contract: 28/28 PASS;
- worker disabled-path runtime: PASS, exit code 2, DB access előtt;
- readiness DEV: schema 0.1.10 / 11, 1 aktív szervezet, service-role környezet elérhető;
- readiness szerint worker enabled=false;
- serviceInstalled=false;
- timerInstalled=false;
- `systemd-analyze verify`: PASS;
- Node syntax: PASS;
- ESLint: PASS;
- git diff --check: PASS.

34. pont:
- FEJLESZTÉSI ÁLLAPOT: KÓD KÉSZ / NEM AKTIVÁLT;
- Modul: Commerce Reservation Expiry Worker foundation;
- Elkészült: runner, readiness, systemd service/timer template, contract;
- Részben elkészült: valós worker runtime csak kontrollált fixture-rel futtatandó;
- Még hiányzik: DEV service/timer telepítés és enable/start; ezt shared release/integráció előtt nem kapcsoljuk be;
- DB: nem igényel új migrációt, a 0.1.10 service-only RPC-t használja;
- API/UI: nem vezet be új publikus API-t vagy UI-t;
- ismert tech debt: a timer telepítése az aktív release gyökérhez kötött activation stepet igényel;
- következő blokk: candidate localhost expiry HTTP E2E, majd kontrollált worker runtime fixture;
- becsült következő aktív idő: 1–2 óra.

PROD változatlan, nem történt PROD alkalmazásmódosítás.
