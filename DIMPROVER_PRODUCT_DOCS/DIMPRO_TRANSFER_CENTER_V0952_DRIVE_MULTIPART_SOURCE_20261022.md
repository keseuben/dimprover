# DIMPRO Transfer Center V0.9.52 – Drive S3 multipart szerveroldali lifecycle

**Dátum:** 2026-10-22
**Állapot:** SOURCE ONLY · NOT DEPLOYED
**Környezet:** DEV fejlesztési forrás
**PROD:** DENY

## Cél

A Projekt Drive V0.9.51 teljesfájlos signed PUT feltöltésének biztonságos, visszafelé kompatibilis bővítése valódi S3 multipart szerverprotokollal. A V0.9.52-ben a multipart út **opt-in** (`uploadProtocol: "multipart"`); a meglévő kliens alapértelmezett működése továbbra is a V0.9.51 single PUT. Kliensoldali automatikus resumable aktiválás, háttérqueue és PROD/DEV runtime kiadás ebben a változtatásban nincs.

## Megvalósított szerverfolyamat

1. `POST .../drive/uploads/init` multipart kérésnél továbbra is ellenőrzi a projekt/mappa vagy dokumentum ACL-t, a fájlméretet, a scanner korlátot és a projektkvótát.
2. Multipart indításhoz kötelező a teljes fájl SHA-256 lenyomata. A session 24 órás lejáratot kap, az alap chunk méret 64 MiB (`DIMPRO_DRIVE_MULTIPART_CHUNK_MB`, 5–512 MiB clamp).
3. A Drive S3 adapter külön `CreateMultipartUpload`, `UploadPart` signed URL, `ListParts`, `CompleteMultipartUpload` és `AbortMultipartUpload` műveleteket kezel.
4. `POST .../parts/{partNumber}` csak az eredeti feltöltő, aktuális projekt- és mappa/dokumentum ACL mellett ad signed part URL-t. Ha a rész már S3-ban létezik, külön jelzi az `alreadyUploaded` állapotot; `alreadyCompleted` csak akkor igaz, ha az ETag/méret/SHA audit is korábban visszaigazolt.
5. `PATCH .../parts/{partNumber}` az S3-ban ténylegesen létező rész ETag- és méretadatait ellenőrzi, kötelező kliensoldali part SHA-256 auditértéket tárol.
6. `GET .../checkpoint` kizárólag olvasó, owner/ACL-kötött S3 checkpointot ad vissza. Külön kezeli az S3-ban már feltöltött (`uploadedPartNumbers`) és a teljesen auditált (`completedPartNumbers`) részeket. A partlista 1000-es S3 lapokkal lapozható.
7. `POST .../complete` csak akkor fűzi össze az S3 multipart objektumot, ha minden part visszaigazolt, az S3 partlista teljes, az ETag/méret és a part SHA audit konzisztens. Ezután a korábbi Drive folyamat változatlanul teljes objektum HEAD + szerveroldali SHA-256 ellenőrzést, atomikus dokumentumverzió-véglegesítést és a route-on ClamAV karanténvizsgálatot végez.
8. Elveszett S3 complete válasz esetén a `NoSuchUpload` nem okoz automatikus új feltöltést: a kész objektum HEAD + teljes SHA-256 ellenőrzése dönti el, folytatható-e a finalizálás.
9. Az abort út most owner- és ACL-kötött; aktív multipartnál S3 multipart abortot, single módban a korábbi objektumtörlést végzi.

## Perzisztencia és konkurencia

Új SQL-migráció nincs. A multipart állapot a meglévő `drive_core_upload_sessions.metadata` JSON mezőjében él. A párhuzamos part-confirm frissítésekhez az új repository helper `updated_at` alapú optimista compare-and-swap frissítést és legfeljebb öt újrapróbálást használ; ütközéskor fail-closed `DRIVE_UPLOAD_METADATA_CONFLICT` történik.

Ez átmeneti V0.9.52 megoldás. A következő fejlesztési körben külön, perzisztens TransferJob/part modell és reconciler/lejárt multipart cleanup szükséges, mielőtt a funkció általános felhasználói resumable szolgáltatásként aktiválható.

## Biztonsági invariánsok

- minden init/sign/confirm/checkpoint/complete/abort projektjoghoz kötött;
- a multipart session csak a létrehozó actor számára használható;
- mappa/dokumentum ACL minden lépésben újraellenőrződik;
- storage key, S3 multipart ID és bucket titkos szerveroldali metaadat marad, kliensválaszba nem kerül;
- multipart session nem használhatja a single browser PUT endpointot;
- részméret, S3 ETag és visszaigazolt SHA-256 audit kötelező a complete előtt;
- teljes objektum szerveroldali SHA-256 ellenőrzése megmarad;
- a 100% feltöltés továbbra sem jelent vírusmentes/jóváhagyott dokumentumot;
- explicit `DIMPRO_DRIVE_MAX_SCAN_MB` nélkül a Drive scanner fail-closed **100 MiB** limitet használ, és többé nem örökli automatikusan a DROP történeti 550 MiB-os defaultját; nagyobb Drive feltöltési plafon csak külön, a clamd tényleges limitjéhez igazított Drive scan-konfigurációval engedhető;
- PROD hozzáférés és deploy: DENY.

## Forrásváltozások

- `app/lib/drive-core/storageConfig.ts`
- `app/lib/drive-core/s3ObjectStorage.ts`
- `app/lib/drive-core/storageRepository.ts`
- `app/lib/drive-core/storageService.ts`
- `app/lib/drive-core/store.ts`
- `app/api/projects/[projectId]/drive/uploads/[uploadId]/parts/[partNumber]/route.ts`
- `app/api/projects/[projectId]/drive/uploads/[uploadId]/checkpoint/route.ts`
- `app/api/projects/[projectId]/drive/uploads/[uploadId]/abort/route.ts`
- `components/drive/driveBuildInfo.ts`
- `app/lib/transfer-core/transferModel.ts`
- `scripts/tests/dimpro-transfer-v0952-drive-multipart-contract.mjs`

## Validáció

- V0.9.52 multipart contract: PASS.
- V0.9.51 resume/scan regresszió: PASS, 16 security/integration assertion.
- V0.9.50 Transfer Center regresszió: PASS, 19 integration assertion.
- V0.9.50 XHR real-byte transport: PASS.
- TypeScript `npx tsc --noEmit`: PASS.
- `git diff --check`: PASS.
- Célzott ESLint: a módosítások nem adtak új lint hibát; a `storageRepository.ts` 129. sorában lévő két `no-explicit-any` hiba 2026-09-27-i, változatlan baseline.
- Kiegészítő regresszió: quota 29/29 PASS, folder-drop 22/22 PASS. A régi `drive-security-v050-contract` 41/47 marad (a 6 FAIL kizárólag az időközben átépített Projectkapu/Standalone UI szöveg- és gombassertionje); a `drive-v0913-project-access-admin-contract` exact V0.9.13 verzióassert miatt már a V0.9.51 baseline-on sem futtatható változtatás nélkül. Ezeket nem minősítjük V0.9.52 regressziónak.

## 2026-10-22 friss DEV infrastruktúra-audit

- tényleges runtime host: `dimpro-dev`;
- root fájlrendszer: kb. 236 GiB összes / 105 GiB foglalt / 131 GiB szabad / 45%; inode kb. 17%; a korábbi tárhelyblokkoló megszűnt;
- publikus Drive Nginx upstream: `127.0.0.1:3412`;
- publikus Drive runtime/header: `c74326afd` · Drive V0.9.33 · REVIEW INSPECTOR + RESIZABLE PREVIEW DEV;
- V0.9.51 és V0.9.52 nincs a publikus DEV runtime-on;
- `dimpro-drive-v0932-help-search-a11y-2e297a8a-p3411` és `dimpro-drive-v0933-ui-c74326afd-p3412` online; V0.9.30 rollback már stopped;
- AUTH `dimpro-auth-v044-f65fe8f5-p3367` online; `/health/ready` PASS, DB ready, migrationCount 11;
- `drop.dev.dimpro.hu` és `license.dev.dimpro.hu` továbbra is eltérő DROP 1.2.13 konfigurációt ad, ezért nem kezelhetők egyetlen kiadási célként.

**Kiadási következtetés:** a tárhely G1 kapu most teljesíthető, de runtime release továbbra is NO-GO mindaddig, amíg a DEV/PROD adatforrás-szétválasztás, ClamAV tényleges daemon limitek, izolált candidate/rollback rehearsal és hitelesített browser E2E külön nem PASS. E dokumentum nem ad deploy-jóváhagyást.

## BUILD01 b2 – végleges source candidate

- source commit: `1402cd6e5b74233c157a70f1266a37a2495069f6`;
- branch: `worker/benjaminai/drive-desktop-v019-v0924-integration-20261007`;
- run: `benjadmin-transfer-v0952-1402cd6e5-20261022-manual-build01-b2`;
- runner: `build01` / `build01.dimpro.hu`;
- Build ID: `gcR71rHsVAwbC8B1rk6vz`;
- artifact SHA-256: `43cf36ceaa96c9d0292082e29b0f0a679ba772dd9874f85e62a43e4a52573cfb`;
- artifact méret: `96,883,523` byte;
- source / metadata / result / visszaszinkronizált DEV artifact SHA ellenőrzés: PASS;
- a build artifact tartalmazza az új Drive multipart `checkpoint` és `parts/[partNumber]` route-okat;
- `productionAccess=DENY`;
- runtime deploy, PM2 restart, Nginx módosítás, DB-migráció: **nem történt**.

A normál Build Transport Gateway dispatch a build előtt HTTP 403-mal blokkolódott. A dokumentált manual safe fallback ugyanazzal a hardened `/srv/dimpro-build/bin/dimpro-build-runner-executor-v1` végrehajtóval, BUILD01-en futott. A runner a build előtt `READY/FREE`, `Storage Governor=SAFE` állapotú volt. A build provenance és artifact checksum utólag teljesen visszaellenőrzött.

## Friss DEV release-gate – 2026-10-22

| Gate | Friss állapot | Bizonyíték / következő feltétel |
|---|---|---|
| G0 – Scope / release approval | **NO-GO** | Source/build engedélyezett; runtime deployra nincs külön célhost-specifikus jóváhagyás. |
| G1 – DEV tárhely | **PASS** | `dimpro-dev` root kb. 236 GiB / 105 GiB foglalt / 131 GiB szabad / 45%; inode 17%. |
| G2 – Host routing | **RÉSZBEN PASS / release NO-GO** | `drive.dev.dimpro.hu` jelenleg 3412 / V0.9.33; candidate port/rehearsal még nincs. |
| G3 – Build provenance | **PASS** | `1402cd6e5...`, BUILD01 b2 PASS, SHA `43cf36ce...73cfb`. |
| G4 – Runtime isolation | **NO-GO** | V0.9.52 candidate runtime még nincs kibontva/indítva; publikus runtime érintetlen. |
| G5 – AUTH/DB szétválasztás | **RÉSZBEN IGAZOLT / NO-GO** | Central AUTH explicit `db.dimpro.hu/.../dimpro_auth_dev`; a Drive legacy Supabase adatforrás DEV-vs-PROD teljes provenance-a külön bizonyítandó. |
| G6 – ClamAV / méret | **PASS a jelenlegi 100 MiB alaplimitre; nagyfájl NO-GO** | clamd aktív; `StreamMaxLength=110M`, `MaxFileSize=110M`, `MaxScanSize=120M`. Drive implicit scanner-default most 100 MiB. 100 MiB fölötti Drive upload csak explicit, daemonhoz igazított új limit + E2E után. |
| G7 – Regresszió / acceptance | **SOURCE+BUILD PASS / browser E2E HIÁNYZIK** | Transfer contractok, TS/lint és build PASS; valódi böngészős multipart/resume még nincs, kliens sincs átkapcsolva. |
| G8 – Rollback | **NO-GO** | V0.9.52 candidate cutover/rollback rehearsal még nincs. |
| G9 – Licencadmin mellékhatás | **NO-GO / nem újramérve** | A monorepo közös License/Admin hatásait candidate runtime előtt ismét ellenőrizni kell. |
| G10 – PROD védelem | **PASS / DENY** | PROD-hoz nem történt hozzáférés vagy módosítás. |

Külön koordinációs megjegyzés: a Central Developer Grid `state.json` jelenlegi task/session bejegyzése még a korábbi Drive Desktop V0.1.8 source provenance-ét tartalmazza, miközben a V0.9.51 és V0.9.52 BUILD01 futások ugyanennek a task/session azonosítónak a Transfer branchét használták. A Grid provenance ezért **stale**, release-green bizonyítékként nem használható, amíg nincs szabályosan szinkronizálva. A Git local/remote authoritative branch viszont egyezik.
