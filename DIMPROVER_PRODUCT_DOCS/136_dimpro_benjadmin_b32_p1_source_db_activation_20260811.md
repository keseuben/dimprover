# DIMPRO BENJADMIN B3.2 – P1 Source DB aktiválás és lezárás – 2026-08-11

## Állapot

A B3.2 P1 Partner Registry source-of-truth DEV sémája 2026-08-11-én kontrolláltan aktiválásra került. A művelet kizárólag a BENJADMIN DEV Supabase projekten történt. PROD adatbázis-migráció, PROD restart és PROD deploy nem történt.

- Branch: `feat/benjadmin-operator-ui-v2`
- P1 kód checkpoint: `8e0406e`
- Source DB guard checkpoint: `bee8064`
- Partner schema: `0.1.0`
- Generikus Development Center schema: `0.3.0`
- Partner migration: `20260811094500_benjadmin_partner_development_plane_v010.sql`
- Migration SHA-256: `1a4841bf8a1c393271fbc413828d2be9216d771a1d697cd23d6bcdab1b3baf09`

## 1. Céladatbázis azonosítás

A korábbi `SOURCE_DB_PROBE_FAILED` vizsgálatakor igazolódott, hogy a DEV VPS-en tárolt root-only Supabase DEV secret a jelenlegi BENJADMIN DEV alkalmazás Supabase projektjével egyezik.

A közvetlen PostgreSQL kapcsolat SSL-lel sikeresen működik.

A management hoston tárolt korábbi Supabase admin DB credential más projekthez tartozik, ezért azt a source-of-truth DEV migrációhoz nem használtuk.

## 2. PROD szeparáció igazolása

A production `license.dimpro.hu` publikus Identity Core health markerét read-only módban összevetettük a management Supabase admin adatbázis Identity Core markerével.

Az alábbi marker mezők egyeztek:

- component;
- schema version;
- migration count;
- bootstrap ID;
- updated timestamp ugyanazon másodpercben.

Ez igazolta, hogy a management Supabase admin adatbázis a jelenlegi production Identity Core forrása. A DEV Supabase projekt ettől eltérő projekt.

A source DB preflight ezért valós DEV + valós PROD targettel is PASS eredményt adott:

- `targetMatches=true`
- `sharedWithProduction=false`
- generikus prerequisite: 7/7
- generikus schema version: `0.3.0`
- partner schema migráció előtt: absent

## 3. Preflight hardening

A `scripts/benjadmin-b32-source-db-preflight.mjs` javítva lett.

A korábbi egyetlen összetett probe helyett:

1. külön, biztonságos `to_regclass` prerequisite jelenlétvizsgálat fut;
2. csak teljes prerequisite esetén olvassa a `dev-center-engine` schema markert;
3. külön Partner Development Plane readiness probe fut;
4. hiányzó tábla nem általános DB hibaként, hanem pontos fail-closed állapotként kezelhető;
5. a valós engine marker kulcs `dev-center-engine`.

A migráció után a preflight felismeri, hogy a partner schema már jelen van, és nem javasolja annak ismételt alkalmazását.

## 4. Source-of-truth DEV backup

Migráció előtt friss `public` schema adat- és szerkezeti mentés készült a DEV Supabase adatbázisról.

Időpont:

`20260811T091712Z`

DEV root-only mentési tartalom:

- `public_before_partner_v010.dump`
- `public_schema_before_partner_v010.sql`
- `public_before_partner_v010.dump.list`
- `SHA256SUMS`
- `backup-status.env`

Ellenőrzés:

- adatbázisméret a backup előtt: kb. 18.3 MB;
- public base table: 90;
- custom dump: 786 974 byte;
- restore-list entries: 1083;
- SHA-256 ellenőrzés: PASS.

## 5. Külső titkosított backup

A DEV source-of-truth mentés a külön DB/backup VPS-re átkerült hash-ellenőrzéssel, majd a titkosított Restic repository-ba mentésre került.

- Restic snapshot: `cfa3bc0f`
- tagek: `dimpro`, `benjadmin-source-dev`, `pre-partner-v010`
- másolási hash: PASS
- Restic restore próba: PASS
- visszaállított dump hash: PASS

Így a migráció előtt nemcsak lokális dump, hanem külső, titkosított és ténylegesen visszaolvasott rollback pont is rendelkezésre állt.

## 6. DEV source-of-truth migráció

A checksum gate után a partner registry migráció közvetlenül a DEV Supabase source-of-truth PostgreSQL adatbázison futott.

Eredmény:

- migration exit: 0
- transaction: COMMIT
- partner táblák: 7/7
- partner schema marker: `0.1.0`
- migration count: 1
- bootstrap ID: `BENJADMIN-B3.2-P1-20260811`
- raw-secret oszlopok: 0
- RLS: 7/7
- migráció utáni partnerprojektek: 0

PROD nem kapott SQL műveletet.

## 7. Valódi create/read/idempotency acceptance

Új egyszeri runtime acceptance:

`scripts/benjadmin-b32-p1-post-migration-acceptance.mjs`

Eredmény: **17/17 PASS**.

Ellenőrizte:

- schema READY;
- schema version 0.1.0;
- unauthenticated create 401;
- authenticated partner draft create;
- automatikus `PART-0001` kód;
- OutminAI default worker;
- `internalEngineAccess=NONE`;
- azonos creation key idempotens újrahívása;
- stabil project ID és project code;
- detail API read;
- HANDOFF/NORMAL read model;
- lista API;
- Operator UI `SCHEMA READY`;
- form control enable;
- draft gomb aktiválódás kötelező mezők után;
- létrehozott projekt UI megjelenítés;
- `OUTMINAI · DEFAULT DENY · P2 GATE` jelzés;
- desktop one-viewport megjelenítés.

## 8. Acceptance fixture takarítás

A runtime acceptance után a tesztprojekt és saját audit rekordja kontrollált DEV DB tranzakcióban törlésre került.

Ellenőrzés:

- partner projekt: 0;
- acceptance generic projekt: 0;
- acceptance audit: 0;
- partner kódszekvencia visszaállítva első valós kiadás előtti állapotba (`last=1`, `is_called=false`).

A következő valódi partnerprojekt így továbbra is `PART-0001` kódot kaphat.

## 9. State-aware P1 regression

A korábbi pending-only `scripts/benjadmin-b32-p1-acceptance.mjs` state-aware lett.

Schema pending esetén továbbra is a fail-closed állapotot ellenőrzi. Schema READY esetén írás nélkül ellenőrzi a valós source-of-truth read modellt és a felület engedélyezett állapotát.

Aktuális eredmény: **14/14 PASS**.

## 10. Regressziók

- B3.1 Control acceptance: **13/13 PASS**
- Operator UI regression: **30/30 PASS**
- TypeScript: PASS
- célzott ESLint: PASS
- `git diff --check`: PASS

## 11. P1 végállapot

**B3.2 P1: KÉSZ.**

A korábbi `SCHEMA PENDING` blokk megszűnt. A Partner Development Plane registry source-of-truth DEV környezetben működik és validált.

A P2 OutminAI technikai izoláció továbbra is külön gate. A P1 registry önmagában nem enged partner workernek belső DIMPRO repository/path/secret hozzáférést.

## 12. Következő lépés – P2

Következő fejlesztési sorrend:

1. plane-aware worktree policy;
2. partner root: `/srv/partner-dev`;
3. OutminAI külön Linux identity;
4. külön Git/MCP credential referencia;
5. partnerprojekt + OutminAI kötelező összerendelés;
6. internal DIMPRO repository/path/secret DEFAULT DENY;
7. partner scope és worktree handshake enforcement;
8. P2 negatív security acceptance;
9. csak ezután partner write execution engedélyezése.
