# DIMPRO Drop architektúra

**Verzió:** DROP 0.1.0  
**Dátum:** 2026. július 31.  
**Állapot:** első biztonságos UI shell és adatmodell-előkészítés

## Cél

A DIMPRO Drop időkorlátos, meghívásos fájl- és képcsomagátadó rendszer. Nem anonim publikus feltöltőszolgáltatás. Új csomagot kizárólag a belső DIMPRO kezelőfelület hozhat létre.

## Termékfelosztás

- **DIMPRO Drive:** tartós, projektalapú fájltér.
- **DIMPRO Drop:** ideiglenes, tokenes/PIN-es csomagátadás.
- **KépDrop:** mobilos fotófeltöltési profil optimalizálással és képes PDF-riporttal.
- **FájlDrop:** asztali dokumentum-, műszaki fájl-, ZIP- és vegyes csomagmegosztás.

A KépDrop és a FájlDrop közös backend engine-re épül. A csomagmódok: `image`, `file`, `zip`, `mixed`.

## Domain és útvonalak

Nyilvános host: `https://drop.dimpro.hu`

- `/` – nyilvános termék- és csomagmegnyitó shell;
- `/open` – csomagkód és PIN belépési helye;
- `/u/[token]` – feltöltési munkamenet;
- `/p/[token]` – megtekintési munkamenet;
- `/d/[token]` – letöltési munkamenet;
- `/report/[token]` – riporthozzáférés.

Belső kezelőfelület:

- `https://license.dimpro.hu/drive/drop` – jelenlegi licencadmin fejlesztői shell;
- későbbi cél: `https://app.dimpro.hu/drive/drop` felhasználói jogosultságokkal.

## Host-routing biztonsági elv

A `drop.dimpro.hu` host kizárólag a nyilvános Drop oldalakat és a kifejezetten nyilvános Drop API-kat szolgálhatja ki. Belső `/admin`, `/drive`, `/account` és más alkalmazásútvonal nem érhető el ezen a hoston.

A proxy külön biztonsági fejléceket állít be:

- `X-Content-Type-Options: nosniff`;
- `X-Frame-Options: DENY`;
- `Referrer-Policy: no-referrer`;
- szigorított `Permissions-Policy`;
- Drop-specifikus CSP;
- `Cache-Control: no-store`.

## Feature flag és kiadási kapu

A Drop funkciók kettős kapuval működnek:

1. `DROP_RELEASE_GATE_ENABLED=true`;
2. az adott funkció saját feature flagje.

A DROP 0.1.0 állapotban csak a modul látható. A KépDrop, FájlDrop, ZIP, vegyes csomag, komment, riport és Drive-integráció kikapcsolt.

## Első körben elkészült rétegek

- Drop típusdefiníciók;
- központi feature flag motor;
- biztonságos runtime health;
- `/api/drop/health`;
- `/api/drop/features`;
- nyilvános Drop UI shell;
- belső Drive/Drop kezelő shell;
- Drop host-routing;
- adatbázis-migrációs fájl;
- dokumentációs alap.

## Tárhelyirány

A végleges tárhely S3-kompatibilis, privát Hetzner Object Storage. A böngésző csak rövid idejű signed upload/download engedélyt kaphat. A VPS-en kizárólag átmeneti feldolgozási cache tárolható.

A DROP 0.1.0 kiadásban a tárhelykapcsolat nincs aktiválva, ezért valós fájlfeltöltés nem lehetséges.

## Következő fejlesztési szint

DROP 0.2.0:

- adatbázis-migráció alkalmazása;
- szerveroldali Drop repository;
- csomaglétrehozás belső adminból;
- token- és PIN-motor;
- nyilvános hozzáférési gate;
- továbbra is fájlfeltöltés nélkül.

## DROP 0.2.0 – csomag- és hozzáférési motor

A csomagmotor új szerveroldali rétegei:

- `dropValidation.ts` – bemeneti normalizálás és korlátok;
- `dropCrypto.ts` – scrypt PIN-hash, HMAC tokenhash és hálózati fingerprint;
- `dropRepository.ts` – Supabase service-role repository;
- `dropAccess.ts` – PIN kapu, tokencél-ellenőrzés, lejárat és rate limit;
- `/api/drop/admin/packages` – hitelesített belső csomaglétrehozás és lista;
- `/api/drop/access/open` – publikus csomagkód + PIN kapu, kizárólag megtekintési granttal;
- `/api/drop/access/token` – célhoz kötött tokenellenőrzés.

A külön upload/view/download/report capability-tokenek nyers értéke csak létrehozáskor jelenik meg. Az adatbázis kizárólag HMAC-SHA256 hasht tárol. A tokenprefix az útvonal célját is kódolja, ezért a négy jogosultság nem keverhető.

A fájlfeltöltési motor továbbra sem része a 0.2.0 kiadásnak.

## DROP 0.2.0 – végleges offline csomagmotor-architektúra

A Drop 0.2.0 szolgáltatási rétege adatbázis-adaptertől független portokra épül:

- `DropRepositoryPort` – publikus PIN- és tokenhozzáférés, próbálkozások és audit események;
- `DropAdminRepositoryPort` – csomagállapot, token-újrakiadás és visszavonás;
- `supabaseDropRepository` és `supabaseDropAdminRepository` – kizárólag szerveroldali service-role adapterek;
- `InMemoryDropRepository` – csak automatizált tesztben példányosítható, éles környezeti kapcsolóval nem aktiválható.

A csomag- és hozzáférési szolgáltatások ugyanazt a kódot futtatják memóriás integrációs tesztben és a későbbi Supabase-adapterrel. Ez lehetővé tette a teljes PIN-, capability-token-, rate-limit- és csomagéletciklus fejlesztését az SQL alkalmazása előtt.

A belső kezelőfelület Supabase nélkül is használható csomagterv-ellenőrzésre. Az előnézet normalizálja a címzetteket, csoportokat, megőrzési időt és limiteket, de nem generál PIN-t, tokent vagy adatbázisrekordot. A valódi mentés csak a teljes sémaszerződés teljesülésekor engedélyezhető.

### Tranzakciós adatbázis-határ

A végső Supabase bootstrap hat migrációból és öt atomi PostgreSQL-függvényből áll:

- `drop_create_package_atomic`;
- `drop_transition_package_status`;
- `drop_mark_access_token_used`;
- `drop_reissue_access_token`;
- `drop_revoke_access_token`.

A csomag, címzettek, csoportok, négy tokenhash és audit esemény egyetlen tranzakcióban készül. Az állapotváltás, token-visszavonás és tokenhasználati számláló adatbázisoldali sorzárolással működik. Az RPC-k csak `service_role` szereppel hívhatók.

### Sémaverzió- és kiadási kapu

A csomagmotor readiness feltétele:

1. hét kötelező tábla elérhető;
2. `drop_schema_meta` rekord verziója pontosan `DROP 0.2.0`;
3. migrációszám pontosan `6`;
4. bootstrap azonosító: `drop-020-atomic-package-engine-20260801`;
5. a release gate külön jóváhagyással nyílik ki.

Régi vagy részlegesen alkalmazott séma nem minősül késznek. A fájlfeltöltési motor, Object Storage, ZIP, PDF-riport és worker továbbra sem része a DROP 0.2.0 kiadásnak.

