# DIMPRO Drive V0.9.56 – Nagyobb Saját Drive fájlok

**Dátum:** 2026-10-23  
**Release:** SOURCE ONLY / DEV ONLY / PROD DENY.  
**Előző publikus böngészős DEV:** V0.9.52, port 3413. V0.9.55 build standalone, de nem aktivált.  
**Új igény:** 16 MiB/fájl nem használható Drive-szerű mérnöki állománytárhoz; az 500-fájlos batch limit külön dimenzió.

## 1. A V0.9.56-ban elkészült

- A személyes fájlfeltöltési alkalmazás 100 MiB/fájl *maximális ellenőrizhető pilot méretet* ad a korábbi 16 MiB helyett, de szerveroldalon az effektív limit továbbra is `min(100 MiB, tényleges DRIVE ClamAV-limit, tényleges S3 upload-limit)`.
- **Két eltérő HTTP-útvonal:** <=16 MiB: meglévő, memóriakorlátos `POST /api/drive/personal/uploads` form-data; 16–100 MiB: `POST /api/drive/personal/uploads/stream`, nyers `application/octet-stream` body.
- Az új szerverroute **csak** DEV engedélyezett flag és hitelesített személyes identitás mellett érhető el. Same-origin HTTPS Origin, request UUID, név és MIME metaadat, owner-only célmappa, személyes kvóta + atomikus commit, kötelező numerikus Content-Length.
- A 100 MiB-os fájl soha nem kerül egyetlen teljes egészében RAM-ba: beérkező stream byte-számlálva limitált, egyedi 0700-as /tmp könyvtárban 0600-as fájlba kerül, majd disk streamen át a közös ClamAV INSTREAM ellenőrzi. Nem „darabonkénti tisztaságot” állítunk, a *teljes fájlt* ellenőrizzük.
- Csak `clean` státusz után engedünk S3 írást; a helyi staging fájlból streamelünk, majd a teljes S3 objektum SHA-256 hash + hosszát összevetjük a vizsgált állománnyal. Csak ezután jöhet Content Core-regisztráció, USER-ref, kvóta és mappa.
- Előzetes 100 MiB korlát, stream-túlfutás, csonka tartalom, hibás MIME/név/UUID esetén fail-closed. Az ideiglenes fájlt az egyedi staging directoryból `finally` tisztítjuk; processz váratlan kilövése utáni orphan retention külön ellenőrzést igényel.
- A böngészős XHR a 16 MiB fölötti fájloknál automatikusan az új streaming végpontot választja, és továbbra is valós byte-feltöltési folyamatot jelenít meg. 500 elem/választás változatlan, egymás utáni 1 szerver POST/fájl.
- A személyes gomb súgóját a korábbi „még nincs bekötve” állapotról a DEV feature-flag feltételéhez és a tényleges 500/100 MiB határhoz igazítottuk. Funkció ennek ellenére **még nem aktív** a V0.9.52 böngészőben.

### Tényellenőrzött szerverplafon – 2026-10-23

- DEV Nginx `drive.dev.dimpro.hu`: `client_max_body_size 120m`.
- ClamAV daemon: `MaxScanSize 120M`, `MaxFileSize 110M`, `StreamMaxLength 110M`, `active`.
- Drive saját `DIMPRO_DRIVE_MAX_SCAN_MB` hiányában default: **100 MiB**.
- Drive S3 `DIMPRO_DRIVE_MAX_UPLOAD_MB` hiányában default: **100 MiB**.
- `/tmp` disk-backed, ugyanazon DEV 236GiB root fájlrendszeren, ~128GiB szabad tér a vizsgálatkor.
- Egyszerre legfeljebb egy személyes fájl feldolgozása a kliens oldalon, ezért nincs 500 × 100 MiB memóriafoglalás.

## 2. Google Drive / OneDrive-szerű végleges cél

A 100 MiB **nem végleges termékhatár**. A nagyobb, például 1–5 GiB-os terv/BIM/IFC/ZIP/videó állományokhoz:
1. A meglévő Drive S3 multipart és Transfer Core motor USER tulajdonú feladattal, külön szerveroldali upload session táblával, CAS állapotváltásokkal, kvóta-rezervációval és per-user auth/ACL-lel egészítendő ki.
2. 64 MiB körüli, konfigurálható részek közvetlenül a S3-ba menjenek; csak ellenőrzött partlista + teljes objektum SHA-256 után legyen szerveroldali finalizálás. Browser session-visszatéréskor ellenőrzött checkpoint alapján folytatható legyen, ne nulláról kezdjen.
3. S3 objektum a teljes fájl ellenőrzéséig KARANTÉN státuszban maradjon. **Nem kerülhet CLEAN / letölthető állapotba olyan fájl, amely meghaladja az aktív, teljesen validált vírusellenőrzési limitet.** Ehhez izolált nagyfájl-scanner, memória-/CPU-/időkeret és auditált infrastruktúra-bővítés szükséges.
4. Végleges maximumot az adott csomag tárhelykvótája, a validált scanner, a felhő objektumtár és az adminisztrátori feltöltési szabály határozza meg. Célként 5 GiB/fájl technikai támogatás megfelelő, később skálázható; ez **nem jelenlegi aktív képesség**.
5. Fájlméret-különbséget ne automatikus kép/PDF tömörítéssel hidaljuk át: az eredeti mérnöki állomány bájtpontosan megőrzendő. Képoptimalizálás később opcionális képworkflow-ként készülhet, változatlan eredetivel vagy felhasználói szabály szerint.

## 3. Kiadási kapuk

1. SOURCE: TypeScript, célzott ESLint, V0.9.56 új stream/security unit, V0.9.54/V0.9.55 és V0.9.50–53 regresszió.
2. BUILD01 SHA-pinned build, kizárólag izolált DEV kandidát.
3. DEV runtime: az új `/stream` body-korlát, feldolgozási timeout, staging fájlrendszer jogosultság/retention auditja; elveszett válasz, megszakítás, 16/17/99/100/101 MiB per-file E2E.
4. Hitelesített accounttal valós CLEAN, EICAR-fájl kizárás izolált teszten, S3 SHA, idempotens request, USER owner ACL, folder, letöltés, quota; 50–100 foto sorozat után listázás és UI progress.
5. Feature flag `DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED` alapból OFF, csak az összes kapu teljesítése után kapcsolható be. Nincs PROD módosítás, nincs Central Developer Grid módosítás.

## SOURCE QA eredmények (2026-10-23)

- TypeScript `npx tsc --noEmit`: PASS.
- Célzott ESLint: PASS (nincs figyelmeztetés a vizsgált módosított fájlokon).
- V0.9.56 stream méret / MIME / 180 karakteres Unicode név / csonka / túlcsordult body tiszta aszinkron generátoros ellenőrzések: PASS.
- V0.9.55 500-fájlos sor / lapozás, V0.9.54 personal upload, V0.9.53 Transfer UI, V0.9.52 multipart, V0.9.51 scanner/retry, V0.9.50 átviteli teszt: PASS.
- AUTH personal folders, CsomagBOX és project folder-drop regresszió: PASS.
- Git diff whitespace: PASS.
- **Nem történt teljes hitelesített end-to-end feltöltés vagy vírusteszt; a feature flag OFF.**
