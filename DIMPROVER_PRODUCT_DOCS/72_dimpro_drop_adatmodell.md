# DIMPRO Drop adatmodell

**Verzió:** DROP 0.2.0  
**Bootstrap:** `supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql` – 6 forrásmigráció, explicit tranzakció

## Táblák

- `drop_packages` – csomag, hozzáférési politika, limitek, lejárat és riport/törlési státusz;
- `drop_recipients` – feltöltő, meghívott, megtekintő és kommentelő címzettek;
- `drop_groups` – KépDrop csoportok és csomagon belüli logikai mappák;
- `drop_files` – fájlmetaadat, object storage kulcs, hash, feldolgozási és vírusellenőrzési státusz;
- `drop_upload_sessions` – megszakítható multipart feltöltési munkamenetek;
- `drop_upload_parts` – feltöltött részek, ETag és checksum;
- `drop_comments` – csomag- vagy fájlszintű megjegyzések;
- `drop_events` – megnyitási, letöltési, feltöltési, riport- és biztonsági események;
- `drop_downloads` – rövid életű letöltési munkamenetek;
- `drop_reports` – manuális és végleges PDF-riportok;
- `drop_jobs` – ZIP-, PDF-, e-mail-, lejárati és törlési háttérfeladatok;
- `drop_email_log` – e-mail küldési kísérletek és szolgáltatói azonosítók.

## Biztonsági alapbeállítás

Minden Drop tábla RLS-védelemmel jön létre. A migráció szándékosan nem hoz létre anonim klienspolicikat. Az első backend-kör kizárólag szerveroldali service-role repositoryn keresztül férhet hozzá.

## Azonosítók

- elsődleges azonosítók: UUID;
- projekt-, szervezet- és felhasználókapcsolatok: `text`, hogy a jelenlegi és a későbbi azonosítórendszerhez is illeszthetők legyenek;
- nyers hozzáférési token nem tárolható;
- adatbázisban csak HMAC hash és szükség esetén külön salt tárolható.

## Törlési védelem

A `drop_packages` külön kezeli:

- `expires_at` – normál lejárat;
- `grace_expires_at` – hibakezelési türelmi idő;
- `final_report_status` – riportállapot;
- `delete_status` – objektumtörlés állapota.

A későbbi worker nem indíthat törlést, ha a végleges riport vagy annak kiküldése még hibás, futó vagy újrapróbálási állapotban van.

## Migráció alkalmazási állapota

A migrációs SQL elkészült. Éles adatbázison csak ellenőrzött Supabase/PostgreSQL kapcsolattal, backup és rollback-terv mellett alkalmazható. A DROP funkciók addig kikapcsolva maradnak.

## DROP 0.2.0 kiegészítő táblák

Új migráció: `supabase/migrations/20260801003000_drop_access_engine.sql`.

- `drop_access_tokens` – külön upload/view/download/report capability-tokenek HMAC hash-e, tokenhint, lejárat, státusz és használatszámláló;
- `drop_access_attempts` – PIN- és tokenpróbálkozások IP-, csomag- és token-fingerprint alapú rate limit naplója.

A `drop_packages` korábbi négy tokenhash oszlopa kompatibilitási mező marad, de a DROP 0.2.0 repository már nem használja. Nyers token, PIN vagy nyers IP nem kerül a két új táblába.

Ideiglenes Supabase bootstrap: `supabase/DIMPRO_DROP_020_SUPABASE_BOOTSTRAP.sql`.

## DROP 0.2.0 tranzakciós adatmodell

A csomagmotor readiness ellenőrzéséhez hét tábla kötelező:

1. `drop_packages`;
2. `drop_recipients`;
3. `drop_groups`;
4. `drop_access_tokens`;
5. `drop_access_attempts`;
6. `drop_events`;
7. `drop_schema_meta`.

A `drop_schema_meta` rekordja rögzíti a `DROP 0.2.0` sémaverziót, a 6 migrációt és a `drop-020-atomic-package-engine-20260801` bootstrap azonosítót. A repository nem tekinti késznek a sémát, ha a táblák elérhetők, de a verziójelölő hiányzik vagy eltér.

A csomaglétrehozás nem végez több, egymástól független insertet. A `drop_create_package_atomic` egy tranzakcióban hozza létre:

- a csomagrekordot;
- a címzetteket;
- a logikai csoportokat;
- pontosan négy purpose-specifikus tokenhash rekordot;
- a `package.created` audit eseményt.

A függvény kifejezetten elutasítja a nyers PIN-, token- és linkmezőket. Az alkalmazás csak PIN-hash/só, tokenhash, tokenhint és lejárat értéket ad át az adatbázisnak.

Az állapotváltás és a tokenműveletek külön atomi RPC-ket használnak. A tokenhasználati számláló adatbázisoldalon `use_count = use_count + 1` művelettel nő, ezért párhuzamos kéréseknél sem veszhet el növekmény.

A teljes bootstrap `BEGIN` / `COMMIT` tranzakcióban fut. Hiba esetén a teljes DROP 0.2.0 sémaalkalmazás visszagörgethető, részleges telepítés nem tekinthető elfogadható állapotnak.

