# DIMPRO Drive Compare Findings V2.0 - release candidate állapot

Dátum: 2026-08-15

Környezet: DEV feature/release candidate, PROD nem érintett.

## Folytatási pont

- Feature branch: `feature/jazmin-drive-compare-findings-v200-20260815`
- Worktree: `/srv/dimpro-dev/worktrees/jazmin-drive-compare-findings-v200`
- Compare Findings V2 source commit: `a42fff7b725c9b20239aae6baa8630b966dda228`
- Aktuális feature head P10.2 integrációval: `8f3d4a59caccf392b67cf73904c7edfb73e6c7fc`
- Exact production build: `qHHzEjQWHS-8LlF7c8DoW`
- Feature és aktív DEV `.env.local` SHA-256 azonos a build lezárásakor.

## Elkészült V2 funkciók

A korábbi kliensoldali Compare Findings V1.3 review-lista szerveres, projektizolált és auditált V2 réteget kapott.

- Tartós `drive_core_compare_findings` adatmodell.
- A/B dokumentum- és verziósnapshot.
- Oldalszám, Δ-zóna és normalizált zónakoordináta snapshot.
- Auto Align transzformáció snapshot: X/Y, skála, forgatás, forrás, confidence.
- Kézi review státuszok: REVIEW / ACCEPTED_DIFFERENCE / FIX_REQUIRED.
- Prioritás: LOW / MEDIUM / HIGH / CRITICAL.
- Aktív projekttaghoz rendelhető felelős.
- Határidő.
- 4000 karakteres műszaki megjegyzés.
- Optimista `version` concurrency-védelem; ütközésnél 409.
- Soft delete/archiválás; auditnapló megmarad.
- Project Core audit + Drive change feed események create/update/delete műveletekre.
- Projektjogosultság-védett GET/POST/PATCH/DELETE API.
- Jövőbeni hibajegy / jegyzőkönyv / DokuBOX kapcsolat előkészítése a meglévő `project_core_entity_links` modellre.
- JSON és Excel-barát CSV export V2 workflow mezőkkel.
- Responsive workflow mezők a Compare panelben.
- Compare-pár váltáskor az adott A/B verziópár tartós listája töltődik vissza.

## SQL migration

- Bootstrap: `supabase/DIMPRO_DRIVE_COMPARE_FINDINGS_V200_BOOTSTRAP.sql`
- Migration: `supabase/migrations/20260815133000_drive_compare_findings_v200.sql`
- Schema marker: `2.0.0`
- Bootstrap ID: `drive-compare-findings-v200-20260815`
- A migráció bekerült a `DIMPRO_MIGRATION_ORDER_V1.txt` sorrendbe.
- A korábban lemaradt BENJADMIN migrációk sorrendlistája is szinkronizálva lett a tényleges migration könyvtárral.

## Miért nincs még aktív DEV V2 cutover

Az aktív DEV runtime jelenleg rendelkezik Supabase service-role API hozzáféréssel, de nincs közvetlen `SUPABASE_DB_URL` / `SUPABASE_DB_PASSWORD` migration credential a runtime környezetben. A DB-séma módosítását nem kerülőúton és nem általános SQL-executorral végezzük.

Ezért a V2 forrás és build release-candidate szinten kész, de az SQL migration külön kontrollált DEV migration-gate + backup + explicit apply lépésre vár. Emiatt a V2 branch még nincs az aktív 3100-as DEV runtime-ra átkapcsolva; az aktív DEV továbbra is a stabil Compare Findings V1.3-at használja.

## Acceptance és build

- Compare Findings V2 contract: **30/30 PASS**.
- Teljes Drive web/Compare contract: **206/206 PASS**.
- Drive Workspace: **22/22 PASS**.
- Drive Security V0.5: **47/47 PASS**.
- Drive Security Backfill V0.5.1: **34/34 PASS**.
- Vector Segments algoritmikus acceptance: **12/12 PASS**.
- BENJADMIN P10.2 probe planner contract: **50/50 PASS**.
- TypeScript: PASS.
- célzott ESLint: PASS.
- `git diff --check`: PASS.
- production Turbopack build: PASS.
- standalone server: PASS.
- candidate port 3210: online, restart 0.
- candidate `/drive`: HTTP 307, meglévő auth-flow szerint.
- Compare Findings API jogosultság nélkül: HTTP 401, elvárt auth gate.
- candidate build manifest: HTTP 200.

## Aktiválási sorrend a következő folytatáskor

1. Aktív BENJADMIN head és párhuzamos fejlesztések ellenőrzése.
2. Feature branch rebase/cherry-pick szükség szerinti frissítése.
3. DEV DB migration credential / jóváhagyott migration-gate elérhetőségének ellenőrzése.
4. DB backup és target guard.
5. `20260815133000_drive_compare_findings_v200.sql` alkalmazása kizárólag DEV-re.
6. Schema health: `drive-compare-findings` = 2.0.0.
7. Valós QA projektben create -> reload -> update -> concurrent version conflict -> soft delete -> audit ellenőrzés.
8. Aktív BENJADMIN forrásba integrálás.
9. Aktuális `.env.local` melletti exact production build.
10. Port 3210 candidate smoke.
11. Kontrollált PM2 DEV cutover port 3100-ra.
12. Post-cutover Drive/Compare browser acceptance és PM2 identity guard.
13. PROD továbbra sem érinthető külön release approval nélkül.

## Következő termékfejlesztési szelet

A V2 aktiválása után javasolt Compare Findings V2.1/V2.2:

- finding -> hibajegy konverzió;
- finding -> jegyzőkönyvi pont;
- finding -> DokuBOX / lebegő felvetés hivatkozás;
- státusztörténet és kommentfolyam;
- projektkalendárium határidő-kapcsolat;
- PDF/XLSX eltérési jegyzék riport;
- több finding csoportos műveletei és szűrése;
- lezárt finding visszakeresés / audit nézet.
