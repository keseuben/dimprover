# DIMPRO Drop DROP 0.2.0 – végső Supabase aktiválás

**Dátum:** 2026. augusztus 1.  
**Állapot:** a kód, a tranzakciós bootstrap és az offline tesztrendszer elkészült; az SQL szándékosan nincs alkalmazva  
**Cél:** a fájl nélküli Drop csomag- és hozzáférési motor ellenőrzött aktiválása, a fájlfeltöltési réteg bekapcsolása nélkül

## Alapelv

A Supabase SQL alkalmazása a DROP 0.2.0 fejlesztés utolsó kézi lépése. Addig:

- a release gate zárva marad;
- a csomagmotor valódi adatbázisírása tiltott;
- a KépDrop, FájlDrop, ZIP, vegyes csomag, komment, PDF-riport, worker és Drive-integráció kikapcsolt;
- az éles `.next` és PM2 folyamat nem változik.

A Supabase ideiglenes fejlesztési adatbázis. A végleges cél továbbra is a saját PostgreSQL DATABASE VPS.

## Aktiválandó bootstrap

- fájl: `supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql`;
- checksum: `supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql.sha256`;
- SHA256: `591250bb1bdda6087b50ff7b94ea2b7a3c40e09301285c2460eba9318d1bae55`;
- sorok száma: 1064;
- migrációk száma: 6;
- végrehajtás: egyetlen explicit PostgreSQL `BEGIN` / `COMMIT` tranzakció.

Forrásmigrációk sorrendben:

1. `supabase/migrations/20260731143500_drop_core.sql`;
2. `supabase/migrations/20260801003000_drop_access_engine.sql`;
3. `supabase/migrations/20260801090000_drop_admin_lifecycle.sql`;
4. `supabase/migrations/20260801100000_drop_token_transactions.sql`;
5. `supabase/migrations/20260801110000_drop_atomic_package_creation.sql`;
6. `supabase/migrations/20260801120000_drop_schema_version.sql`.

## Aktiválás előtti kötelező preflight

Projektgyökérből:

```bash
NEXT_ENV_PROJECT_DIR=/root/dimprover \
node -r ./scripts/load-next-env.cjs \
scripts/drop-activation-preflight.mjs
```

Elvárt eredmény:

- `ok: true`;
- `migrationCount: 6`;
- SHA256 pontos egyezés;
- `releaseGateEnabled: false`;
- `uploadFlagsEnabled: []`;
- `sqlAppliedByThisScript: false`;
- `databaseWritesPerformed: false`.

A preflight nem futtat SQL-t és nem ír adatbázist.

## Kézi Supabase SQL Editor-lépés

1. Nyissa meg a DIMPRO-hoz használt Supabase projektet.
2. Ellenőrizze, hogy a megfelelő projekt van kiválasztva.
3. Nyissa meg az SQL Editort.
4. Hozzon létre új query-t.
5. Illessze be a `supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql` teljes tartalmát.
6. Ellenőrizze, hogy a fájl `begin;` utasítással indul és `commit;` utasítással zárul.
7. Futtassa egyszer a teljes scriptet.
8. Hiba esetén ne próbáljon részleteket külön futtatni. A tranzakció visszagörget; a release gate maradjon zárva.
9. Siker esetén ne kapcsoljon be még feature flaget.

A bootstrap:

- nem hoz létre anonim RLS policyt;
- nem hoz létre valós fájlfeltöltési API-t;
- nem tárol nyers PIN-t vagy nyers capability-tokent;
- az adatbázisfüggvények végrehajtási jogát kizárólag `service_role` szerepnek adja.

## Readiness ellenőrzés

A kézi SQL sikeres futtatása után:

```bash
NEXT_ENV_PROJECT_DIR=/root/dimprover \
node -r ./scripts/load-next-env.cjs \
scripts/drop-db-readiness.mjs
```

Elvárt eredmény:

- hét kötelező tábla HTTP 200;
- `version.expected: DROP 0.2.0`;
- `version.actual: DROP 0.2.0`;
- `version.migrationCount: 6`;
- `version.bootstrapId: drop-020-atomic-package-engine-20260801`;
- `version.ready: true`;
- összesített `ok: true`.

Kötelező táblák:

1. `drop_packages`;
2. `drop_recipients`;
3. `drop_groups`;
4. `drop_access_tokens`;
5. `drop_access_attempts`;
6. `drop_events`;
7. `drop_schema_meta`.

## Aktiválás utáni ideiglenes integrációs teszt

Csak sikeres readiness után, továbbra is zárt release gate mellett:

```bash
NEXT_ENV_PROJECT_DIR=/root/dimprover \
DROP_ALLOW_INTEGRATION_WRITE=DROP-020-TEMPORARY-TEST \
node -r ./scripts/load-next-env.cjs \
./node_modules/.bin/tsx scripts/drop-post-activation-integration.test.ts
```

A teszt:

- létrehoz egy fájl nélküli, egyértelműen tesztjelölt csomagot;
- ellenőrzi a csomagot, egy címzettet, két csoportot és négy capability-tokenhasht;
- ellenőrzi, hogy nyers PIN vagy nyers token nem került adatbázisrekordba;
- végigfuttatja a PIN-kaput és a view-token ellenőrzést;
- nem hoz létre fájlt;
- nem aktivál uploadot;
- `finally` ágban törli a tesztcsomagot;
- a törlést visszaellenőrzi.

Az integrációs teszt az explicit `DROP_ALLOW_INTEGRATION_WRITE=DROP-020-TEMPORARY-TEST` érték nélkül nem indul el.

## Candidate és release sorrend

Az SQL és az integrációs teszt után:

1. `scripts/drop-offline-acceptance.sh` ismételt futtatása;
2. tiszta elkülönített candidate build;
3. nyilvános smoke teszt;
4. licencadmin előnézet és admin API-védelem teszt;
5. desktop, tablet és mobil responsive teszt;
6. PM2 és Nginx állapotellenőrzés;
7. rollback `.next` létrehozása;
8. atomikus `.next` csere;
9. PM2 restart;
10. éles HTTPS smoke;
11. csak sikeres megfigyelés után Dev Center `released` állapot.

## Feature flag sorrend

A bootstrap futtatása önmagában nem kapcsolhat be funkciót.

Az első private-pilot csomagmotorhoz, az integrációs tesztek után:

- `DROP_PACKAGE_ENGINE_ENABLED=true`;
- `DROP_ACCESS_GATE_ENABLED=true`;
- `DROP_RELEASE_GATE_ENABLED=true` csak közvetlenül a jóváhagyott éles kiadáskor.

Továbbra is `false`:

- `DROP_IMAGE_DROP_ENABLED`;
- `DROP_FILE_DROP_ENABLED`;
- `DROP_ZIP_UPLOAD_ENABLED`;
- `DROP_MIXED_PACKAGE_ENABLED`;
- `DROP_COMMENTS_ENABLED`;
- `DROP_PDF_REPORT_ENABLED`;
- `DROP_DRIVE_ARCHIVE_ENABLED`;
- minden worker-, Object Storage- és valós fájlműveleti kapu.

## Hiba- és rollback-szabály

SQL-hiba esetén:

- az explicit tranzakció visszagörget;
- a release gate zárva marad;
- részleges migrációt nem szabad kézzel javítgatni;
- a teljes hibaüzenetet menteni kell;
- a bootstrapot csak a forrás javítása, új SHA256 és új preflight után lehet újrafuttatni.

Integrációs teszthiba esetén:

- a teszt megpróbálja törölni az ideiglenes csomagot;
- a release gate zárva marad;
- nincs éles buildcsere vagy PM2 restart;
- a readiness és az érintett RPC külön ellenőrzendő.

## Saját PostgreSQL DATABASE VPS-re migrálás

A DATABASE VPS elkészülésekor:

1. tiszta PostgreSQL tesztadatbázis;
2. ugyanazon hat migráció alkalmazása;
3. DROP 0.2.0 sémaverzió ellenőrzése;
4. Supabase `drop_*` export;
5. próbaimport;
6. rekord-, kapcsolat-, tokenhash- és időbélyeg-ellenőrzés;
7. repository kapcsolat átállítása;
8. párhuzamos teszt;
9. PROD migráció rollback-ponttal;
10. Supabase csak sikeres megfigyelés után vezethető ki.
