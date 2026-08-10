# DIMPRO BENJADMIN B3.1 – Control Plane / Operator checkpoint – 2026-08-11

## Cél

A B3 utáni Operator UI fejlesztés kiegészítése a B3.1 iránnyal: stabil, külön Control Plane architektúra előkészítése, START / DEV START / PROD START működési szerződés, tartós fejlesztési állapot és munkanapló, licenc/AI jogosultsági áttekintés, valamint tárhely- és infrastruktúra-telemetria előkészítése.

## Jelenlegi futási állapot

- Aktív DEV runtime: `dimpro-benjadmin-operator-ui-v2-dev`
- DEV port: `3100`
- Worktree: `/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2`
- Branch: `feat/benjadmin-operator-ui-v2`
- PROD: ebben a fejlesztési körben nem módosult.
- A jelenlegi alkalmazás-adatbázis forrása továbbra is a külső Supabase projekt.
- A külön DB VPS `dimpro_dev` adatbázisa jelenleg nem az alkalmazás source-of-truth adatbázisa, ezért oda éles alkalmazásmigráció nem került alkalmazásra.
- A dedikált BENJADMIN Control VPS továbbra is célarchitektúra; a mostani DEV-en ideiglenes embedded read-model fut.

## Operator UI B3.1

Elkészült és DEV-en aktív:

- öt BENJADMIN csapattag portréja: BenjAdmin, BenAI, ÁrminAI, JázminAI, OutminAI;
- 5 másodperces silent refresh teljes oldal újratöltése nélkül;
- Explorer: Fa / Modulok / Fájlok / Változások;
- új `Control` operátori nézet;
- új `Licenc / AI` operátori nézet;
- desktop/tablet/telefon overflow-védelem;
- kompakt felső menü és jobb oldali státuszpanel.

Vizuális korrekció után:
- felső operátori menü: 11 px;
- fejléc státusz pill-ek: 11 px;
- jobb oldali worker név: 11 px;
- jobb oldali worker meta: 10 px;
- jobb oldali környezetnév: 11 px;
- desktop 1440×900: teljes Operator munkatér egy viewportban marad.

## Control Plane read model

Új API:

`GET /api/dev/engine/control-plane`

Új komponens:

`components/admin/BenjadminControlPlanePanel.tsx`

A read model jelenleg megjeleníti:

- célarchitektúra: `CONTROL_VPS`;
- jelenlegi mód: `DEV_EMBEDDED_FALLBACK`;
- START / DEV START / PROD START szerződés;
- élő audit / fejlesztési munkanapló;
- build / release / backup állapotforrások;
- Control Plane és storage telemetry séma-readiness probe-ok.

### START szerződés

`START`
- állapotfelmérés / read-first;
- környezetválasztás előtt nem indít írást.

`DEV START`
- DEV célkörnyezet;
- write/build/test csak a BENJADMIN READY session + scope/worktree védelmi modellje mellett.

`PROD START`
- alapértelmezésben kizárólag READ ONLY;
- önmagában nem ad PROD write, migration, restart vagy deploy jogot;
- éles módosító művelethez külön explicit jóváhagyási objektum szükséges.

## B3.1 Control Plane adatmodell – staged

Új migráció:

`supabase/migrations/20260811005500_benjadmin_control_plane_v031.sql`

Tervezett táblák:

- `dev_center_control_schema_meta`
- `dev_center_start_contexts`
- `dev_center_approvals`
- `dev_center_command_queue`
- `dev_center_decision_memory`
- `dev_center_live_worklog`
- `dev_center_monitor_samples`

Adatbázis-szintű biztonsági szabályok:

- `PROD_START` esetén `write_allowed=false`;
- production command esetén `read` és `monitor` kivételével approval szükséges;
- RLS bekapcsolva;
- anon/authenticated hozzáférés tiltására és service_role hozzáférésre hordozható role-check készült.

Migráció SHA-256:

`1eeb9e4c63e78a507867ec6a524fc31e0a7f3a022e806e8fbc8df661d1dd9e24`

A migráció izolált PostgreSQL dry-run + ROLLBACK tesztje PASS.

Fontos: a migráció a külső Supabase source-of-truth adatbázison még NINCS alkalmazva.

## Storage quota / telemetry – staged

Migráció:

`supabase/migrations/20260810223500_dimpro_storage_quota_telemetry_v010.sql`

Táblák:

- `dimpro_storage_telemetry`
- `dimpro_storage_quota_policies`

A modell külön kezeli:
- felhasznált tárhely;
- kvóta;
- objektumszám;
- feltöltött / törölt / letöltött bytes;
- storage churn;
- network transfer;
- nettó tárhelyváltozás.

A policy csak ajánlást adhat; kvótát automatikusan nem módosíthat explicit jóváhagyás nélkül.

A migráció hordozhatósági javítást kapott:
- `gen_random_uuid()`;
- feltételes anon/authenticated/service_role jogosultságkezelés.

Izolált PostgreSQL dry-run + ROLLBACK: PASS.

A külső Supabase-en a táblák még nem léteznek (`PGRST205`), tehát ez is staged állapot.

## M4 Licenc / AI read model

Új API:

`GET /api/dev/engine/entitlements`

Új komponens:

`components/admin/BenjadminEntitlementsPanel.tsx`

A nézet összevonja:

- központi Identity Core licenceket és moduljogokat;
- Send entitlement állapotot;
- AI entitlement állapotot;
- legacy licenc-store AI budget/usage bridge-et;
- havi AI kérés- és költségösszesítést.

A központi `AI_ASSISTANT` modul az entitlement forrás; a legacy licenc-store csak budget/usage bridge szerepet kap, amíg a teljes központi migráció nem készül el.

## Acceptance

B3.1 Control Plane külön böngészős acceptance:

- 12/12 PASS;
- Control tab PASS;
- 3 START context kártya PASS;
- PROD START READ ONLY PASS;
- CONTROL_VPS cél PASS;
- staged schema pending megjelenítés PASS;
- élő munkanapló PASS;
- 5 mp silent refresh / nincs page reload PASS;
- desktop/tablet/telefon horizontal overflow PASS;
- kompakt 11 px operátori menü PASS.

Teljes Operator UI regresszió:

- 30/30 PASS.

Build:
- PASS;
- build ID: `I0-hnXOiX0gJ0rcBiFitY`.

## Biztonsági megjegyzés

A külön DB VPS-re csak izolált dry-run történt rollbackkel. A DB VPS nem lett átállítva source-of-truth szerepre.

A külső Supabase-en új B3.1 vagy storage migráció nem lett alkalmazva, mert előbb szükséges:
1. a source-of-truth adatbázis célzott mentési/rollback eljárása;
2. a migrációk kontrollált apply folyamata;
3. utána API/UI readiness validáció.

PROD deploy, PROD migration és PROD restart nem történt.

## Következő fejlesztési sorrend

1. Control Plane UI további állapotkártyák és approval/command queue felület.
2. Külső Supabase backup + migration runbook kidolgozása.
3. B3.1 Control Plane és storage telemetry migráció kontrollált alkalmazása a valódi DEV source-of-truth adatbázison.
4. START / DEV START / PROD START szerveroldali context-létrehozás és audit.
5. Command queue + approval executor, fail-closed PROD védelemmel.
6. Élő munkanapló írási API és később SSE.
7. Monitoring mintavétel és trendnézet.
8. Dedikált BENJADMIN Control VPS provisioning és a jelenlegi embedded read-model átköltöztetése.
