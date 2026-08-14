# DIMPRO Drive Web – Jázmin-AI V1.10 fejlesztési napló

Dátum: 2026-08-14

Környezet: kizárólag DEV

DEV felület: `https://app.dev.dimpro.hu/drive`

Feature branch: `feature/jazmin-drive-web-20260814`

Worktree: `/srv/dimpro-dev/worktrees/jazmin-drive-web-v110`

DEV baseline commit: `2ab23591da6de3426b7f96228c8937b805bc2e46`

Forrás-backup: `/srv/dimpro-dev/backups/jazmin_drive_web_20260814_160215`

## Scope és kizárások

Ez a kör kizárólag a DIMPRO Drive webes UI/UX, Workspace, CsomagBOX és Drive-specifikus API/repository réteget érinti. Nem módosult BENJADMIN, globális auth/login, közös layout/theme engine, notification engine vagy szerver-infrastruktúra. Drive Desktop SmartSync / Windows Cloud Files implementáció ebben a körben nem indult el.

## Elkészült fejlesztés

### 1. Funkcionális CsomagBOX alap

- A korábbi statikus CsomagBOX-polc helyett projektizolált, adatbázis-alapú BOX lista készült.
- Új BOX létrehozható név és cél alapján.
- BOX célok: GENERAL, DROP, COMPARE, AI_ANALYSIS, ISSUE, MEETING.
- A BOX nem másolja a fájlt: `document_id` + opcionális `version_id` hivatkozást tárol.
- Ugyanaz a dokumentum több BOX-ban is szerepelhet.
- Ugyanazon BOX + dokumentum + verzió kombináció idempotens, nem duplikálódik.
- A fájllistában új `BOX` oszlop mutatja a tagságokat színes pontokkal.
- Fájlsor CsomagBOX-ra húzható HTML5 drag & drop segítségével.
- Kijelölt dokumentum gombbal is hozzáadható a BOX-hoz.
- BOX kibontásakor megjelennek a benne lévő fájlok és eltávolíthatók.
- A felső `CsomagBOX` gomb aktív: polcot kapcsol és aktív BOX darabszámot mutat.
- SQL hiányakor fail-safe mód működik: a Drive nem omlik össze, a bővített mutációk letiltva maradnak.

### 2. Commander / kétpaneles fájlkezelő

- Új önálló `Commander` nézet került a Drive nézetváltóba.
- Bal és jobb oldalon külön projektmappa választható.
- Mindkét panel közvetlen gyermekmappákat és fájlokat listáz.
- Fájl a másik panelbe húzható vagy nyílgombbal áthelyezhető.
- Az áthelyezés szerveroldali `document.write` jogosultságot igényel.
- Az áthelyezés projektizolált és atomikus RPC-vel készül.
- Az áthelyezés `project_core_audit_events` és `drive_core_change_events` eseményt ír.
- Workspace SQL hiányában a Commander olvasási módban marad, így nincs látszólag működő, valójában veszélyes mutáció.

### 3. Új Drive API-k

- `GET /api/projects/[projectId]/drive/boxes`
- `POST /api/projects/[projectId]/drive/boxes`
- `POST /api/projects/[projectId]/drive/boxes/[boxId]/items`
- `DELETE /api/projects/[projectId]/drive/boxes/[boxId]/items/[itemId]`
- `POST /api/projects/[projectId]/drive/documents/[documentId]/move`

Minden új írási API a meglévő `requireProjectPermission(..., "document.write")` szerveroldali ellenőrzést használja.

### 4. SQL/RPC bővítés

A `DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql` bővült:

- `drive_workspace_create_box_atomic`
- `drive_workspace_add_box_item_atomic`
- `drive_workspace_remove_box_item_atomic`
- `drive_workspace_move_document_atomic`

Minden RPC `security definer`, explicit projektellenőrzést végez, audit/change eseményt ír és csak `service_role` számára futtatható. A bootstrap SHA-256 fájl frissítve lett.

## PRIVATE_VAULT / HEALTH_PRIVATE kompatibilitási audit

A jelenlegi Drive Core-ban nem található még `workspaceType`, `storageScope`, `vaultCategory`, `dataClass` vagy `ownerSubjectId` extension point. Ezt a jelen fejlesztési körben nem alakítottuk át, mert a webes Drive UI/UX sprint elsőbbséget élvez, és a teljes project-only repository általánosítása nagyobb architekturális változás lenne. Technikai adósságként rögzítve: következő Core-architektúra körben külön, regressziótesztekkel kell bevezetni. Private Vault vagy Egészségmegőrzés végfelhasználói UI ebben a körben nem készült.

## Acceptance / contract ellenőrzés

A `scripts/drive-web-jazmin-v110-contract.mjs` 18 ellenőrzést tartalmaz:

1. CsomagBOX repository lista
2. CsomagBOX létrehozás
3. file/version referencia-alap
4. BOX item idempotencia
5. projektizoláció
6. BOX audit
7. BOX change feed
8. fájlsor BOX színjelölés
9. fájl → BOX drag payload
10. ugyanaz a fájl több BOX-ban
11. aktív toolbar CsomagBOX
12. Commander nézet
13. két Commander panel
14. Commander drag/move
15. move audit + change event
16. szerveroldali írási permission
17. SQL-hiány fail-safe
18. SmartSync kizárás

Első és DEV VPS futás: **18/18 PASS**. A meglévő Drive V1.00 contract 22/22 PASS, a Drive Core V0.30 contract 24/24 PASS.

## Kötelező ellenőrzési sorrend

A kör zárásakor futtatandó:

1. `git diff --check`
2. `npx tsc --noEmit --pretty false`
3. Drive-scoped ESLint
4. `node scripts/drive-web-jazmin-v110-contract.mjs`
5. teljes Next.js build
6. DEV candidate smoke / vizuális ellenőrzés
7. kizárólag sikeres eredmény után DEV aktiválás

## DEV adatbázis aktiválás és runtime ellenőrzés

A DEV Supabase környezetben a Workspace bootstrap korábban hiányzott. A módosítás előtt teljes `public` schema-only PostgreSQL mentés készült, majd a `DIMPRO_DRIVE_WORKSPACE_V100_BOOTSTRAP.sql` sikeresen lefutott. Postflight szerint a `drive_core_boxes`, a CsomagBOX RPC-k és a Commander dokumentum-áthelyező RPC elérhetők.

Tranzakciós, `ROLLBACK`-kal végződő DB acceptance teszt sikeresen ellenőrizte: BOX létrehozás, item hozzáadás, idempotens újrahozzáadás, dokumentum áthelyezés, item eltávolítás, audit-események. A teszt után maradvány rekordok száma 0.

DB backup/migráció artifact: `/srv/dimpro-dev/artifacts/jazmin-drive-v110-db-20260814T141231Z`.

Megjegyzés: a normál UI továbbra is fail-safe marad arra az esetre, ha egy másik környezetben a Workspace séma nincs telepítve.
