# DIMPRO Transfer Center V0.9.51 – biztonságos újraküldés és státuszkövetés

2026-10-11 · SOURCE ONLY · PROD DENY · DEV DEPLOY TILOS.
Kiindulás: V0.9.50 build PASS, forráscommit 4dc86aeded1457e8073d1fc5145b02ae4b0dce0b; Build ID tjg_e6REruODm38GVV38L.

## 1. Megvalósult kód

- app/lib/transfer-core/retryPolicy.mjs: osztályozott HTTP-hibák, AbortSignal-vezérelt, legfeljebb 3 próbás teljesfájl-PUT újraküldés (600, 1200 ms visszalépés), FULL_FILE_RETRY versus PART_CHECKPOINT képességszintek.
- app/lib/transfer-core/uploadHttp.ts: XHR upload.onprogress valódi bájtprogress, same-origin/S3 PUT meghagyása; 401/403/404/409/413/422/507 esetén nincs automatikus retry.
- app/lib/transfer-core/scanStatus.ts: Drive vírusellenőrzés és feltöltési munkamenet státuszainak külön, kizárólag GET-alapú, no-store lekérdezése, explicit CLEAN/INFECTED/ERROR/PENDING/SCANNING állapotokkal.
- app/lib/drive-core/storageService.ts: getDriveObjectUploadStatus, csak a hitelesített eredeti feltöltő és az ACL alapján; csak szűkített munkamenet- és véglegesített dokumentumazonosítók.
- app/api/projects/[projectId]/drive/uploads/[uploadId]/status/route.ts: új GET-only endpoint, aktorazonosság, document.write és folder/document ACL-kapu. Nem tartalmaz signed URL-t, S3 key-t vagy auth tokent.
- app/api/projects/[projectId]/drive/documents/[documentId]/versions/[versionId]/security-scan/route.ts: meglévő read-only GET jogosultságának szigorítása dokumentum/mappa ACL-lel.
- components/drive/DriveWorkspace.tsx: max. 2 párhuzamos fájl, teljesfájl-PUT automatikus retry, manual Újra csak új init + új teljes fájl-küldés esetén, öt másodperces és legfeljebb 3 egyidejű scanner/session status GET; jogosultságvesztés külön állapot; projektváltáskor abort/cleanup in-memory.
- components/drive/DriveTransferCenter.tsx: új Újra gomb, retry próbálkozási darabszám, szerveroldali véglegesítés ismeretlen állapotának visszajelzése.
- app/lib/transfer-core/transferModel.ts: CONFIRMATION_UNKNOWN, STATUS_UNAVAILABLE, retryCount, session/document/version ID. V0.9.51 source marker.
- app/lib/transfer-core/dropResumeAdapter.ts: Drop meglévő multipart + checkpoint motorjának újrahasznosítható adaptere, a Drop futó UI változtatása nélkül.
- components/drive/driveHelpData.ts: fázis- és újrapróbálási magyarázat, a valós Drive és Drop resume-képesség külön feltüntetésével.

## 2. A legfontosabb fail-closed biztonsági helyreállítás

Ha a fájl teljesen felment, de a véglegesítés POST-válasza megszakad, a kliens NEM ismétli meg vakon az init vagy complete POST-ot, és NEM nyit automatikusan új dokumentumot. CONFIRMATION_UNKNOWN állapotra vált és az eredeti Drive upload sessiont kérdezi le a read-only GET /status útvonalon. Ha FINALIZED és ismert a dokumentum/verzió UUID, a scan státusz következik. Ha másik aktor, jogosultsághiba vagy hiányzó dokumentum van, a státusz külön STATUS_UNAVAILABLE, NEM SCAN_FAILED. Ha továbbra is INITIATED, felhasználói/felügyeleti tisztázás szükséges.

A kliens nem tárol signed URL-t, S3 tokent vagy File bájtokat tartós webtárhelyen; a retry csak ugyanazon nyitott React munkatérben elérhető helyi File objektummal működik.

## 3. Korlátok

- **Drive esetében még NINCS valós bájt-/fájlrész-szintű resume.** A rendszer 408/429/5xx vagy hálózati megszakadás esetén csak a teljes fájl feltöltését ismételheti, legfeljebb háromszor. A felhasználói Újra gomb új, server-oldalon ismét hitelesített munkamenetet hoz létre.
- A Drop létező multipart motorja valóban támogatja a befejezett fájlrészek alapján folytatást. A közös adapter elkészült, de a Drop jelenlegi felülete még nincs átirányítva a Drive Transfer Centerre.
- Nem készült Drive upload part-sign/part-confirm/checkpoint adatbázis, tartós queue vagy service worker/Windows Agent háttérfolytatás; a régi fejlesztői chunk preview API NEM használható automatikusan éles projektfeltöltésre.
- A scanner státusz-GET NEM indít új ClamAV vizsgálatot, és a CLEAN NEM azonos automatikus dokumentumjóváhagyással.
- A 550 MiB DIMPRO scanner-korlát csak programkonfiguráció: tényleges ClamAV daemon StreamMaxLength, MaxFileSize és MaxScanSize értéke alacsonyabb lehet. Üzembe helyezés előtt hiteles daemon-konfiguráció és nagyfájl teszt szükséges.
- Nem volt élő DEV/PROD adatbázismigráció, deploy, PM2 restart, nginx módosítás, Drive/Drop ügyfélfájl feltöltés, licencmódosítás vagy éles SMTP.

## 4. Tesztek

- scripts/tests/dimpro-transfer-v0951-resume-scan-contract.mjs: 16 biztonsági/integrációs feltétel, HTTP hibabesorolás, retry-várakozás abort, szerver státusz és ACL-szerződés, fail-closed reconciliation.
- scripts/tests/dimpro-transfer-v0951-http-retry-contract.mjs: első PUT 503 majd 200, valódi progress újrakezdése 0-ról, 403 és abort nem ismételhető.
- V0.9.50 kompatibilitási regresszió, Drive/Drop célzott biztonságos forrásteszt, npx tsc, ESLint.
- BUILD01 teljes Next.js fordítás (külön végleges ellenőrzés szükséges), DEV telepítés nincs.

## 5. Kiemelt további fejlesztés

V0.9.52: Drive authenticated S3 multipart protokoll, init/sign/PUT/confirm/status/complete/abort, egyes részek SHA-256/ETag ellenőrzése, hard quota, projekt- és mappa-ACL, orphan session cleanup, folytatható checkpoint metadata és szerveroldali automatikus újrapróbálási/scan reconciler. Ez új adatbázis-séma és izolált DEV acceptance nélkül NEM aktiválható.

PROD DENY. A jelenlegi DEV kiadásjelölt telepítése is külön, rollbackel és tárhelyellenőrzéssel jóváhagyandó.

## BUILD01 V0.9.51 – végleges ellenőrzött kiadásjelölt

- Forráscommit: 410c24b4cfab0239a40b609c812c288e89aa882d.
- Remote runner: BUILD01 · build PASS · Next.js 16.2.6 · 104/104 oldal · teljes TypeScript PASS · 274 statikus chunk.
- Build run: benjadmin-transfer-v0951-410c24b4c-20261011-build01-b1.
- Build ID: OYwrAU3AePxjluXmuU2pa.
- SHA-256 artifact: a5a7b34a04968ff40e44fda10b4d07df2426d4d5596c0a5f2dad2d242ea1b4ba.
- A build gateway metaadat és a tényleges tar.gz SHA-256 értéke egyezik.
- Artifactban ellenőrizve: Transfer Center, retryPolicy.mjs, scanStatus.ts, dropResumeAdapter.ts és a védett upload-session GET status route.
- Előző V0.9.50 szerződéses tesztek, új V0.9.51 scan/retry és 11/11 kiválasztott biztosan non-destructive regressziós teszt PASS, célzott ESLint és TypeScript PASS. Nincs hitelesített futó böngészős upload/ACL E2E a V0.9.51-hez.
- DEV root tárhelyellenőrzés SSH, kizárólag olvasás: 118 GiB, 117 GiB használt, kb. 714 MiB szabad, df 100%. A DotRoll VPS kapacitás rendezéséig különösen tilos új DEV telepítés.
- A futó Drive DEV oldal HTTP 307 átirányítása ellenőrzött, a helyes autentikációs viselkedés miatt önmagában nem bizonyítja, hogy V0.9.51 fent lenne – NINCS feltéve.
- ÉLES PROD ÉRINTETLEN · DEV runtime érintetlen · PROD DENY.
