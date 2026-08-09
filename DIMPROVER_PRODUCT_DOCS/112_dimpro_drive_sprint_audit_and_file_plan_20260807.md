# DIMPRO Drive – 7 napos sprint induló audit és fájlszintű megvalósítási terv

Dátum: 2026-08-07
Cél: DRIVE 1.0.0-RC1, célhatáridő 2026-08-14.
Forrás: `DIMPRO_Drive_komplex_fejlesztesi_es_kodolasi_terv_v1_2026-08-07`.

## 1. Induló szerverállapot

- Projektgyökér: `/root/dimprover`.
- PM2: `dimprover` online, cwd `/root/dimprover`, `npm start` → `scripts/start-next-standalone.cjs`.
- Aktív release pointer: `.next-v122-release-final`, build ID `r2ZFL-goBnOHXH_veTf8a`.
- Nginx konfigurációteszt: rendben.
- RAM: 3.8 GiB összesen, kb. 3.0 GiB elérhető az auditkor.
- Swap: 6.5 GiB összesen, kb. 1.2 GiB használat; memória-/swap-beavatkozás nem indokolt.
- Lemez audit előtt: 91% használat, kb. 7 GiB szabad.
- Takarítás után: 77% használat, kb. 18 GiB szabad.
- Törölt, újragenerálható build-artifaktok: `.build-swap-v060`, `.next-v098-release-final`, `.next-v099-release-final`, `.next-v100-release-final`.
- Megtartott élő és közeli rollback release-ek: v122 aktív; v121/v120/v110 megtartva.

## 2. Backup / rollback

Induló forrásbackup:

`backups/dimpro-drive-sprint-pre-20260807T193419Z.tar.gz`

SHA-256:

`c297194569715248290470214b3f417d3b405ceec40b8bb15607ed5539526fe1`

A backup a Drive, Projektkapu, Drive API, Drive Core, Project Core, Project Gate, desktop kliens és Supabase Drive-közeli forrásait tartalmazza.

## 3. Párhuzamos fejlesztés / ütközésvizsgálat

### Magas ütközési kockázat – most nem módosítandó

A DROP 1.2.2 fejlesztés az audit előtti két órában az alábbi fájlokat módosította:

- `app/lib/identity-core/licenseCode.ts`
- `app/admin/licenckozpont/page.tsx`
- `components/drop/DropPublicWorkflowManager.tsx`
- `scripts/drop-v122-license-browser-e2e.mjs`
- `scripts/drop-v122-full-e2e.mjs`
- `scripts/activate-drop-v122-release.sh`

A Drive sprint ezekhez csak akkor nyúlhat, ha a funkció később ténylegesen megköveteli és előtte új ütközésvizsgálat készül.

### Alacsonyabb ütközési kockázat / elsődleges Drive munkaterület

- `app/lib/drive-core/**`
- `app/api/projects/[projectId]/drive/**`
- `components/project-gate/DriveWorkspace.tsx`
- `components/project-gate/DriveWorkspace.module.css`
- `app/drive/**`
- `app/lib/drive/**`
- `desktop_clients/dimpro_drive_client_mvp/**`

Ezek nem szerepeltek a legutóbbi 120 perces párhuzamos módosítások között az induló auditkor.

### Git megjegyzés

A repository jelenlegi `main` állapota nem alkalmas megbízható fájlszintű rollbackre, mert a projekt nagy része a kezdeti commit óta untracked/dirty állapotú. Emiatt ebben a sprintben a rollback elsődleges eszköze a célzott tar backup + validált release könyvtár, nem a `git reset`.

## 4. Meglévő, kötelezően újrahasznosítandó motorok

### Drive Core / Project Drive

Meglévő adatbázis- és objektumtárhely-motor:

- `app/lib/drive-core/databaseRepository.ts`
- `app/lib/drive-core/storageRepository.ts`
- `app/lib/drive-core/storageService.ts`
- `app/lib/drive-core/s3ObjectStorage.ts`
- `app/lib/drive-core/reviewRepository.ts`
- `app/lib/drive-core/reviewService.ts`
- `app/lib/drive-core/types.ts`
- `app/lib/drive-core/schema.ts`
- `app/api/projects/[projectId]/drive/**`

A meglévő rendszer már kezeli a projektizolációt, mappát, dokumentumot, verziót, változáskurzort, privát S3 feltöltést, quarantine review-t és auditkapcsolatot.

### Projektkapu

- `components/project-gate/ProjectGateShell.tsx`
- `components/project-gate/DriveWorkspace.tsx`
- `components/project-gate/DriveWorkspace.module.css`
- `app/projektkapu/project/[projectId]/[module]/**`

A végleges Drive Workspace ezt a shellt használja embedded módban; külön második Projektkapu fájlmotor nem készül.

### DROP

- `app/lib/drop/**`
- `components/drop/**`

A Drive → DROP kapcsolat szerveroldali hivatkozás/snapshot + audit elven készül; kliensoldali letöltés–újrafeltöltés tilos.

### Auth / permission

- `app/lib/project-core/auth.ts`
- `app/lib/project-core/permissions.ts`
- `app/lib/identity-core/**`

A meglévő `document.read`, `document.write`, `document.approve` permissionök maradnak a Drive projekt-hozzáférés alapjai. Identity Core párhuzamosan nem másolandó.

### AI

Új Drive AI kliens helyett a meglévő szerveroldali AI mintákból kell közös adaptert kialakítani, elsődleges referencia:

- `app/lib/meeting-assistant/ai.ts`
- `app/lib/license/hage-ai-gateway.ts`

A Drive AI Dokumentumvizsgáló külön domainlogika lesz, de modellhívási és költségnaplózási alapot újrahasznosít.

### DocumentViewer

Nincs még egységes, teljes Drive DocumentViewer komponens. Releváns meglévő megoldások:

- `components/meeting-assistant/MeetingAttachmentEditor.tsx` – pdfjs használat.
- `components/property-survey/PropertySurveyPlanDocumentWorkspace.tsx` – közös DIMPRO PDF-/DocumentViewer irány.
- `desktop_clients/dimpro_drive_client_mvp/dimpro_document_viewer.py` – desktop viewer.

A 4. napi feladatnál közös webes viewer adapter készül; nem épül új, párhuzamos PDF motor minden modulhoz.

### Drive Desktop

Meglévő kliens:

- `desktop_clients/dimpro_drive_client_mvp/dimpro_drive_client.py`
- `desktop_clients/dimpro_drive_client_mvp/dimpro_drive_gui.py`
- `app/api/drive/desktop-contract/route.ts`
- meglévő upload/download MVP végpontok.

Új desktop alkalmazás indítása tilos; ezt kell továbbfejleszteni SQLite + remote cursor + kézi sync irányba.

## 5. Azonosított technikai hiányok a P0 tervhez képest

1. A jelenlegi standalone `/drive` oldal fejlesztői/admin előnézet, nem a végleges Drive Workspace.
2. A Drive Core jelenleg 0.3.0/0.4.x örökségi szerződés; a sprinthez össze kell hangolni az 1.0.0 közös Drive Core kontraktussal.
3. A verziórekord tartalmaz `sha256` mezőt, de a privát S3 feltöltés véglegesítése jelenleg csak méretet/HEAD-et ellenőriz; `checksumVerified: false`. Ez P0 blokkoló hiány.
4. Mérnöki metaadat, fájlmegjegyzés és QR réteg még nincs a Drive Core adatmodellben.
5. Több CsomagBOX adatmodell/API még nincs.
6. A standalone Drive és a Projektkapu jelenleg két eltérő UI-felületet használ; közös Workspace komponens szükséges.
7. `drive.dimpro.hu` külön Nginx host az auditban nem azonosítható; az alkalmazásoldali routing elkészíthető, a domain/cert külön infrastruktúra-gate lesz.
8. PDF/kép inline preview és Compare közös motor nincs kész Drive-szinten.
9. Desktop kliensben nincs még SQLite állapot, remote sequence cursor alapú kétirányú kézi sync és konfliktuspéldány.

## 6. Fájlszintű megvalósítási sorrend

### 0. szakasz – audit lezárása

Dokumentáció:
- `DIMPROVER_PRODUCT_DOCS/112_dimpro_drive_sprint_audit_and_file_plan_20260807.md`

### 1. nap – Drive Core

Elsőként módosul / bővül:

- `app/lib/drive-core/s3ObjectStorage.ts` – szerveroldali SHA-256 stream hash.
- `app/lib/drive-core/storageService.ts` – hash ellenőrzés a FINALIZED/AVAILABLE állapot előtt.
- `app/lib/drive-core/storageRepository.ts` – ellenőrzött hash átadása a finalize RPC-nek.
- `app/lib/drive-core/types.ts` – checksum státusz/Drive 1.0 kontraktus bővítés.
- új Supabase migráció: inkrementális Drive 1.0 metaadat/note/QR réteg, meglévő 0.3/0.4 táblák megtartásával.
- új projekt-scoped API-k: részletek/verziók/metaadat/note/QR, csak meglévő `requireProjectPermission` middleware-rel.
- célzott unit/contract tesztek a hash, permission, version invariánsokra.

### 2. nap – Web Drive

Új közös komponensek külön `components/drive/**` alatt:

- `DriveShell.tsx`
- `DriveWorkspace.tsx`
- `DriveToolbar.tsx`
- `DriveNavigationRail.tsx`
- `FloatingProjectBoard.tsx`
- `FolderTreePanel.tsx`
- `FileGridPanel.tsx`
- `DetailsPanel.tsx`
- `DropActionButton.tsx`
- `ViewLayoutSwitcher.tsx`

`app/drive/page.tsx` a régi admin-preview helyett a közös Workspace standalone hostja lesz.

### 3. nap – Workspace + CsomagBOX

- `app/lib/drive-boxes/**` vagy a már meglévő `drive-core` alatt tisztán elkülönített box service/repository.
- `components/drive/BoxShelf.tsx`
- `components/drive/PackageBox.tsx`
- projekt-scoped box API-k.

### 4. nap – Viewer + Compare

- közös `app/lib/document-viewer/**`
- közös `components/drive/DocumentViewerPanel.tsx`
- `app/lib/document-compare/**`
- compare job API.

### 5. nap – Projektkapu + DROP + AI + E-mail Kapu

- `components/project-gate/DriveWorkspace.tsx` vékony adapterré válik a közös Drive Workspace fölött.
- DROP integráció meglévő `app/lib/drop/**` service-ekre épül.
- AI Dokumentumvizsgáló szerveroldali adapter + egy kiváló heti értekezleti sablon.
- E-mail Kapu csak vertikális szelet / feature flag.

### 6. nap – Drive Desktop

- meglévő Python kliens bővítése, új kliens nélkül.
- SQLite helyi állapot, device/project/root, remote cursor, `.partial`, SHA-256, konfliktuspéldány.

### 7. nap – RC

- célzott lint/TS,
- production build,
- minimum 10 kötelező smoke,
- responsive és permission/security teszt,
- backup/rollback próba,
- Dev Center lezárás,
- release candidate aktiválás csak validáció után.

## 7. Azonnali következő technikai lépés

A 0. szakasz lezárása után első kódmódosítás a Drive privát S3 feltöltés SHA-256 ellenőrzésének hardeningje. Ennek oka, hogy a sprint P0 elfogadási feltétele szerint új verzió csak sikeres storage írás és SHA-256 ellenőrzés után aktiválható; a jelenlegi implementáció ezt még nem teljesíti.

## 8. 2026-08-07 – Day 1 Drive Core lezárás

### PostgreSQL / Workspace 1.0 aktiválás

A VPS közvetlenül eléri a Supabase PostgreSQL adatbázist IPv6-on a projekt saját `db.<project-ref>.supabase.co:5432` végpontján. A szerveroldali kapcsolati titok a `/root/dimprover/.env.local` fájlban van; tényleges jelszó vagy connection string érték dokumentációba nem kerülhet.

Aktivált migráció:

`supabase/DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql`

Aktuális SHA-256:

`3e4e9d74206adffc97df9868176c32a2964a4e21217501be796ee3262a302a4d`

Post-SQL állapot:

- Workspace marker: `1.0.0`;
- 7/7 új tábla elérhető;
- 7/7 új táblán RLS aktív;
- 3/3 atomic Workspace RPC elérhető;
- mérnöki metaadat, fájlmegjegyzés, QR, CsomagBOX, BOX-item és mentett nézet adatmodell aktív.

### Migráció előtti kompatibilitási javítás

A preflight kimutatta, hogy a közös `project_core_audit_events` constraint már használja a Calendar, Dialog, Decide és Diary modulok objektumtípusait. A Workspace migráció ezért úgy lett javítva, hogy az összes meglévő típus megmaradjon, és csak hozzáadja a Drive 1.0 típusokat. Ez megakadályozta, hogy a Drive migráció más Projektkapu modul auditját megsértse.

### SHA-256 hardening

A Drive privát objektumtárhely véglegesítési lánca most:

1. objektum feltöltése S3-kompatibilis privát tárhelyre;
2. HEAD méretellenőrzés;
3. teljes szerveroldali visszaolvasás;
4. SHA-256 számítás;
5. előre megadott hash esetén egyezésellenőrzés;
6. csak sikeres ellenőrzés után finalize / verzióaktiválás;
7. checksum eredmény mentése és audit frissítése.

Izolált valós S3 round-trip teszt: feltöltés → visszaolvasás → SHA-256 egyezés → automatikus törlés: **PASS**.

### TypeScript kontraktus

A Drive change entity és a Project Core audit entity unionok bővültek az új Workspace típusokkal. Így az adatbázis constraint és a TypeScript szerződés ismét azonos.

### Day 1 ellenőrzések

- Drive Core v1.0 contract: **22/22 PASS**;
- `npx tsc --noEmit`: **PASS**;
- célzott ESLint: **PASS**;
- Workspace DB health: **ready = true**;
- valós S3 SHA-256 round-trip: **PASS**.

A Day 1 P0 Core feladatai ezzel lezárhatók. Következő szakasz: **Day 2 – közös Web Drive Workspace**.

