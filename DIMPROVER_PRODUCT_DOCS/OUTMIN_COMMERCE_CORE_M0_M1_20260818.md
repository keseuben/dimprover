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
