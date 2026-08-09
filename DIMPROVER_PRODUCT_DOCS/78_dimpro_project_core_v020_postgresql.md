# DIMPRO Projektkapu – Project Core 0.2.0 PostgreSQL átállás

**Dátum:** 2026. augusztus 2.  
**Állapot:** pre-SQL fejlesztési állapot; kézi Supabase SQL futtatásra vár  
**Éles provider:** `file`  
**Cél provider:** `supabase`

## Elkészült

- Közös Project Core repository-választó készült.
- A jelenlegi file-backed tároló külön `fileRepository.ts` adapterként megmaradt.
- Elkészült a szerveroldali Supabase/PostgreSQL adapter.
- Az explicit `supabase` provider hiányzó vagy hibás séma esetén 503 hibával biztonságosan leáll; automatikus file-visszaesés nincs, ezért nem keletkezhet split-brain állapot.
- Elkészült az adatbázis-állapotot és az aktív providert mutató védett health API.
- Elkészült a licencadmin-jogosultságú, egyszer futtatható file-state bootstrap API.
- Az API-k egységes Project Core repository-hibakezelést kaptak.
- A DIMPRO Drop forrása nem módosult.

## Adatbázisobjektumok

Táblák:

- `project_core_schema_meta`
- `project_core_projects`
- `project_core_memberships`
- `project_core_audit_events`
- `project_core_entity_links`

Tranzakciós RPC-k:

- `project_core_create_project_atomic`
- `project_core_update_project_atomic`
- `project_core_add_membership_atomic`
- `project_core_change_lifecycle_atomic`
- `project_core_bootstrap_state`

A táblák RLS-védelemmel készülnek. Az `anon` és `authenticated` szerepkörök közvetlen hozzáférést nem kapnak; az adatkezelés kizárólag szerveroldali `service_role` kapcsolaton keresztül történik.

## Migrációs fájlok

- `supabase/migrations/20260802_project_core_v020.sql`
- `supabase/project_core_v020_bootstrap.sql`
- `supabase/project_core_v020_bootstrap.sql.sha256`

Elvárt sémajelző:

- schema version: `0.2.0`
- migration count: `1`
- bootstrap id: `project-core-v020-20260802`
- SHA-256: `6339db5c5a5cbacca177a3b6d5a0d92a5927e9567ef1e3c9690c06f97f4d37cd`

## Provider-váltási szabály

A `PROJECT_CORE_STORAGE_PROVIDER` környezeti változó értékei:

- hiányzó vagy `file`: a jelenlegi file-backed repository működik;
- `supabase`: kizárólag a PostgreSQL repository működik.

Az átállási sorrend kötelező:

1. SQL alkalmazása a Supabase SQL Editorban.
2. Health ellenőrzés: minden tábla és sémajelző PASS.
3. File-state bootstrap licencadmin API-val.
4. Forrás- és célrekordszámok, projektazonosítók és jogosultságok összehasonlítása.
5. `PROJECT_CORE_STORAGE_PROVIDER=supabase` beállítása a VPS védett env fájljában.
6. Candidate build és teljes Project Core regresszió.
7. PM2 restart csak sikeres ellenőrzés után.
8. A file adapter rollbackként megmarad, de aktív Supabase provider mellett nincs automatikus fallback.

## Pre-SQL teszteredmények

- SQL contract: 19/19 PASS.
- Célzott ESLint: PASS.
- TypeScript: PASS.
- Production build: PASS.
- File provider regresszió, health, jogosultság, bootstrap-tiltás és fail-closed Supabase provider: 10/10 PASS.
- A Supabase kapcsolat konfigurált, de a Project Core táblák jelenleg még nem léteznek: `PGRST205` – ez a pre-SQL állapotban elvárt eredmény.
- A file-backed állapot: 1 projekt, 3 aktív tagság, 1 auditbejegyzés.

## Kézi beavatkozás

A `supabase/project_core_v020_bootstrap.sql` teljes tartalmát kell egyszer lefuttatni a DIMPRO/DIMPROVER Supabase projekt SQL Editorában. A provider még ezután sem vált át automatikusan; előbb a szerveres post-SQL ellenőrzés és a file-state bootstrap következik.

## 2026-08-02 – Post-SQL aktiválás

A felhasználó a `project_core_v020_bootstrap.sql` tartalmát sikeresen lefuttatta a Supabase SQL Editorban. A szerveres health ellenőrzés minden Project Core táblát és a `0.2.0` sémajelzőt megtalálta.

A file-backed állapot sikeresen átkerült PostgreSQL-be:

- projektek: 1 → 1;
- tagságok: 3 → 3;
- eredeti auditbejegyzések: 1 → 1;
- külön bootstrap auditbejegyzés: 1.

A projekt- és tagsági rekordok tartalmi egyezése teljes. A Supabase provider candidate tranzakciós tesztje 11/11 PASS, az éles Supabase provider tesztje 13/13 PASS. A tesztprojektek és kapcsolódó tesztadatok törlésre kerültek.

Az éles provider:

```text
PROJECT_CORE_STORAGE_PROVIDER=supabase
```

Környezeti rollback:

```text
.env.local.before_project_core_supabase_20260802_085929
```

A file repository továbbra is megmaradt dokumentált rollback adapterként, de automatikus fallback nincs.
