# DIMPRO Licencközpont V0.9.49 – operátori szerepkörök és többszemélyes jóváhagyás

Dátum: 2026-10-11.
Státusz: SOURCE-ONLY CANDIDATE / PROD DENY / NINCS DEV DEPLOY.
A DotRoll DEV VPS-bővítésére várunk. A BENJADMIN canonical 3100-as runtime és a PROD licencközpont változatlan.

## Feladat

Közös DIMPRO License Center: a tényleges fizetős ügyféllicencek PROD-ban, a DEV kizárólag izolált tesztadatokkal. Kiadási/kezelési RBAC, pénzügyi és biztonsági kontroll, auditnapló, külön licencaktiválási kapu.

A jelen V0.9.49 a **jogosultsági alapmodellt, izolált adatbázissémát és olvasási/előnézeti admin UX-et** szállítja. Nem tényleges licenckiadó, számlázási, AUTH-operátor beléptető vagy hozzáférés-engedélyező motor.

## 1. Operátori szerepkörök, meglévő központi AUTH alapján

- LICENSE_SUPERADMIN: főadmin, kereskedelmi kérelmek és a role management felülvizsgálata; még ő sem hagyhatja jóvá a saját kérelmét.
- LICENSE_OPERATOR: licencügyintéző, kérelmező.
- LICENSE_FINANCE: pénzügyi/befizetési bizonyíték ellenőre.
- LICENSE_SECURITY: külön személyazonosság- és jogosultsági ellenőr, előkészítheti az éles release-kaput, de nem aktiválhat automatikusan.
- LICENSE_AUDITOR: audit és licencek megtekintése, változtatási jog nélkül.
- LICENSE_SUPPORT_READONLY: ügyfélszolgálati betekintés, változtatás nélkül.

Nyolc jogosultság:
license.center.read;
license.request.create;
license.request.cancel;
license.billing.review;
license.security.review;
license.release.prepare;
license.audit.read;
license.operator.manage.

A szerepkördefiníció és jogosultságlista nem operátori hozzárendelés. A személyhez rendelt valós AUTH access grant, erős hitelesítés, kiadási jogosultság és elkülönített admin session egy későbbi, jóváhagyott fejlesztési kör feladata.

## 2. Jóváhagyási állapotgép

DRAFT → PENDING_BILLING → PENDING_SECURITY → READY_FOR_RELEASE.
Elutasítás/visszavonás külön végállapot; terminális állapotból nem lehet újra aktiválni vagy rejtetten visszalépni.

- Pénzügyi hivatkozás, a kérelemtől különböző pénzügyi ellenőr, ellenőrzési dátum szükséges.
- A biztonsági jóváhagyó nem lehet az eredeti kérelmező vagy a pénzügyi ellenőr.
- A művelet szereplőjének központi AUTH UUID-ja és legalább 12 karakteres indoklás kötelező az auditban.
- Tulajdonos, fizető, scope, termék, csomag, indoklás és tervezett lejárat utólag nem cserélhető a forrásbeli queue-ban; új kérelem kell a javításhoz. A módosítások revíziója monoton nő.
- READY_FOR_RELEASE státusz **nem egyenlő ACTIVE licenccel**, nem indít számlázást, kvótamódosítást, Drop/Drive/Projektkapu jogosultságot.
- Ebben a kiadásban LICENSE_ACTIVATION_RELEASED=false; a PROD környezeti íráskapu is zárva marad.

## 3. Előkészített AUTH SQL-migráció (source-only)

Fájl: db/auth/migrations/022_auth_v059_license_operator_approval_review.sql.

- Kizárólag auth_migrator_dev/prod SQL futtatói szereppel engedélyezett, a valós DB-n NEM futott.
- Meglévő központi auth_roles / auth_permissions / auth_role_permissions szerepkördefiníciókat bővít; nem szúr be auth_access_grants hozzárendelést.
- auth_license_approval_requests: szabályozott kiadási kérelmek, két külön ellenőr, állapotgép, revízió, ellenőrzött fizetési/bizonylathivatkozás, indoklás.
- auth_license_approval_audit: minden létrehozáshoz és módosításhoz személy, időpont, indoklás, korábbi/új állapot és revízió. Az audit módosítása/törlése tiltott.
- A normál AUTH runtime DB-szerep nem kapott SELECT/INSERT/UPDATE/DELETE jogosultságot az új táblákhoz. A külön biztonságos operátori service, pl. külön autentikált DB szerep vagy SECURITY INVOKER/RPC, majd később készül.
- Nincs személyes egészségügyi adat, számlaképtartalom, fizetési azonosító vagy ügyfélazonosító kitöltve. A kérelmekről NINCS éles snapshot.

## 4. Licencközpont táblázatos admin UI

- Új fül: Jóváhagyások és szerepkörök, a License Center korábbi Licencek, Moduljogok, Termékek, Projektlicencek, Csomagok és díjak fülei mellett.
- Új komponens: components/license/LicenseOperatorReviewOverview.tsx és CSS modul.
- Kompakt táblázatos role / permission matrix, munkafolyamat-fázistábla, helyi interaktív tesztkapcsolók és blokkoló hibalista. Ez csak LOCAL PREVIEW: nincs fetch, nincs írás, nincs localStorage-adat, nincs valós ügyfélkérelem.
- A működő BENJADMIN DEV böngészős felületen még a V0.9.47 és V0.9.48 forrásfejlesztések sem láthatók, ezek továbbra is telepítésre várnak.

## 5. Fő biztonsági és üzemeltetési korlátok

- A V0.9.48 forrásban a legacy licencek módosítását is zároló, alapértelmezett fail-closed íráskapu marad; ezért ez a release nem telepíthető a canonical 3100-as régi BENJADMIN operátori működésére hatáselemzés nélkül.
- PROD DENY, nincs adatbázis-migráció, PM2 restart, nginx állítás, SMTP, licenckiadás, kvóta, tárolási változás.
- A régi Drop Identity Core licencek és a Drive runtime jogosultságai nem változtak.
- Az adatforrások DEV/PROD elkülönítése még UNKNOWN; a central AUTH tényleges identity+operator RBAC bekötése, erős belépés, pénzügyi bizonyíték és üzleti audit hitelessége még nincs élesítve.
- Az új SQL schema még SOURCE CANDIDATE: kötelesség a security review, ACL modell és a végső licencmotorral való integráció ellenőrzése.

## 6. Tesztek és kiadás

- scripts/tests/dimpro-license-operator-v0949-contract.mjs: szerepkör, jogosultságok, elkülönült jóváhagyók, hamisított/hibás kérelem, deaktivált éles licenc, read-only UX.
- scripts/tests/dimpro-license-operator-pglite.mjs: tényleges SQL-migráció izolált PGlite adatbázisban, role/perms egyezés, hozzáférések hiánya, draft → pending → finance → security → release-ready, tiltott ugrás/önjóváhagyás, immutable owner és audit, DB permission-deny.
- A teljes regression, TS, ESLint, BUILD01 eredményét külön hiteles BUILD01 PASS után rögzítjük.

## Folytatás

1. DotRoll tárhelyválasz és read-only DEV disk ellenőrzés.
2. Canonical BENJADMIN 3100 host izolált release + rollback előkészítés.
3. Centrális AUTH/RBAC operátori identitás és valós adatforrás-azonosság ellenőrzése.
4. Két személy által külön ellenőrzött, pénzügyi evidenciát hitelesítő API és mutációs állapotgép biztonsági felülvizsgálata, majd csak külön engedéllyel izolált DEV-tesztrendszer.
5. Végső PROD licencaktiváló motor, új release és önálló jóváhagyás, nem automatikusan.

Nincs fizikai szervermódosítás, adatbázis-migráció vagy deploy; PROD DENY.
