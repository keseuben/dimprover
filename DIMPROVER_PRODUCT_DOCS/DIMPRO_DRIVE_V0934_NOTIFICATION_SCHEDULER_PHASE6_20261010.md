# DIMPRO Drive V0.9.34 – értesítési ütemezési előnézet / 6. fejlesztési szakasz

Állapot: **SOURCE PREPARED, NOT BUILT, NOT DEPLOYED, MIGRATIONS NOT APPLIED, NO EMAIL**. PROD DENY.

Branch: `worker/benjaminai/drive-desktop-v019-v0924-integration-20261007`

## Megvalósult

### Ütemezés tervezőmag

- `app/lib/drive-notifications/schedulerPlan.ts`: tisztán számoló, DB- és SMTP-független ütemezési előnézet.
- Előfizetők bekapcsolt/tiltott állapota, napi/4 óra/8 óra/hétfői/havi esedékesség, `Europe/Budapest` és késői indítás kezelése.
- Azonos felhasználó/projekt/kategória/időpont ismétlődése deduplikált; maximálisan 2000 elem/batch; legfeljebb 500 előnézeti jelölt, hiányos eredmény külön jelölve.
- A havi értesítések csak teljes, ember által jóváhagyott magyar munkanaptár esetén jelennek meg. Hiány esetén **nem** következtetünk az ünnepnapokra.
- A tervező NEM végzi a küldést és NEM módosít kurzort; a későbbi automatikus producer újraellenőrzi az AUTH-ot, jogosultságokat és aktuális beleegyezést.

### Adminisztrátori előnézet

- `GET /api/projects/[projectId]/drive/notification-schedule-preview`: kizárólag együttes `audit.read` és `project.manage_members` jogosultság mellett, kizárólag az adott projekthez kötötten.
- Olvasási célú API; nem tartalmaz dokumentumnevet, e-mail-címet, címzettazonosítót, nem hoz létre küldési sort, és nem küld e-mailt. A válasz darabszámokat, kategóriákat és időpontokat közöl.
- `components/drive/DriveNotificationSettings.tsx`: külön „Ütemezési előnézet – levelek küldése nélkül” projektadminisztrátori szakasz. A hiányos munkanaptár és a maximum 500-as levágás külön figyelmeztetéssel látható.
- Az előnézetben jelzett „esedékes” nem garancia arra, hogy a címzett kap is e-mailt; a kézbesítés előtt külön ACL, AUTH és consent-ellenőrzés szükséges.

### Migrációfüggőségek statikus preflightja

- `scripts/tests/drive-notification-migration-dependencies-contract.mjs`: ellenőrzi a hét Drive migráció explicit sorrendjét, a cursor- és kézbesítési sor egyediségének összhangját, SQL tranzakciós határokat, központi AUTH migráció különválasztását, és a SHA-256 fájl-ujjlenyomatokat.
- Ezt nem szabad SQL-értelmezőként vagy valós DB-integrációs tesztként kezelni; adatbázissémához nem csatlakozik és nem hajt végre SQL-t.
- Kiadásbiztonsági regression: adminjogosultság, csak olvasó API és a küldő/producer `false` hard release gate változatlan.

## Tesztállapot

- **14 különálló értesítési contract tesztcsoport PASS**, beleértve az ütemező 13/13, release safety 15/15 próbákat és a statikus migráció-ellenőrzőt.
- `npx tsc --noEmit --pretty false`: PASS.
- Célzott ESLint: PASS.
- `git diff --check`: PASS.
- Nem futott BUILD01/BUILD02 Next.js build vagy böngészős E2E; nem történt izolált PostgreSQL adatbázisos próba.

## Infrastrukturális vizsgálat (read only)

- BUILD01 SSH elérhető: `/` szabad kb. 187 GiB, kihasználtság 17%.
- BUILD02 SSH elérhető: `/` szabad kb. 134 GiB, kihasználtság 40%.
- Az ellenőrzött BUILD01/BUILD02 alatt nem található jelenleg `postgres` szerverbináris, Docker vagy Podman futtató. Az MCP fejlesztői workstation is rendelkezik `psql` klienssel, de nincs telepített PostgreSQL szerver. Ezért a valós SQL-függvények, RLS, szerepkörök, CAS, advisory-lock, SMTP ack és 250+ sor DB-állapotgép próbájához **külön, jóváhagyott, izolált adatbázis-tesztkörnyezet kialakítása szükséges**. DEV éles adatbázisán próbamigrációt automatikusan indítani tilos.

## Kiadás előtti blokkolók

1. PostgreSQL migrációk szigorú DDL-review és izolált, valós PG tranzakciós E2E.
2. A központi AUTH profilfotó-migrációja `db.dimpro.hu` saját PostgreSQL-en, elkülönített jóváhagyással. Supabase AUTH tilos.
3. Hiteles HU munkanaptár teljes napi lefedettséggel, emberi jóváhagyással; hiány esetén havi értesítés nem indul.
4. Tartós producer/SMTP worker végső integrációja és manuális, tesztcímes próbája; `PRODUCER_RELEASED=false` és `DRIVE_DIGEST_SENDING_RELEASED=false` marad.
5. BUILD01/BUILD02 teljes Next.js build és böngészős jogosultság- és fájlnavigációs QA, majd csak szerverbővítés után kontrollált DEV telepítés, rollback előkészítéssel.
6. Közös jogosultsági rendszer szakmai szerepköreinek bővítése és Projektadatlap külön fejlesztési kör.

## Megőrzendő keretek

- DEV jelenlegi publikus runtime: V0.9.33, port 3412 (visszaállítás: V0.9.32, port 3411).
- PROD DENY, sem BUILD szerveren, sem DEV-en nem történt törlés/migráció/SMTP küldés.
- A munkaterületen régóta létező idegen untracked fájlok érintetlenek maradtak.
