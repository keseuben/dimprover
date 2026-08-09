# DIMPRO Drop hozzáférési terek – DROP 0.3.0

## Fejlesztési állapot

- állapot: **staged / SQL aktiválásra vár**;
- éles UI build: `o25oO2K7KLQKEwYb4Ix7V`;
- rollback: `.next_before_drop_spaces_phase1_20260801_201938`;
- feature flag: `DROP_SPACES_ENABLED=false`;
- a jelenlegi DROP 0.2.1 csomagmotor változatlanul aktív;
- fájl-, kép-, ZIP- és vegyes feltöltés továbbra is tiltott;
- a DROP 0.3.0 SQL sikeresen alkalmazva lett a Supabase-ben; a térmotor aktív.

## Végleges terméklogika

A csomag nem a legfelső szint. A rendszer hierarchiája:

```text
Fizető licencgazda
└── Drop hozzáférési tér
    ├── tagságok és szerepkörök
    ├── kapcsolódó projektek
    ├── csomagok
    │   ├── képek
    │   ├── dokumentumok
    │   ├── ZIP-ek
    │   └── megjegyzések
    └── Door / Dock / Drive kapcsolatok
```

A külső meghívottaknak nem kell külön fizetős licenc. A térgazda licence adja:

- az érvényesség felső időkorlátját;
- a tárhelykeretet;
- az aktív terek és csomagok keretét;
- a külső tagságok használati jogosultságát.

## Tagsági szerepkörök

1. `owner` – térgazda, teljes jogosultság;
2. `space_admin` – tagság-, projekt-, csomag- és archiváláskezelés;
3. `contributor` – saját csomag létrehozása, megosztása, feltöltés és letöltés;
4. `uploader` – kijelölt csomagokba feltöltés és letöltés, de saját csomagot nem hoz létre;
5. `viewer` – megtekintés és engedélyezett letöltés.

A vendég közreműködő saját csomagot készíthet, ha a tér `allow_guest_package_creation=true`. További személyeket csak akkor hívhat meg, ha a térgazda külön engedélyezi az `allow_guest_invites` kapcsolót; alapérték: `false`.

## Licenc- és lejárati elv

A fizető licenc lejárata mindig felső korlát. Támogatott térlejárati módok:

- `license` – a tér a licenc lejáratáig használható;
- `project` – a projekt vége és a licenc lejárata közül a korábbi időpont érvényes;
- `fixed` – a megadott fix dátum és a licenc lejárata közül a korábbi időpont érvényes;
- `none` – nincs külön térlejárat, de a licenc lejárata továbbra is felső korlát.

Lejáratkor a rendszer először read-only állapotba kerülhet, majd a türelmi idő után blokkolható. Azonnali automatikus törlés nem megengedett.

## Door / Dock / Drive integráció

- **Door:** meghívás, azonosítás, tagság és jogosultság;
- **Dock:** projekt munkafelület, ahol a projekthez kötött Drop csomagok ugyanazzal a `package_id` azonosítóval jelennek meg;
- **Drop:** külső együttműködés, feltöltés, csomagkészítés és megosztás;
- **Drive:** tartós projektfájltár és archiválás.

A projektkapcsolat nem másolja a fájlokat. Ugyanaz a storage objektum, `file_id` és `package_id` jelenik meg több felületen.

## Új adatbázis-objektumok

Az aktivált migráció négy új táblát készített:

- `drop_spaces`;
- `drop_space_memberships`;
- `drop_space_projects`;
- `drop_package_members`.

A `drop_packages` kompatibilis bővítése:

- `space_id`;
- `created_by_membership_id`;
- `visibility`.

A meglévő, egyszeri csomagoknál a `space_id` null maradhat, ezért a DROP 0.2.1 adatok visszafelé kompatibilisek.

## Elkészült kódréteg

- `app/lib/drop/dropSpaceTypes.ts`;
- `app/lib/drop/dropSpacePermissions.ts`;
- `app/lib/drop/dropSpaceValidation.ts`;
- `scripts/drop-spaces-domain.test.ts`;
- `scripts/drop-spaces-schema-contract.test.mjs`;
- `scripts/drop-spaces-preflight.sh`;
- `supabase/migrations/20260801195500_drop_spaces_access_model.sql`;
- `supabase/DIMPRO_DROP_030_SPACES_BOOTSTRAP.sql`;
- `supabase/DIMPRO_DROP_030_SPACES_BOOTSTRAP.sql.sha256`.

## SQL azonosító

- fájl: `supabase/DIMPRO_DROP_030_SPACES_BOOTSTRAP.sql`;
- méret: 174 sor / 7606 bájt;
- SHA256: `92b4dda620958c6cc8638d0fb6d5537ded9e18015ed6ab98aeab4470068a40df`;
- első végrehajtható utasítás: `begin;`;
- utolsó utasítás: `commit;`;
- SQL alkalmazva: **igen**, `2026-08-01 20:52` körül (Europe/Budapest).

## Teszteredmények

DROP 0.3.0 aktív preflight:

- domain- és szerepkörteszt: PASS;
- vendég külön licenc nélkül: PASS;
- vendég csomaglétrehozás: PASS;
- fizető licenc felső időkorlát: PASS;
- projekt- és Drive-kapcsolat szerződése: PASS;
- SQL checksum és táblaszerződés: PASS;
- célzott ESLint: PASS;
- TypeScript: PASS.

Meglévő DROP 0.2.1 regresszió:

- offline acceptance: 11/11 PASS;
- candidate smoke: 11/11 PASS;
- éles smoke: 11/11 PASS;
- böngészőhiba: 0;
- vízszintes túlcsordulás: nincs.

Admin Drop kártya kontraszt:

- világos címke: 7,07:1;
- világos főcím: 16,64:1;
- világos leírás: 9,65:1;
- világos gomb: 7,58:1;
- sötét címke: 10,43:1;
- sötét főcím: 14,75:1;
- sötét leírás: 13,35:1;
- sötét gomb: 14,21:1.

## Aktivált állapot

Elkészült és éles:

1. DROP 0.3.0 Supabase SQL és sémamarker;
2. readiness ellenőrzés a négy új táblára;
3. ideiglenes tér + tulajdonosi tagság + projektkapcsolat integrációs teszt automatikus törléssel;
4. szerveroldali Drop Space repository;
5. licencadmin-hitelesített `/api/drop/admin/spaces` GET/POST API;
6. admin térlista és 2 másodperces térlétrehozó űrlap;
7. automatikus aktív tulajdonosi tagság;
8. opcionális projektkapcsolat Dock- és Drive-előkészítéssel;
9. licencidő mint felső hozzáférési korlát;
10. legacy csomagkompatibilitás.

## Következő kötelező fejlesztési sorrend

1. Tagság- és e-mailes meghívóworkflow a térhez.
2. Meghívó elfogadása, Door-belépés és vendég munkamenet.
3. Csomagok `space_id` kapcsolata és kiválasztott tagságokkal történő megosztása.
4. Közreműködő által indítható saját csomag.
5. Projektkapcsolat megjelenítése a Dock felületen.
6. Drive archiválási adapter.
7. Object Storage és valódi fájlfeltöltés csak az új térmodell stabilizálása után.


## DROP 0.3.0 aktív térkezelő kiadás

- feature flag: `DROP_SPACES_ENABLED=true`;
- éles build: `IE8AbgSsaJrB5olBGmDiJ`;
- rollback: `.next_before_drop_spaces_crud_20260801_211605`;
- admin API: `GET/POST /api/drop/admin/spaces`;
- adminfelület: `https://license.dimpro.hu/drive/drop`;
- tér létrehozása: PASS;
- aktív owner tagság: PASS;
- opcionális projektkapcsolat: PASS;
- térlista tag-, projekt- és csomagszámmal: PASS;
- jogosulatlan API-kérés tiltása: PASS;
- 2 másodperces létrehozási műveletvédelem: PASS;
- candidate API-integráció: PASS;
- valós Supabase repository-integráció: PASS;
- éles health: `spacesSchema=true`, `spacesEngine=true`;
- éles Drop smoke: 11/11 PASS;
- éles böngészőteszt: PASS;
- fájlfeltöltés: továbbra is tiltott;
- build/rollback hardlink deduplikáció: 736,39 MiB megtakarítás.

## DROP 0.3.1 – tagsági meghívás és vendégmunkamenet

Éles build: `d-5x1MUMZDqkV9GbgE7dP`.
Rollback: `.next_before_drop_v031_invites_20260801_214915`.

Elkészült:

- tértagságok listázása és szerepkör-kezelése;
- téradmin által indított e-mailes meghívás;
- újraküldéskor a korábbi meghívólink automatikus érvénytelenítése;
- egyszer használható HMAC-aláírt meghívótoken;
- 2 másodperces meghívás-elfogadás;
- `Secure`, `HttpOnly`, `SameSite=Lax` vendégmunkamenet-cookie;
- nyilvános `/join/[token]` elfogadóoldal;
- nyilvános `/space/[spaceCode]` vendégmunkatér;
- közreműködői `package.create` jogosultság megjelenítése;
- publikus admin API-k továbbra is 404 választ adnak;
- valódi SMTP, Supabase, candidate és éles HTTPS böngészőteszt: PASS;
- meghívó újrafelhasználása: HTTP 409;
- tesztterek automatikus törlése: PASS;
- fájlfeltöltés továbbra is tiltott.

## DROP 0.3.2 – térbeli saját csomagkészítés, pre-SQL állapot

Candidate build: `mnB5mJ6_3LW4lwj27yMER`.
Candidate könyvtár: `.next_candidate_drop_v032_pre_sql`.
Feature flag: `DROP_SPACE_PACKAGE_CREATION_ENABLED=false`.

Elkészült és aktiválásra vár:

- a meglévő ötparaméteres `drop_create_package_atomic` RPC visszafelé kompatibilis bővítése;
- `space_id`, `created_by_membership_id` és `visibility` atomi mentése;
- tér-, tagság-, szerepkör-, licencidő-, projekt- és csomaglimit ellenőrzés;
- kiválasztott aktív tértagok `drop_package_members` megosztásának atomi mentése;
- létrehozói tagság automatikus teljes csomaghozzáférése;
- szerveroldali láthatóságszűrés;
- vendégmunkatér tércsomag-lista és létrehozópanel;
- saját csomag, minden tértag, kiválasztott tértag vagy privát láthatóság;
- PIN és egyszer megjelenő hozzáférési linkek;
- 2 másodperces csomaglétrehozás;
- kliens nem írhatja felül a sessionből származó létrehozó nevét, e-mailjét vagy tagságát;
- feltöltési link előkészül, de Object Storage hiányában inaktív;
- SQL- és kódszerződés: PASS;
- pre-SQL preflight: 6/6 PASS;
- meglévő DROP acceptance: 11/11 PASS;
- pre-SQL candidate smoke: 11/11 PASS;
- POST mentés pre-SQL állapotban: HTTP 503;
- csomag- és fájladat nem jött létre;
- browser/console hiba: 0.

Kézzel futtatandó SQL:

- `supabase/DIMPRO_DROP_032_SPACE_PACKAGES_BOOTSTRAP.sql`;
- 431 sor;
- 14705 bájt;
- SHA256: `df482acc96c6cd3a711f55da16d223ece43b275f9c07926d9c1d99472e2363ac`;
- első végrehajtható sor: `begin;`;
- utolsó sor: `commit;`;
- SQL alkalmazva: **nem**.

## DROP 0.3.2 – térbeli saját csomagkészítés, éles kiadás

Kiadás dátuma: `2026-08-01`.
Éles build: `X9Jxtcs2lSP1Y6ynq6dKf`.
Előző éles build: `d-5x1MUMZDqkV9GbgE7dP`.
Rollback: `.next_before_drop_v032_20260801_230325`.

Aktivált adatbázis:

- `drop-spaces` sémaverzió: `DROP 0.3.2`;
- migrációszám: `2`;
- bootstrap ID: `drop-032-space-package-creation-20260801`;
- atomi tércsomag-létrehozás: aktív;
- kiválasztott tértagi megosztás: aktív;
- legacy csomagkompatibilitás: aktív.

Aktív feature flag:

- `DROP_SPACE_PACKAGE_CREATION_ENABLED=true`.

Éles működés:

- közreműködő saját tércsomagot hozhat létre;
- választhat FájlDrop, KépDrop, ZIP vagy vegyes csomagmódot;
- választhat kapcsolódó, a térhez már hozzárendelt projektet;
- láthatóság: minden aktív tértag, kiválasztott tértagok vagy privát;
- a létrehozó személye és tagsága kizárólag a biztonságos vendégsessionből származik;
- a tér-, tagság-, szerepkör-, licencidő-, projekt- és csomaglimit egy tranzakcióban ellenőrződik;
- a létrehozó automatikusan teljes csomagjogosultságot kap;
- kiválasztott tagok jogosultsága szerepkör szerint kerül a `drop_package_members` táblába;
- a PIN és a négy capability-link csak egyszer jelenik meg;
- 2 másodperces nyomva tartás szükséges a létrehozáshoz;
- szerveroldali csomagláthatósági szűrés aktív;
- megtekintő nem hozhat létre csomagot;
- nem kapcsolt projekt nem rendelhető a csomaghoz;
- a korábbi admin- és legacy csomagmotor változatlanul működik.

Biztonsági állapot:

- nyers PIN vagy nyers token nem kerül adatbázisba vagy audit payloadba;
- publikus admin API-k továbbra is 404 választ adnak;
- session nélküli tércsomag API: 401;
- Object Storage és valódi fájl-/kép-/ZIP-feltöltés: továbbra is tiltott;
- a feltöltési capability-link létrejön, de fájlt nem fogad.

Ellenőrzések:

- DROP 0.3.2 post-SQL preflight: 7/7 PASS;
- valós Supabase tércsomag-integráció: PASS;
- kiválasztott tag láthatósága: PASS;
- nem kiválasztott tag tiltása: PASS;
- megtekintői csomagkészítés tiltása: PASS;
- nem kapcsolt projekt tiltása: PASS;
- capability-tokenek: 4/4 hashként tárolva;
- fájlrekord: 0;
- legacy DROP acceptance: 11/11 PASS;
- candidate smoke: 11/11 PASS;
- éles smoke: 11/11 PASS;
- candidate böngészőteszt: PASS;
- éles HTTPS böngészőteszt: PASS;
- browser hiba: 0;
- console hiba: 0;
- vízszintes túlcsordulás: nincs;
- automatikus tesztadat-takarítás: PASS.

## DROP 0.3.3 – privát tárhely és karanténfeltöltés, pre-SQL állapot

Candidate build: `LucQT03AEvrKCrs-08Psm`.
Candidate könyvtár: `.next_candidate_drop_v033_pre_sql_final`.
Éles build változatlanul: `X9Jxtcs2lSP1Y6ynq6dKf` / DROP 0.3.2.

Elkészült:

- providerfüggetlen Drop Storage Core;
- `local-private` valódi VPS privát tárhelyadapter;
- `s3-compatible` későbbi adapter interfész;
- streaming fájlírás Node-memóriába töltés nélkül;
- rövid életű HMAC-aláírt upload session token;
- atomi csomag- és térkvóta-foglalás;
- megszakításkor egyszeri kvóta-visszaengedés;
- SHA-256 ellenőrzőösszeg;
- szerveroldali MIME-felismerés;
- fájlnév- és kiterjesztésvédelem;
- tiltott végrehajtható és scriptfájlok blokkolása;
- ZIP-integritás, fájlszám, útvonal, kibontott méret és tömörítési arány ellenőrzés;
- privát `incoming`, `quarantine`, későbbi `objects` tárhelystruktúra;
- térsessionből indított feltöltés;
- közvetlen `/u/[token]` capability-linkből indított feltöltés;
- többfájlos, soros feltöltés fájlonkénti és teljes progresszel;
- feltöltési e-mail a csomaghoz hozzáférő tértagoknak;
- nyilvános API-válaszokból a storage key, bucket, provider, SHA és belső sessionadatok eltávolítva;
- karanténfájl letöltése tiltott;
- víruskereső hiányában `scanner_required` állapot.

Biztonsági állapot:

- `DROP_STORAGE_CORE_ENABLED=false`;
- `DROP_QUARANTINE_UPLOAD_ENABLED=false`;
- teljes kép-/fájl-/ZIP-/vegyes upload feature flagek: false;
- publikus letöltés: false;
- víruskereső: nincs telepítve;
- `/var/lib/dimpro/drop` még nem jött létre;
- pre-SQL térsessiones init: HTTP 503;
- pre-SQL capability init: HTTP 503;
- adatbázis fájlrekord: 0;
- adatbázis upload session: 0;
- kvótafoglalás: 0.

Ellenőrzések:

- DROP 0.3.3 SQL contract: PASS;
- DROP 0.3.3 code contract: PASS;
- local private storage security core: PASS;
- pre-SQL preflight: 7/7 PASS;
- DROP 0.3.2 regresszió: PASS;
- legacy acceptance: 11/11 PASS;
- e-mail regresszió: PASS;
- pre-SQL candidate smoke: 11/11 PASS;
- pre-SQL böngészőteszt: PASS;
- browser/console hiba: 0;
- tesztfájl-, tesztcsomag- és teszttér-takarítás: PASS.

Kézzel futtatandó SQL:

- `supabase/DIMPRO_DROP_033_PRIVATE_STORAGE_BOOTSTRAP.sql`;
- 570 sor;
- 19876 bájt;
- SHA256: `253ceb07d7620ca84a909ccc1882b9841f38d061743bf2f7e60ba92793d17d9d`;
- első végrehajtható sor: `begin;`;
- utolsó sor: `commit;`;
- SQL alkalmazva: **nem**.

## DROP 0.3.3 – privát karanténfeltöltés, éles kiadás

Kiadás dátuma: `2026-08-02`.
Éles build: `CqdDLmk_TTMiuN1VGJLQo`.
Előző build: `X9Jxtcs2lSP1Y6ynq6dKf`.
Rollback: `.next_before_drop_v033_20260802_003654`.

Aktív funkciók:

- privát, webrooton kívüli helyi tárhely: `/root/dimprover/.data/drop-storage`;
- tárhelyjogosultság: `0700`, root tulajdon;
- Storage Core: aktív;
- karanténfeltöltés: aktív;
- térsessiones feltöltés: aktív;
- közvetlen upload capability-link: aktív;
- streaming fájlírás: aktív;
- atomi csomag- és térkvóta-foglalás: aktív;
- megszakításkor kvóta-visszaengedés: aktív;
- SHA-256: aktív;
- szerveroldali MIME-felismerés: aktív;
- ZIP-szerkezet és ZIP-bomba elleni ellenőrzés: aktív;
- tiltott végrehajtható/script kiterjesztések: blokkolva;
- többfájlos progress UI: aktív;
- feltöltési e-mail workflow: aktív;
- API-válaszok tárhelykulcs-, bucket-, provider- és SHA-mentesek.

Korlátozott biztonsági kiadás:

- maximális fájlméret: 9 MB;
- az Nginx Drop host általános korlátja 10 MB;
- víruskereső nincs telepítve;
- minden fájl `processing / quarantined / scanner_required` állapotban marad;
- karanténfájl letöltése tiltott;
- teljes FileDrop, KépDrop, ZIP és vegyes upload release flag: továbbra is false;
- publikus kész fájlfeltöltés readiness: false;
- publikus letöltés readiness: false.

Ellenőrzések:

- DROP 0.3.3 post-SQL preflight: 7/7 PASS;
- valós adatbázis- és tárhelyintegráció: PASS;
- candidate térsessiones feltöltés: PASS;
- candidate capability-feltöltés: PASS;
- candidate böngészőteszt: PASS;
- candidate smoke: 11/11 PASS;
- éles PM2 HTTP feltöltés: PASS;
- éles HTTPS/TLS/Nginx feltöltés: PASS;
- éles smoke: 11/11 PASS;
- API storage-secret kitettség: nincs;
- browser/console hiba: 0;
- tesztfájl-, csomag- és tértakarítás: PASS.

## DROP 0.3.4 – 500 MB-os folytatható multipart feltöltés, pre-SQL állapot

Candidate build: `nDFH9It3S1XJ4NS7o4NHO`.
Candidate könyvtár: `.next_candidate_drop_v034_pre_sql`.
Éles build változatlanul: `CqdDLmk_TTMiuN1VGJLQo` / DROP 0.3.3.
Backup: `backups/drop_v034_chunked_upload_20260802_005537`.

Tervezett és elkészült működés:

- teljes fájl maximum: 500 MB;
- alapértelmezett feltöltési rész: 64 MB;
- előkészített Nginx részkorlát: 70 MB;
- stabil kliensoldali feltöltési azonosító fájlnév, méret és módosítási idő alapján;
- részenkénti `File.slice()` feltöltés;
- részenkénti progress és teljes fájlprogress;
- megszakítás után a már elkészült részek felismerése;
- újrapróbáláskor csak a hiányzó részek feltöltése;
- részenkénti bájtszám- és SHA-256-ellenőrzés;
- idempotens rész-véglegesítés és tartalomütközés-védelem;
- minden rész után szerveroldali összefűzés;
- összefűzés után teljes fájl SHA-256, MIME- és ZIP-ellenőrzés;
- a fájl továbbra is privát karanténba kerül;
- víruskereső hiányában letöltés továbbra is tiltott;
- térsessiones és capability-linkes feltöltő ugyanazt a multipart klienst használja.

Hetzner Object Storage előkészítés:

- telepítve: `@aws-sdk/client-s3` és `@aws-sdk/s3-request-presigner`;
- S3-kompatibilis adapter elkészült;
- multipart inicializálás, részfeltöltési presigned URL, befejezés, megszakítás és objektumolvasás előkészítve;
- Hetzner endpoint, régió, bucket és hozzáférési kulcs még nincs beállítva;
- a Hetzner hálózati integráció ezért még nem aktív;
- a helyi privát adapter teljes megszakítás/folytatás/összefűzés tesztje sikeres.

Biztonsági állapot a migráció előtt:

- `DROP_RESUMABLE_UPLOAD_ENABLED=false`;
- adatbázismarker: `DROP 0.3.3`;
- 500 MB-os multipart inicializálás: tiltott;
- 10 MB-os próba inicializálása: HTTP 413;
- multipart rész API: HTTP 503;
- jelenlegi 9 MB alatti egykéréses karanténfeltöltés: működik;
- a felület nem hirdeti aktívként az 500 MB-os módot;
- publikus letöltés: tiltott.

Ellenőrzések:

- DROP 0.3.4 SQL contract: PASS;
- DROP 0.3.4 code contract: PASS;
- helyi megszakítás és folytatás: PASS;
- összefűzött tartalom és teljes SHA-256: PASS;
- pre-SQL preflight: 7/7 PASS;
- pre-SQL candidate smoke: 11/11 PASS;
- DROP 0.3.3 regresszió: 7/7 PASS;
- legacy csomagmotor: 11/11 PASS;
- browser/console hiba: 0;
- tesztadat- és tesztfájltakarítás: PASS.

Kézzel futtatandó SQL:

- `supabase/DIMPRO_DROP_034_RESUMABLE_MULTIPART_BOOTSTRAP.sql`;
- 496 sor;
- 17327 bájt;
- SHA256: `d95c08ee60df0732cedf7e1dc4887fc8615408a99ddcc6fdbd6077213f2fdab5`;
- SQL alkalmazva: **nem**.

Előkészített Nginx sablon:

- `ops/nginx/drop-v034-multipart-location.conf.example`;
- csak a multipart részfeltöltési útvonalra vonatkozik;
- `client_max_body_size 70m`;
- `proxy_request_buffering off`;
- a rendszerkonfigurációba még nincs beillesztve.

## DROP 0.3.4 – éles, folytatható nagyfájlos feltöltés

Az SQL-migráció alkalmazva, a multipart motor és a felhasználói tájékoztatás élesen aktív.

Kiadási adatok:

- éles build: `6T1br1RsNy0bI7MGOb-UB`;
- rollback: `.next_before_drop_v034_20260802_002440`;
- Fejlesztési Központ rekord: `version_9fd09863-b28`, `released`;
- sémamarker: `DROP 0.3.4`;
- maximális fájlméret: 500 MB;
- kliensoldali részméret: 64 MB;
- Nginx részkorlát: 70 MB;
- session folytathatósága: legfeljebb 24 óra.

Biztonsági és hálózati működés:

- a teljes fájl nem halad át egyetlen Nginx-kérésben;
- csak a konkrét multipart részútvonal kap 70 MB-os korlátot;
- `proxy_request_buffering off` és hosszabb streaming timeout aktív;
- a részfeltöltési útvonal kimarad a Next.js Proxy 10 MB-os body-klónozásából;
- az init, complete, state, admin és minden más Drop API továbbra is Proxy-védett;
- a kivételt kapó route külön `drop.dimpro.hu` host-engedélylistát és rövid életű bearer tokent követel;
- minden rész bájtszáma és SHA-256 értéke ellenőrzött;
- összefűzés után a teljes SHA-256, MIME és ZIP-szerkezet újra ellenőrződik;
- víruskereső hiányában a kész fájl `scanner_required` karanténállapotban marad;
- publikus letöltés továbbra is tiltott.

Felhasználói tájékoztatás és elfogadás:

- szabályzatverzió: `DIMPRO-DROP-UPLOAD-HU-1.0`;
- a fő felületen rövid információs kártyák jelennek meg;
- aktív korlát: „500 MB / fájl”;
- roadmap: „Hamarosan: akár 2 GB / fájl”;
- a részletes szabályok lenyithatók;
- az elfogadó jelölőnégyzet alapból üres;
- fájlválasztás és feltöltés elfogadás nélkül tiltott;
- az elfogadás verziója, időpontja, sessionje és szereplője auditált;
- folytatáskor az aktuális szabályzat újbóli megerősítése auditált.

Ellenőrzések:

- post-SQL preflight: 9/9 PASS;
- 65 MB-os szolgáltatási integráció: PASS;
- candidate HTTP multipart és candidate/éles browser UI: PASS;
- candidate és éles smoke: 11/11 PASS;
- éles HTTPS/TLS/Nginx teszt: 64 MB + 1 MB, PASS;
- teljes SHA-256 egyezés: PASS;
- browser/console hiba: 0;
- tesztadat-, session-, tér-, csomag- és fájltakarítás: PASS.

Továbbfejlesztési irány:

- Hetzner Object Storage bucket és szerveroldali S3-kulcsok bekötése;
- közvetlen presigned multipart feltöltés a Hetzner tárhelyre;
- víruskereső integráció;
- `ready` állapot és jogosultságvédett letöltés;
- ezt követően a fájlonkénti korlát 1–2 GB-ra emelhető.

