# DIMPRO Drive V0.9.64 – 100 MiB személyes feltöltési adatfolyam izolált integrációs QA

**2026-10-23** · Forrás + integrációs QA elkészült; **BUILD01 PENDING**, DEV runtime nem váltott; **PROD DENY**.

## V0.9.63 folytatása

A 100 MiB személyes, 500 fájlos kijelölést támogató pilot továbbra is nincs aktiválva. A V0.9.63 teszt már bizonyította az AWS SDK-val végzett helyi 17 MiB-os S3 PUT/GET protokollt, de nem kötötte össze a fájlstaginget, valós vírusellenőrzést és a 100 MiB-os visszaellenőrzést. Ezt a rést fedi le a V0.9.64.

## Elkészült

Új integrációs teszt: `scripts/tests/dimpro-drive-v0964-personal-100m-isolated-pipeline.mjs`.

A tesztkörnyezetben csak szintetikus fájl készül. Kizárólag a helyi, már futó ClamAV Unix socketet, `127.0.0.1` localhost S3-szerű REST szervert, AWS SDK-t és egyedi tesztcélú `/tmp/dimpro-v0964-local-only-*` ideiglenes mappát használ. A mappa törlése a teszt saját, egyedileg létrehozott staging fájljait érinti, nem DIMPRO source/release/S3 adatot.

A tényleges fájlkezelési folyamat:

1. 100 MiB adat generálása 1 MiB-os blokkokban.
2. A meglévő `checkedPersonalStreamChunks()` forráskódi méretvédelmen áthaladva `0600` hozzáférési módú staging-fájl készítése.
3. A staging teljes, 100 MiB-os `scanAsyncIterableWithClamd()` vizsgálata valódi ClamAV motorral, byte-szám és SHA-256 egyezés: **PASS**.
4. A szabványos, ártalmatlan EICAR antivírus-tesztminta külön helyi ideiglenes fájlból vizsgálva: **INFECTED**, az S3-szerver megindítása és bármilyen feltöltés előtt: **PASS**.
5. A tisztának minősített 100 MiB fájl továbbítása AWS SDK `PutObjectCommand` stream segítségével a helyi, hamis kulcsos, S3-kompatibilis szerverhez: **PASS**.
6. AWS `HeadObjectCommand` és `GetObjectCommand` ellenőrzése: teljes 100 MiB visszaolvasás + forrás/staging/S3 SHA-256 egyezés: **PASS**.
7. Túlfolyó (2 MiB közlés az 1 MiB-os mérethatáron), csonka, illetve 100 MiB feletti deklarált stream elutasítása: **PASS**.
8. Tesztvégén a kizárólag saját ideiglenes mappa eltávolítása, socket/szerver lezárása. Nincs tényleges DIMPRO bucket/DB/Content Core írás.

A teszt külön `DIMPRO_PRODUCTION_ACCESS=DENY` és `DIMPRO_DRIVE_V0964_SANDBOX_ONLY=true` kapcsolót követel, de ezek **nem** a production rendszer kiadási jogosultságai.

## Reprodukció

```bash
DIMPRO_PRODUCTION_ACCESS=DENY \
DIMPRO_DRIVE_V0964_SANDBOX_ONLY=true \
node scripts/tests/dimpro-drive-v0964-personal-100m-isolated-pipeline.mjs
```

## QA eredmény

- V0.9.64 teljes 100 MiB izolált pipeline: **PASS**.
- TypeScript: **PASS**.
- ESLint: **PASS**.
- 20 korábbi szerződéses/regressziós teszt: **20/20 PASS**.
- 5 releváns migráció izolált PGlite tesztje, OWNER/ACL/kvóta/RLS és rollback: **PASS**.
- `git diff --check`: **PASS**.

## Kiadási korlátok

- A teszt **nem** érinti a valódi hitelesített böngésző → DEV Nginx/Next.js → tényleges S3 → DEV PostgreSQL utat.
- A teszt önálló folyamatban fut; a teljes Next.js API, USER ACL és Content Core commit együttes E2E-je még hiányzik.
- A V0.9.63 BUILD01 indítása külső eszközbiztonsági ellenőrzésben blokkolódott. V0.9.64 verzió **BUILD01 PENDING/NOT RUN** marad addig, amíg az engedélyezett kiadási csatorna nem futtatja le.
- A DEV/PROD S3-bucket és adatbázis függetlenül igazolt izolációs inventoryja továbbra is hiányzik; emiatt élő DEV személyes próbafeltöltést nem végzünk, és nem aktiválunk sem 100 MiB, sem 5 GiB uploadot.
- A publikus `drive.dev.dimpro.hu` továbbra is V0.9.52. PROD DENY.

## V0.9.65 következő cél

1. BUILD01 runner auditált operátori/engedélyezett futtatása a V0.9.63–64 source-hoz; korábbi biztonsági tiltást nem kerülhetünk meg.
2. DEV/PROD S3/DB erőforrások független, provenance-alátámasztott izolációs bizonyítéka, erre felhatalmazott külön próbafelhasználó.
3. Izolált Next.js alkalmazás és a tároló/DB felé hitelesített 1/16/17/99/100/101 MiB próbák, negatív AV/origin/ACL ellenőrzések.
4. 50/100/500 szintetikus fotós böngészős batch és Transfer Center státusz/kvóta/sikertelen ack ellenőrzés.
5. Pilot csak a tényleges E2E, rollback és külön DEV jóváhagyás után. PROD továbbra is DENY.

Nincs azonosítatlan vagy ismeretlen fizikai törlés. Nincs éles szerver módosítás.
