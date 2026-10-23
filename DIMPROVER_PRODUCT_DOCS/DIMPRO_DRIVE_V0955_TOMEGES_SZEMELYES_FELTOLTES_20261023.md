# DIMPRO Drive V0.9.55 – Tömeges Saját Drive fotófeltöltés

Dátum: 2026-10-23
Állapot: SOURCE ONLY, személyes upload feature OFF; DEV és PROD runtime változatlan.
Alapelv: Google Drive-szerű, egy kijelöléssel tömeges feltöltés, meglévő Transfer Center felhasználásával.

## Felhasználói igény és döntés

A V0.9.54 pilot 25 fájl/választás limitje nem volt elfogadható 50–100 helyszíni fotó munkafolyamatához. A V0.9.55 **500 fájlt enged egyetlen kijelölésben**, tehát 50 vagy 100 fényképhez nem kell ismételt választás. Ez kliensoldali BATCH korlát, **nem 500 párhuzamos szerveres POST** és nem memóriába beolvasott képtömeg.

A V0.9.54 **16 MiB/fájl** pilothatár nem módosult. A teljes kijelölésre nem alkalmazunk 16 MiB-os összevont korlátot; minden fájl külön 16 MiB alatti feltöltési kérést kap. Az eredeti kép tartalma jelenleg nem változik meg és nem tömörül automatikusan. A nagyobb képek, HEIC-optimalizálás, eredetifájl-kezelés és multipart/resume külön következő fejlesztési fázis.

## Módosítások

- `app/lib/content-core/personalUploadPolicy.ts`: `PERSONAL_UPLOAD_MAX_FILES_PER_SELECTION=500` és tesztelhető tiszta darabszám-validátor.
- `components/drive/PersonalDriveWorkspace.tsx`: egyetlen 500 elemes fájlválasztásból elkülönített, sorban végrehajtott, egyesével ClamAV+SHA ellenőrzött POST; rögzített célmappa; megszakítás és munkatér-elhagyáskor a további elemek indítása tiltott. Valós XHR adatprogress megjelenítésének legfeljebb ~160 ms-onkénti frissítése, hogy a 500-soros state ne váljon renderelési szűk keresztmetszetté.
- A fájllista 50 sikeres mentésenként és a teljes sor végén újratöltődik, ezért a felhasználó látja a közben megjelenő fájlokat.
- `app/lib/transfer-core/transferModel.ts`, `components/drive/DriveTransferCenter.tsx`: első 60 releváns sor; az aktuális feltöltés mindig előre kerül, legfeljebb 15 nemrég lezárt fájl is szerepel. `Mind a N fájl` opcióban a teljes 500-soros lista látható.
- `app/lib/content-core/repository.ts`: stabil `updated_at DESC, id DESC` rendezésű owner-ellenőrzött 200-as laponkénti `range()` API. `nextOffset` kizárólag a nyers ref-sorok alapján készül, akkor is helyes, ha egy objektum hiányzik.
- `app/api/drive/personal/content/route.ts`: kötelező autentikáció, bemeneti `offset` validáció, `nextOffset` pagination; nincs API-azonosító-szivárgás.
- `components/drive/PersonalDriveWorkspace.tsx`: összeállítja a teljes fájllistát, 10 000 tételes UI safety cap fölött explicit hibával; a korábbi 250-es csendes lista-truncation megszűnt. 10 000-nél több fájlhoz külön későbbi szerveres keresés/lapozás szükséges.

## Kiadási kapuk

A batch-darabszám emelése **nem** enyhít az egyedi POST korlátokon, kvóta-ellenőrzésen, ClamAV-on, SHA-256-on, azonosításon, mappatulajdonjogon, DEV-only flag-en vagy a PROD-tiltáson.

- Szükséges valós DEV böngészős 100 majd 500 darabos teszt (szintetikus, nem éles ügyfélfotókkal), vegyes sikertelen és megszakított fájlokkal.
- V0.9.54 személyes upload `DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED` flag-je továbbra is alapértelmezetten OFF.
- 16 MiB/fájl fölött az automatikus fotóoptimalizálást külön döntés és teszt után lehet bevezetni. A hivatalos dokumentumok eredeti bájtjait nem szabad automatikusan megváltoztatni.
- A szinkron, szerveroldali 1 POST/fájl miatt hosszú feltöltés közben a böngészőnek nyitva kell maradnia. Igazi offline/restart utáni folytatás későbbi persistent queue és multipart feladat.
- A DEV runtime-hoz új BUILD01, izolált PM2 browser smoke és előzetes AUTH/scan/quota/E2E szükséges; PROD DENY.

## Teszt

`scripts/tests/dimpro-drive-v0955-bulk-personal-upload-contract.mjs`: 1/25/50/100/250/499/500 elfogadott, 501 tiltott; 500 elemű queue és láthatóság; 200-as lapozás és full-list UI. A V0.9.54 és régebbi regressziókat is futtatni kell.


### Source quality gate eredmény (2026-10-23)

- 500 darabos batch policy és prioritizált 60 soros queue teszt: PASS.
- TypeScript `npx tsc --noEmit`: PASS.
- Célzott ESLint a megváltozott forrásokra: PASS.
- V0.9.54 personal upload security / V0.9.53 UI / V0.9.52 multipart / V0.9.51 scan + retry / V0.9.50 core szerződéses tesztek: PASS.
- AUTH V0.6.0 personal folder: 17/17 PASS.
- Personal CsomagBOX: 14/14 PASS; projektmappa drag-drop: 22/22 PASS.
- `git diff --check`: PASS.
- Valós, 100/500 fájlos böngészős E2E: NEM FUTOTT, továbbra is release gate.
