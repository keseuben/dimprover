# DIMPRO Drive V0.9.34 – értesítési rendszer, 3. fejlesztési szakasz

Dátum: 2026-10-10
**SOURCE READY / NOT DEPLOYED / NO SCHEMA CHANGE APPLIED / SMTP HARD DENY / PROD DENY.**
Korábbi átadók:
- `DIMPRO_DRIVE_V0934_COMPLEX_SOURCE_HANDOFF_20261010.md`
- `DIMPRO_DRIVE_V0934_NOTIFICATION_DISPATCH_PHASE2_20261010.md`

## Elkészült a mostani szakaszban

1. **Bounded journal producer**:
   - `app/lib/drive-notifications/producerPlanning.ts`: a szigorú `sequence`-rend ellenőrzése, 250 esemény/oldal limit, csak jogosult és engedélyezett értesítésre érdemes események kiválasztása; üres lap, üres értesítés, és sorba állítandó összesítő elkülönítése.
   - `app/lib/drive-notifications/producerFlow.ts`: lapozó feldolgozó, legfeljebb 4 lap/futás (max 8), állapotkódok: EMPTY, QUEUED, BLOCKED, BUDGET_EXHAUSTED. A DB nem ignorálható: hiányzó/ellentmondásos acknowledgement hibára áll.
   - `app/lib/drive-notifications/journalWindow.ts`: az időzítési slot időpontja UTÁN keletkezett eseményeket a következő időszakra hagyja, és a sorozatszám-kurzort nem engedi átlépni rajtuk.
   - `app/lib/drive-notifications/digestProducer.ts`: AUTHORITATIVE adatforrások összekötése: központi AUTH aktív, igazolt felhasználó; projekt tagság; effective Drive mappaláthatóság; követett dokumentumok; projekt-kategória frequency; Drive eseménynapló; adatbázisos atomikus journal cursor RPC. Minden hívása a `PRODUCER_RELEASED=false` release-kapu miatt **DISABLED** eredményű.
2. **DB kurzor + outbox tranzakció**:
   - `supabase/migrations/20261010_drive_digest_cursor_producer_v013.sql` (még nem alkalmazva).
   - Egy címzett/projekt/kategória szerinti DB advisory lock és cursor compare-and-swap. Változás nélkül a kurzor biztonságosan előrelép e-mail nélkül; érdemi eseménynél csak ellenőrzött, insert-only outbox sor jön létre, és a kurzor nem lép tovább a kézbesítés lezárásáig.
   - Régi/ugyanarra a slotra foglalt batch vagy korábbi PENDING/FAILED/PROCESSING/AMBIGUOUS állapot esetén blokkolás. Semmit nem dob el automatikusan.
   - SUPPRESSED végállapotú (hozzáférés/hozzájárulás miatt nem küldhető) eseménynél a kurzor tranzakcióban továbbmegy; FAILED/AMBIGUOUS továbbra is blokkol.
3. **Ütemezési késés kezelése**:
   - `app/lib/drive-notifications/scheduling.ts` új `latestDueDigestSlot` számítása; 4/8h/daily/weekly/monthly slotok utólagos feldolgozása korlátozott catch-upablakban. Europe/Budapest DST a meglévő szemlélet szerint.
   - Monthly: hiteles magyar munkanap-/ünnepnaptár-függvény nélkül NINCS automatikus havi slot. Nem találgatunk munkanapot.
4. **Saját kézbesítési napló**:
   - `GET /api/projects/[projectId]/drive/notification-deliveries`: bejelentkezett `document.read` jogú felhasználó legfeljebb 50 saját kézbesítési állapotát láthatja; más személy e-mail-címe/napi eseménye nem kerül ki.
   - `components/drive/DriveNotificationSettings.tsx`: Lekérdezés-gomb, egyértelmű státuszok (SMTP ACCEPTED nem egyenlő postafiókos kézbesítéssel).

## Biztonság, korlátok, hátralévő integráció

- Sem a producernek, sem az SMTP-adapternek nincs automatikus scheduler/HTTP hívója. Mindkettő saját explicit forráskódszintű hard release switch-je **false**; környezeti változóval önmagukban nem aktiválhatók.
- **Kötelező**: DBA SQL review, `supabase/migrations/20261010_drive_notification_preferences_v010.sql`, `20261010_drive_digest_delivery_gate_v011.sql`, `20261010_drive_notification_consent_v012.sql`, `20261010_drive_digest_cursor_producer_v013.sql` migrációk függőségi sorrendje; AUTH migráció külön saját adatbázisra; Drive follow és review decision migrációk. Semmit nem alkalmaztunk.
- A `SUPPRESSED` batch akkor kap lezárást, ha a worker valós DB claimet tart; régi, összevont batchen belüli címzettjogosultságváltozások egyenként kizárják a már nem látható dokumentumokat. Korábban eltitkolt fájl nem jelenhet meg.
- Még hiányzik az időzítő/producer scanner deployment, admin delivery-audit több címzettre, azonos scope-ú címzettlista kiadása, hiteles magyar munkanaptár, éles DB tranzakció-integrációs teszt, és SMTP kizárólag kontrollált tesztcímzettel.
- Az egyes követett dokumentumok saját megadott frekvenciája még nincs külön ütemezve; csak NONE tiltás és eseménytípus flags működnek, a projekt/kategória összesítő ütemezés szabályozza a küldést.
- Browser + BUILD01/02 QA még hátravan; DEV környezet aktív változata továbbra is V0.9.33. **PROD DENY**.

## A mostani ellenőrzések

- TypeScript/ESLint/diff-check
- Új pure producer kontrakt 11/11 PASS
- Producer-flow kontrakt 8/8 PASS
- Journal-window kontrakt 7/7 PASS
- Scheduling kontrakt 15/15 PASS
- Korábbi digest, dispatch, follow, XLSX tesztek regresszióként futtatandók.
- Postgres SQL migációk **nem futottak PostgreSQL parseren/DB-n**; forrásellenőrzés nem adatbázisos PASS.
