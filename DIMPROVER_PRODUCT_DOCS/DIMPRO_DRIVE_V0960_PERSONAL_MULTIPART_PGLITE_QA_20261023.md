# DIMPRO Drive V0.9.60 – Valós izolált PostgreSQL migrációs QA

Dátum: 2026-10-23 | Állapot: SOURCE + IN-MEMORY DB TEST; NINCS LIVE DB APPLY.
Publikus DEV: V0.9.52 változatlanul. PROD DENY.

## 1. Izolált tesztkörnyezet és bizonyíték

Az `@electric-sql/pglite@0.5.8` PostgreSQL WASM motor kizárólag a
`/tmp/dimpro-drive-v0960-isolated-pglite/` tesztkönyvtárban, lokális npm cache-ből
telepítve fut. A tesztszkript egy friss memóriabeli adatbázist hoz létre; soha
nem olvas DIMPRO PostgreSQL/Supabase DB-kapcsolatot, SSH-t, S3-at vagy közös DB-t.

Futtatás az authoritatív forrásmappából:

```bash
npm install --offline --prefix /tmp/dimpro-drive-v0960-isolated-pglite --no-save --no-audit --no-fund @electric-sql/pglite@0.5.8
DIMPRO_TEST_PGLITE_MODULE_PATH=/tmp/dimpro-drive-v0960-isolated-pglite/node_modules/@electric-sql/pglite/dist/index.js node scripts/tests/dimpro-drive-v0960-personal-multipart-pglite.mjs
```

## 2. Migrációk, sorrendben

1. `20260818183500_dimpro_content_core_user_drive_v010.sql` – PASS
2. `20261006123000_dimpro_content_personal_folders_v010.sql` – PASS
3. `20261007_personal_drive_storage_v010.sql` – PASS
4. `20261023_personal_drive_multipart_foundation_v010.sql` – PASS
5. `20261023_personal_drive_multipart_quota_v011.sql` – PASS

A V0.9.60 egy hibát is helyesbített a v011 quota-summary tervezetben:
külön PL/pgSQL SELECT-ek helyett a limit, deduplikált usedBytes és
multipart reservedBytes most egy közös CTE/SELECT snapshotból számítódik.

## 3. Valós SQL-végrehajtási próba

- Séma-migrációk, constraint-ek és schema marker `0.1.1`: PASS.
- USER A és USER B elkülönített tulajdon / mappa FK: PASS.
- 100 MiB-os fájl két OWNER-ref mellett egyszer számít, REMOVED ref fenntartja: PASS.
- 1 GiB kvótán 100 MiB használt + 2 x 400 MiB rezerváció: PASS;
  harmadik 400 MiB-ot elutasítja.
- A régi `dimpro_personal_drive_ensure_ref_atomic` sem enged még 200 MiB-ot az aktív
  foglalások mellett: PASS.
- Idempotens ugyanazon request ID nem foglal újra, eltérő fájlmérettel konfliktus: PASS.
- `ABORTING`, `COMPLETING`, `QUARANTINED`, `SCANNING` egyaránt tartja a rezervációt;
  csak tartós `ABORTED` után csökken: PASS.
- `anon` és `authenticated` táblalekérdezési kísérlet: permission denied PASS.
- V011 migráció hiányzó v010 alap esetén fail-closed; ROLLBACK után nincs új tábla: PASS.

## 4. Amit ez NEM bizonyít

- Nem többkapcsolatos PostgreSQL, ezért valódi konkurens transaction /
  advisory lock versenyteszt **NEM** történt. Ez külön release gate.
- Nem valós DEV DB schema apply, így live schema compatibility vagy
  rollback **NEM** történt.
- A v010/v011 SQL továbbra is forrásban marad, nem migráltuk éles vagy DEV DB-re.
- S3 multipart, a teljes 5 GiB-os vírusvizsgálat és a böngészős feltöltés még
  nincs hitelesített E2E teszttel igazolva.
- `PERSONAL_MULTIPART_SERVER_RELEASED=false` retesz változatlan.

## 5. Következő fejlesztések

- V0.9.61: a már elkészült 100 MiB-os személyes upload izolált runtime/E2E
  tesztkapujának lezárása a karantén/S3/quota/CSRF szerint.
- V0.9.62: 100 MiB personal pilot, 500 fotós batch valódi böngészővel.
- V0.9.63–67: a 5 GiB scanner, kvóta settlement, reconciler, persistent multipart
  kliens, hibatűrés és külön 5 GiB-os DEV acceptance.
- Részletes, dátumozott ütemterv: `DIMPRO_DRIVE_FEJLESZTESI_UTEMTERV_20261023_V10.md`.
