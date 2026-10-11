# DIMPRO Transfer Center V0.9.50 – Projekt Drive feltöltéskövető MVP

2026-10-11. Státusz: SOURCE-ONLY CANDIDATE · PROD DENY · DEV DEPLOY TILOS.
Előzmény: DIMPROVER_PRODUCT_DOCS/DIMPRO_DROP_DRIVE_CROSS_SYSTEM_AUDIT_20261011.md.

## Elkészült

1. app/lib/transfer-core/transferModel.ts – közös, tisztán számoló feladat-, fázis-, byte-progress, sebességsimítás- és ETA modell. Soha nem ad hamis scanner %-ot.
2. app/lib/transfer-core/uploadHttp.ts – böngészős XMLHttpRequest PUT, valódi upload.onprogress bájtokkal, meglévő Drive browser/signed S3 célokkal, HTTP hiba és AbortSignal kezeléssel.
3. components/drive/DriveTransferCenter.tsx + CSS modul – jobb alsó, nem modális Transfer Center. Összecsukható, elrejthető, újranyitható, per-file táblázat és progress, teljes byte-progress, sebesség/ETA, scan státusz, hiba, leállítás, helyi lezárt sorok tisztítása. Alapból legutóbbi 60 sor, opcionális teljes lista, reszponzív nézet.
4. components/drive/DriveWorkspace.tsx – a meglévő új dokumentumok file input + Explorerből external drag-drop útvonala a közös feltöltési modellre kapcsolva. Két párhuzamos munkamenet, 160 ms állapotfrissítési küszöb, második teljes batch egyidejű indítása tiltva. Minden feltöltés továbbra is init → S3 PUT → complete → szerveroldali SHA + ClamAV, audit és karantén.
5. app/lib/drive-core/securityScanService.ts és storageService.ts – 413-as, szerveroldali DRIVE_SECURITY_SCAN_SIZE_LIMIT gate a scanner által ellenőrizhető maximummal. A quota/S3 session írás előtt fut. A Drive tárhely maxUpload limitje változatlanul megmarad.
6. components/drive/driveHelpData.ts és DriveHelpCenter.tsx – Projekt munkatérre szűkített önálló Transfer Center súgótéma és öt kezelőszerv.
7. components/drive/driveBuildInfo.ts – forrásverzió V0.9.50. Nem a már működő DEV verziója.

## Fontos biztonsági és UX korlátok

- A százalék kizárólag hálózaton továbbított bájtokat mutat, nem vírusellenőrzést vagy jóváhagyást. CLEAN → jóváhagyásra vár, INFECTED blokkolt, scan ERROR karantén, PENDING nincs késznek jelölve.
- A panel csukása/elrejtése nem szünteti meg az aktív, nyitott React munkatér feltöltését. Teljes lapbezárás/újratöltés, munkatérváltás vagy kapcsolatvesztés esetén nincs Drive-automatikus folytatás; a beforeunload csak figyelmeztetést kezdeményez.
- A már elindult szerveroldali SHA/ClamAV nem megszakítható a panelből. Megszakítás a QUEUED/INITIALIZING/UPLOADING fázisokban engedélyezett.
- A helyi Transfer Task lista nem perzisztens, nem tartalmaz S3 signed URL-t vagy AUTH tokent, és nem módosít licencet.
- A kétszálas új feltöltő a Projekt Drive új dokumentum útjára vonatkozik. Saját Drive direct upload továbbra is kikapcsolt; Drop továbbra is külön multipart/resumable feltöltőt használ. A Drive verzió/revízió dialógusai még a korábbi egyenkénti fetch útvonalat használják.
- A Drive-ban nincs per-file retry, tartós queue, szerver oldali scanner SSE/poll, vagy fájlragasztás a Windows Intézőbe. A meglévő S3 signed PUT URL-lejárat miatt a nagy fájloknál az átvitel még megszakadhat; a 100 MiB Drive feltöltési és 550 MiB ClamAV alapértelmezés NEM garantált élő konfiguráció.
- Drop → projekt Drive célmappa, import-reconciler és legacy license cutover nem tartozik ebbe a scope-ba. A régi jogok és fájlok változatlanok.

## Ellenőrzések

Új, izolált Node szerződéses tesztek:
- scripts/tests/dimpro-transfer-center-v0950-contract.mjs – byte-progress, ETA, állapot, kizárólag hozzáféréssel induló Projekt Drive upload, scanner limit, mini nézet, HELP, verzió.
- scripts/tests/dimpro-transfer-http-v0950-contract.mjs – szimulált XHR progress, HTTP-hiba, same-origin cookie, signed URL, előzetes és folyamat közbeni leállítás.
- TypeScript, célzott ESLint és biztonságos Drive/Drop forráskontraktusok; BUILD01 eredmény a sikeres remote build után kerül ide.

Régebbi tesztelt forrás-kötések: drive-browser-upload-proxy-v043, drive-v064-fullscreen-details-drag, drive-v0931-help-ux-audit, drive-v098-reload-loop, drop-drive-incoming-v010, drop-v129-runtime-regression, drive-desktop-windows-v017.
Az elavult V0.9.13/V0.9.25 source-verzióra rögzített tesztek természetesen hibáznak új 0.9.50 esetén. A V0.5.0 Drive Security teszt hat régi Projektkapu/Standalone szöveges UI mintára bukik (41/47 PASS), ez önmagában nem runtime malware-scan hiba.
A historical drive-project-provision-upload-v110-runtime-e2e és drop-v129-full-e2e írásra képes E2E script, és NEM használható source-only regresszióra. A helyi előfeltételek hiányoztak (tokenfájl és futó E2E port; a Drop kulcsok sem voltak exportálva). Élő, valódi Drive tartalommal vagy PROD-ban ezek futtatása külön engedély nélkül tilos.

## Következő acceptance DotRoll kapacitásrendezés után

- Jogosulatlan projektmappa / upload megtagadás és kvóta.
- 10x1 MiB, 100x2 MiB, 2x95 MiB: külön fázisok, 2 párhuzamos slot, progress és ETA valós hálózati méréssel.
- Idő előtti megszakítás, Hálózati 4xx/5xx, S3 signed URL lejárat, rollback/abort, vírusmentes / fertőzött / scanner error.
- 413-as scanner limit bizonyítása még session/kvóta foglalás előtt.
- Panel elrejtés/összecsukás, mobilos használat, fájl- és mappabeadás, ékezetes hosszú fájlnevek, szemantikus hozzáférés.
- PROD DENY; rollback és közös BENJADMIN 3100-host hatáselemzés szükséges.

## V0.9.51 irány

Valódi közös Drop/Drive Transfer Queue Engine, idempotens server-side transfer job, scanner status polling/SSE, per-file retry/resume, külön Personal Drive és verzió/revízió adapter. A UI látvány további animációja csak ezek után indokolt.

## BUILD01 ellenőrzött V0.9.50 source release candidate – 2026-10-11

- Build runner: BUILD01, PASS.
- Run: benjadmin-transfer-v0950-4dc86aede-20261011-build01-b1.
- Hiteles forrás: 4dc86aeded1457e8073d1fc5145b02ae4b0dce0b.
- Build ID: tjg_e6REruODm38GVV38L.
- Artifact SHA-256: 90ec7269ed7fa209ab581aed9c526bcd7bb139fb155c5bf00c21c590c65f3eca.
- A tényleges tar.gz SHA-256 és a remote build gateway metadata megegyeznek.
- Next.js 16.2.6 optimalizált fordítás PASS (101 s), teljes TS PASS (2.8 perc), 104/104 page generation PASS, 274 standalone CSS/JS állomány ellenőrizve.
- Artifact tartalmazza a Transfer Center TSX/CSS, a közös transfer-core model + XHR motor és a szerveroldali scanner kaput. A lefordított CSS chunkokban az új Transfer Center CSS is ellenőrzötten szerepel.
- QA: 19/19 új integrációs ellenőrzés, új XHR mock (signed/same-origin, valós byte progress, megszakítás, HTTP failure), 9/9 kiválasztott garantáltan non-destructive Drive/Drop regresszió, TypeScript, ESLint PASS.
- A korábbi infrastruktúra-összesítő útvonalhoz tartozó Turbopack figyelmeztetés ismét megjelent, de a teljes build PASS.
- DEV root read-only tárhelyellenőrzéskor 118 GiB méret mellett 807 MiB szabad, df szerint 100% foglaltság. DotRoll bővítésére várunk.
- Sem DEV, sem PROD alkalmazást nem telepítettünk vagy indítottunk újra. Nincs valódi fájlfeltöltés, DB írás/migráció, változtatott licenc, Nginx vagy SMTP művelet.

Következő biztonságos lépés a V0.9.51 izolált Transfer Task/Job újrapróbálási és scanner státuszkövető interfészének forrásfejlesztése, a DEV/PROD bármilyen runtime beavatkozása nélkül.
