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
