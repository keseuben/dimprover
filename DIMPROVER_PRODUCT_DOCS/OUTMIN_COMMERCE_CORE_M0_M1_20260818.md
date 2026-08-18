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
- 18 acceptance ellenőrzés.

**Részben elkészült:**
- M0 tenant/authz: DB RLS olvasási határ megtervezve, szerver API permission enforcement még készül;
- M1 Product Engine: domain + resolver alap kész, repository/CRUD/API még készül;
- Inventory Engine: domain/invariant kész, tranzakciós ledger writer + balance rebuild még készül;
- Media Engine: adatmodell skeleton kész, képfeldolgozó pipeline még nincs implementálva;
- Pricing: csak alap Price entitás, teljes Pricing Engine későbbi milestone.

**Még hiányzik:**
- Commerce context server resolver és `/api/v1/commerce/context`;
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
- még nincs új runtime API aktiválva; következő blokk.

**UI:**
- a meglévő Árutér UI változatlan;
- új Commerce admin UI még nincs rákötve, így nincs regressziós kockázat a jelenlegi felületen.

**Tesztek:**
- tsc: PASS
- lint: PASS (új Commerce scope)
- build: következő quality gate-nél
- smoke: runtime API/UI után
- acceptance: 18/18 PASS

**Ismert hibák / technikai adósság:**
- a régi `AruterProduct.stockQuantity` legacy modell továbbra is létezik a régi Árutér kódban; nem lett átírva, az új Commerce Core nem használja;
- SQL bootstrap előtt DEV DB schema/migration gate szükséges;
- Product/Variant/category relációknál a server service-ben kötelező lesz explicit organizationId ellenőrzés service-role használat esetén is;
- készlet ledger tranzakciós balance-frissítés még nincs implementálva.

**Következő fejlesztési blokk:**
1. Commerce server context + permission guard;
2. Product repository/service + CRUD;
3. identifier resolve API;
4. DEV migration gate;
5. Termékek admin UI első letisztult grid + inspector.

**Becsült következő fejlesztési ráfordítás:** 4–7 aktív fejlesztési óra a context + Product CRUD/API + első DB gate szintig.

## Készültség
- M0 Core + DB baseline: kb. 35%
- M1 Product + Media + Inventory: kb. 15%
- teljes Pilot: kb. 5%
