# DIMPRO Drive V0.9.57 – Saját Drive 5 GiB multipart alapozás

Dátum: 2026-10-23.
Állapot: SOURCE ONLY, DEV ONLY, PROD DENY. A publikus DEV továbbra is V0.9.52 (3413).
FONTOS: Ez **még nem használható 5 GiB feltöltés**, hanem a tartós USER munkamenet, biztonsági protokoll és DB reservation tervezetének forrásfázisa.

## Felhasználói cél

A felhasználó Google Drive / OneDrive jellegű Saját Drive feltöltést kért:
- Legalább 50–100 helyszíni fotó egy kijelöléssel, a V0.9.55 óta a kijelölési limit 500 fájl.
- Tervlapok, nagy PDF-ek, DXF/DWG/IFC/BIM, ZIP és videó fájlok a 16 MiB felett is feltölthetők legyenek.
- A V0.9.56 beépítette a 100 MiB/fájl biztonságosan streamelt pilothatárt, még OFF.
- Hosszabb távon 5 GiB/fájl technikai maximum, adatdarabolás és megszakítás utáni folytatás. Nem cél az eredeti építőipari tervállományok automatikus tömörítése vagy módosítása.

## V0.9.57 source eredmények

1. `app/lib/content-core/personalMultipartPolicy.ts`:
   5 GiB maximum, 64 MiB-os standard chunk, 5–512 MiB részhatár, max. 10 000 part.
   Az 5 GiB éppen 80 darab 64 MiB részre oszlik; az utolsó rész bármilyen pozitív maradék lehet.
   Hiányos, duplikált, nem várt méretű vagy hibás ETag/SHA-256 részek elutasítása.
   Külön `DIMPRO_DRIVE_PERSONAL_MULTIPART_ENABLED` opt-in, a korábbi personal upload és DEV/PROD tiltás mellé.
   A S3 complete eredmény vagy fájlrész-hash NEM számít teljes vírusellenőrzésnek.
2. `supabase/migrations/20261023_personal_drive_multipart_foundation_v010.sql`:
   Szándékosan nem futtatott, hozzáadó SQL-migráció.
   USER-owned tartós munkamenet, unique (owner_user_id,request_id), owner-szűkített célmappa FK, S3-key névtér,
   chunk/parts, storage multipart ID, part manifest, CAS-version, lejárat, állapot és karantén.
   Új külön séma-marker és service_role-only DB hozzáférés / bekapcsolt RLS.
   `dimpro_personal_multipart_create_atomic`: ugyanazt a személyes kvóta advisory lockot használja, mint a jelenlegi user ref RPC; számolja az ACTIVE/REMOVED referenciák mögötti egyedi tartalomobjektumokat és az aktív + karanténos feltöltésfoglalásokat.
   A karanténos fájl akkor is lefoglalja a helyet, ha a feltöltési idő lejárt; kizárólag biztonságos, auditált cleanup oldhatja fel.
   Az adatbázisba NEM került automatikusan CLEAN állapotot biztosító függvény.
3. `app/lib/content-core/personalMultipartRepository.ts`:
   Marker/readiness ellenőrzés, USER-azonosítóval szűrt munkamenetlekérdezés,
   atomikus DB foglalási RPC-adapter, verziószám + tulajdon + státusz szerinti CAS,
   CLEAN állapotváltás forrásszintű tiltása.
4. `app/lib/drive-core/s3ObjectStorage.ts`:
   külön, USER-névtérbe zárt `users/<userId>/multipart/<sessionId>` kulcsképzés, a meglévő PROJECT objektumok érintése nélkül.
5. `GET /api/drive/personal/uploads/multipart/capabilities`:
   hitelesített, cache-tiltott, olvasási képességlekérdezés.
   Alapból `enabled:false`, `usableMaxFileBytes:0`.
   A munkamenetmigráció, S3, külön engedély és a **TELJES 5 GiB vírusvizsgálatára bizonyított** worker hiányában fail-closed.
   Jelenleg a Drive közös ClamAV config 100 MiB defaulttal, legfeljebb 600 MiB konfigplafonnal működik, tehát szándékosan nem lehet puszta flaggel 5 GiB-os feltöltést biztonságosnak hazudni.
   A route NEM kezd vagy módosít S3, illetve DB feltöltési munkamenetet.

## Még hátralévő tényleges megvalósítás

- A migráció SQL nyelvtani / DB rollback tesztje **még nem futott valós, izolált PostgreSQL szerveren**. Az SQL-forrást nem szabad közvetlenül alkalmazni.
- A személyes kvóta REST kijelzésébe az aktív multipart foglalások beszámítása és az `ensureUserContentRef` RPC reservation-egyeztetése szükséges. A jelenlegi RPC az új foglalási tábla aktiválására még nincs felkészítve, ezért csak a régi személyes limitet ellenőrzi.
- A tényleges multipart INIT / sign part / confirm part / checkpoint / abort / complete REST-végpontok, tartós resume tárolás és böngészős kliens még nem készültek el a V0.9.57-ben.
- A projekt Drive meglévő S3 multipart függvényeit újra kell hasznosítani, **de a projekt DB session, projekttag ACL és a projekt kvóta nem használható USER tulajdon helyett**.
- Külön S3 quarantined object → teljes SHA-256 → valódi 5 GiB-os malware scan worker → CLEAN transition + atomikus Content Core USER-ref protokoll kell. A ClamAV jelenlegi 110M streamlimitje miatt NEM emelhető 5 GiB-ra egyszerű konfigurációval.
- Élő teszt: 101 MiB / 1 GiB / 5 GiB, leállítás/resume, hibás part, másik felhasználó session-hijack, kvótaverseny, lejárat, S3 orphan garbage collection, EICAR izolált teszt, böngészőzárás, rollback.
- A 100 MiB-os V0.9.56 személyes pilot aktívra kapcsolása külön E2E kapu; nem függhet a még nem kész 5 GiB-os protokolltól.

## QA

- `npx tsc --noEmit`: PASS.
- Az új és módosított források célzott ESLintje: PASS.
- `scripts/tests/dimpro-drive-v0957-personal-multipart-foundation-contract.mjs`:
  5 GiB/80 chunk, 100 MiB boundary, részméret, hiányzó/dupla részek, state gate,
  sérült/mérgezett/nem vizsgált fájl CLEAN tiltása, feature flag, owner-CAS, SQL source constraints: PASS.
- V0.9.56–V0.9.50 regresszió, AUTH personal folders, CsomagBOX, folder drop: PASS.
- Valódi multipart S3 és DB end-to-end: **NOT TESTED**.
- A SOURCE-feladat során se migráció, se Nginx, se PM2, se PROD módosítás nem történt.

## Következő feladat a V0.9.58-ra

1. DEV isolated DB schema dry-run és quota-race transzakciós teszt a migráció alkalmazása előtt.
2. S3 multipart adapter USER-owned sessionhöz: INIT/part-signed PUT/confirm/checkpoint/abort.
3. Egymástól független infrastruktúra- és jogosultsági tesztek.
4. A teljes 5 GiB malware scanner worker tervezés és karanténról CLEAN-re felszabadító auditált folyamat.

**Release gate:** a nyilvános DEV/PROD személyes multipart feltöltés NEM aktiválható pusztán a V0.9.57 buildjével.

## BUILD01 és kiadásra izolált csomag – 2026-10-23

- Forrás/build commit: `cbb090c4e95eea8743553d9029f88a7f0122f9fa`.
- Run ID: `benjadmin-drive-v0957-cbb090c4e-20261023-build01-b1`.
- BUILD01 státusz: **PASS**, build ID `7Aj8RHmj153S2uVCelY-5`.
- Artifact SHA-256: `23ef078095c7c0971e53ea34a6c7a7aed5318ead5b7eda11de1e44d94c0c3098`.
- BUILD01, MCP-gateway és DEV példányok hash-egyezése: PASS.
- DEV elkülönített standalone: `/srv/dimpro-dev/candidates/drive-pilot/releases/cbb090c4e95e` (~371 MiB).
- Az új /api/drive/personal/uploads/multipart/capabilities route a Next.js buildben ellenőrzötten megtalálható.
- A forrásos SQL-migráció null-kvóta fail-closed javítása külön utólagos dokumentáció/SQL commit; a migráció **nem része a futó alkalmazásnak, nem lett telepítve**. A BUILD01 önmagában nem bizonyítja az SQL migráció kompatibilitását.
- Publikus DEV továbbra is V0.9.52 (3413); nincs PM2 restart, nginx átállás, DB migration vagy 5 GiB feltöltés aktiválás.
- Az 5 GiB-os tényleges feltöltéshez a V0.9.58 multipart REST, kvóta-foglalás integráció és nagyfájl-scanner hiányzik.
