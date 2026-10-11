# DIMPRO Drive V0.9.38 + DIMPRO Projektkapu – közös projekt-termék licencmotor

Dátum: 2026-10-11
Állapot: SOURCE CANDIDATE / NINCS DB MIGRÁCIÓ / NINCS DEV vagy PROD DEPLOY / NINCS LICENCKIADÁS / PROD DENY.

## Architektúra

A DIMPRO saját, központi AUTH PostgreSQL az új projekt-termék licencnyilvántartás forrása. Nem helyettesítjük csendben a korábbi Identity Core / Supabase licenceket: az átvezetés csak stabil UUID és külön auditált megfeleltetés alapján történhet.

Egy Project Core projektnek külön DRIVE és külön PROJECT_GATE terméklicence lehet; csomag, fizető, keret, kezdő-/lejárati idő, státusz külön. A projektazonosság stabil AUTH auth_projects.external_project_id-re épül, nem e-mail- vagy projektnév-egyezésre.

A Projektkapu licenc nem hoz létre automatikusan Saját Drive-ot vagy teljes fizetős Drive előfizetést. A Projektkapu dokumentummodul és a fizetős Drive teljes fájlkezelés termékhatárát külön üzleti döntésben kell rögzíteni. Meghívott projektmunkatárs külön fizetős projektlicenc nélkül hozzáférhet a megfelelő, külön engedélyezett projektfunkcióhoz, ha a Project Core/mappa/dokumentum ACL ezt megengedi.

## Központi AUTH migrációs sorrend

- 014: a korábbi külön Drive-projektlicenc modell (még nem alkalmazott forrás).
- 015: 014 táblát auth_project_product_licenses névre alakítja, a Drive rekordokat DRIVE termékkóddal megtartja. Egyedi kulcs: auth_project_id + product_code. Második termék: PROJECT_GATE. Audit tábla termékkódonként, megőrzött revision, hard delete tiltás, app SELECT-only.
- 016: ellenőrzött operátori RPC új PENDING_APPROVAL kiadásra, külön indoklásos ACTIVE jóváhagyásra, csak SUPERADMIN operátorral és server admin API-n keresztül. Nincs automatikus jogosultságadás vagy számlázás. A funkciók forrásban készültek, de az admin API írási hard release gate tiltja a tényleges alkalmazást.

A forrásmigrációk egyike sincs a DEV/PROD adatbázison alkalmazva. A 014–016 csak izolált PGlite környezetben ellenőrzött; migrálás előtt DBA review, AUTH 001–016 séma ellenőrzés, backup, jogosultság-audit kötelező.

## Felhasználói felületek

DIMPRO Drive: projektfejléc Projektlicenc -> /drive/licenc?project=projektazonosító, elkülönült licencadatokkal.
DIMPRO Projektkapu: projektfejléc Projektlicenc ikon, bal board hivatkozás -> /projektkapu/project/projektazonosító/licenc, csak saját Projektkapu terméklicenccel.

Mindkét termék GET API-ja kizárólag aktív Project Core hozzáférés után olvashatja a saját product_code licencet. A licence code és a fizető típusa csak project.update ÉS project.manage_members jogosultsággal jelenik meg. Hiányzó DB migráció: NOT_CONFIGURED; hiányzó terméklicenc: NOT_ASSIGNED; soha nem hallgatólagos ACTIVE.

## Bővített központi Licencközpont

A korábbi /admin/licenckozpont Identity Core és legacy licencadatokat kezelő felülete változatlanul működik. Új ProjectProductLicensesAdmin rész mutatja a központi AUTH Drive és Projektkapu licenceket, projekt-/fizető-/csomagválasztással, táblázati listával, jóváhagyási dátummal és indoklással.

A központi GET/POST/PATCH admin API csak jóváhagyott DEV hostról és meglévő admin kulccsal érhető el. Írási művelet emellett central AUTH SSO-t, DB SUPERADMIN jogosultságot és indoklást is igényelne. A forrás HARD GATE jelenleg PROJECT_LICENSE_ADMIN_WRITES_RELEASED=false. POST/PATCH 423-mal elutasít minden kérést. Az admin UI szürke, nem végrehajtható jóváhagyó gombokkal jelzi ezt.

A meglévő legacy admin-key localStorage kezelése továbbra is átmeneti technikai adósság. Éles licencadminisztrációhoz külön erős AUTH admin munkamenet, megfelelő szerepkör, CSRF/host védelem és audit szükséges; a régi admin kulcs önmagában nem tekinthető elegendőnek.

## Nem végzett változtatások

- Nem alkalmaztunk AUTH DB migrációt.
- Nem aktiváltunk PROJECT_GATE vagy DRIVE terméklicenc alapú hozzáférés-/tárhely enforcementet.
- Nem adtunk ki és nem hagytunk jóvá valós licenceket.
- Nem módosult a Project Core ACL, dokumentumtár, Drive quota és a meglévő projekttagság.
- Nem történt számlázás, fizetés, SMTP üzenet, DEV/PROD deploy, PM2 restart vagy destruktív művelet.
- admin@dimpro.hu marad a korábban jóváhagyott üzemeltetői cím. A regisztrációs email HARD OFF nem változott.

## Függő üzleti döntések

A Drive és a Projektkapu külön/együttes csomagjai, ára és kerete; a Projektkapu dokumentummodul termékhatára; a meglévő projektek migrációs stratégiája; próbaidő/lejárat/késedelmi türelmi idő/read-only/archív szabály; a tényleges fizetési adatforrás és entitlement integrációja. A licenc lejárata soha nem törölhet dokumentumot.

## Tesztek

- Izolált PostgreSQL: 014+015 adatmegőrzés és két termék egy projekten; 014+015+016 kiadás/jóváhagyás/duplikáció/operátor deny/audit.
- Projekt és termék ACL forráscontractok; külön Drive projektlicenc regresszió.
- TypeScript, ESLint, teljes BUILD01 szükséges release gate. A BUILD01 eredményét a következő dokumentációs módosításban rögzítjük.
