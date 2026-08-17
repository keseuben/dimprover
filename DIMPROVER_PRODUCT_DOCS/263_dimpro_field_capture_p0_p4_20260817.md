# DIMPRO Terepi Gyorsrögzítő PWA – P0–P4 DEV baseline

Dátum: 2026-08-17  
Állapot: DEV fejlesztés, külön Context Module  
Forrás specifikáció: `09_DIMPRO_Drop_Terepi_Gyorsrogzito_PWA_reszletes_fejlesztoi_kiegeszites_2026-08-14.pdf`

## Cél

A Terepi Gyorsrögzítő nem új Drop-másolat, hanem külön capture-first PWA. Saját `/field-capture` route-ot, saját feature flaget és saját capture adatmodell-contractot kap, miközben a meglévő DIMPRO motorokat újrahasználja.

## P0 audit eredménye

Újrahasznált motorok:

- képoptimalizálás / HEIC-HEIF / orientáció / fájlnév: `components/drop/dropUploadPreparation.ts`
- későbbi resumable S3 upload transport: `components/drop/dropMultipartClient.ts`
- offline működési referencia: `components/drop/dropOfflineQueueStore.ts`
- A-verziós böngészős Voice session: `components/drop/dropBrowserVoiceSession.ts`
- DIMPRO diktálási és írásjel szabályok: `components/drop/dropSpeechTranscript.ts`
- mikrofonengedély: `components/drop/dropVoicePermission.ts`
- későbbi Drive storage/reference alap: `app/lib/drive-core/*`

A Terepi Gyorsrögzítő saját IndexedDB adatbázist használ: `dimpro-field-capture-v1`. Ebben nincs Send-kód, PIN vagy upload capability token.

## P1 – külön route / PWA shell

- route: `/field-capture`
- feature flag: `FIELD_CAPTURE_ENABLED`
- health: `/api/field-capture/health`
- DEV PWA manifest: `/field-capture-dev.webmanifest`
- Service Worker: `/field-capture-sw.js`, scope `/field-capture/`
- DEV alkalmazásnév: `DIMPRO Terepi Gyorsrögzítő DEV`
- verzió: `0.1.0-dev`

A Service Worker nem cache-el capture képet és API választ; a képek helyi source of truth-ja az IndexedDB queue.

## P2 – kamera/import + local item + preview

- mobil kamera `capture="environment"`
- többképes galéria/import
- maximum 200 kép egy helyi sessionben
- minden új kép először `LOCAL_ONLY`
- helyi session visszaállítás oldalfrissítés/PWA újranyitás után
- képkártya: thumbnail, fájlnév, méret, optimalizálási adat, szerkeszthető megjegyzés, törlés
- opcionális közvetlen telefonos fájlmentés az eredeti in-memory kameraképből

## P3 – közös Image Engine baseline

A kép-előkészítés nem saját algoritmust használ. A `captureImageEngine.ts` adapter közvetlenül a Drop `prepareDropFiles()` motorját hívja medium/strip capture profillal. Örökölt képességek:

- JPEG/JPG/PNG/WEBP
- HEIC/HEIF → JPG irány
- EXIF/display orientation normalizálás
- méretcsökkentés
- thumbnail/preview
- biztonságos fájlnév és időbélyeg

A külön szerveroldali capture upload binding még nincs aktiválva. A hozzá tartozó séma csak draft: `supabase/DIMPRO_FIELD_CAPTURE_P0_P4_SCHEMA_DRAFT.sql`. A draft nincs lefuttatva adatbázison.

## P4 – PreCaptureOptions és session default

A kép készítése előtt bottom sheet jelenik meg. Jelenlegi kapcsolók:

- GPS – alapból KI, P5 adapter előkészítve
- tájolás – alapból KI, P6 adapter előkészítve
- hangos megjegyzés – shared DIMPRO Browser Voice session
- nyers / DIMPRO-tisztázott átirat mód választás
- telefonra mentés
- Saját DIMPRO Drive – P8 előtt disabled
- Projektkapu Drive – P9 előtt disabled
- beállítások megjegyzése session defaultként

GPS és tájolás ebben a baseline-ban csak capture-intent/opció. Szenzormérés nem indul, ezért a UI nem állít READY/REQUESTING állapotot. A tényleges strukturált GPS/heading rekord a P5/P6 során készül.

## Capture schema draft

A draft külön táblákat készít elő:

- `field_capture_sessions`
- `field_capture_items`
- `field_capture_asset_refs`
- `field_capture_locations`
- `field_capture_orientations`
- `field_capture_voice_notes`
- `field_capture_destinations`
- `field_capture_events`
- `field_capture_sync_queue`

A `user_drive_asset_refs` és `project_drive_asset_refs` végleges létrehozása P8/P9 előtt külön Drive ownership/lifecycle audithoz kötött. A közös `blob_id` binding szintén későbbi Media/Drive audit után véglegesítendő.

## Minőségi kapuk

- célzott Field Capture acceptance: 33/33 PASS
- következő kötelező kapuk: TypeScript, ESLint, build, DEV smoke, mobil browser acceptance
- PROD aktiválás tilos külön acceptance és explicit jóváhagyás nélkül

## Következő fejlesztési lépések

1. P0–P4 DEV build és fizikai Samsung/PWA teszt.
2. Biztonságos DEV DB migrációs útvonal rendezése és schema draft felülvizsgálata.
3. Saját field-capture session/item API.
4. Shared Drop multipart upload adapter bekötése a capture assethez.
5. P5 GPS adapter accuracy/status kezeléssel.
6. P6 tájolás adapter heading/accuracy kezeléssel.
7. P7 Voice Engine kibővítés szerveres opcionális transzkripcióval, ha az A browser engine terepen nem elég.
8. P8/P9 Saját Drive és Projektkapu Drive külön ownership/lifecycle.

## DEV host és auth pontosítás

- kanonikus DIMPRO alkalmazás DEV host: `app.dev.dimpro.hu`
- kompatibilis belső DEV host: `dev.dimpro.hu`
- a `/field-capture` oldal központi DIMPRO bejelentkezéshez kötött
- az `/api/field-capture/health` publikus, csak readiness adatokat adó monitoring endpoint
- a Terepi Service Worker kizárólag DEV hoston regisztrálódik, scope: `/field-capture/`

## P0–P4 mobil browser acceptance lezárás

2026-08-17 esti DEV ellenőrzés:

- aktív build: `YemJawidC5RIFJvn2tWjo`
- alkalmazáskód forráscommit: `9f1c071`
- statikus Field Capture acceptance: 36/36 PASS
- mobil Puppeteer acceptance: 19/19 PASS
- tesztelt mobil viewport: 390 × 844, touch/mobile móddal
- authos `/field-capture` oldal HTTP 200 tesztmunkamenettel; kijelentkezve továbbra is 307 -> `/login`
- GPS, tájolás, hang és telefonra mentés alapból KI
- Galéria/file picker közvetlen user gesture-ből megnyílik
- első kép `LOCAL_ONLY` kártyaként létrejön
- képenkénti megjegyzés szerkeszthető
- shared DIMPRO Browser Voice átirat bekerül a megjegyzésbe
- offline állapotban második capture item létrehozható
- IndexedDB queue oldalfrissítés után visszaáll
- mobil UI-n nincs vízszintes overflow
- browser pageerror: 0; console error: 0

A browser acceptance első futása valódi mobil UX-kockázatot talált: a Kamera/Galéria input 40 ms-os késleltetéssel indult, ami elveszíthette a böngésző user-activation állapotát. A `9f1c071` javítás óta az input megnyitása közvetlenül a gombnyomás eseményében történik.

A P0–P4 baseline ezzel DEV szinten lezárható. A fizikai Samsung/PWA acceptance továbbra is szükséges a valós kamera, galéria, billentyűzet, Android download és PWA lifecycle ellenőrzéséhez.
