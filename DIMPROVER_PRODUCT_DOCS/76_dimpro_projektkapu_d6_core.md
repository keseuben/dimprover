# DIMPRO Projektkapu – DIMPRO DOCK D6 Core

**Verzió:** PROJEKTKAPU 0.1.0  
**Dátum:** 2026. augusztus 1.  
**Állapot:** fejlesztés alatt  
**Elsődleges tervezett domain:** `https://projektkapu.dimpro.hu`  
**Másodlagos márkadomain:** `https://door.dimpro.hu` → 301 → `https://projektkapu.dimpro.hu`  
**Átmeneti/belső útvonal:** `https://app.dimpro.hu/projektkapu`

## Termékpozíció

A DIMPRO Projektkapu a **DIMPRO Projektkapu – D6 Core** felhasználói projektplatform magyar megnevezése. Az önálló Projektkapu egy időben egy projektkörnyezetet jelenít meg. A DIMPROVER ugyanennek a közös projektmagnak a többprojektes, szervezeti és archívumkezelő felülete.

A projekt nem másolódik és nem költözik a két rendszer között. Ugyanaz a `project_id`, dokumentumtár, kommunikáció, jóváhagyás, projektnapló, értesítés és auditadat jelenik meg eltérő termékfelületen és jogosultsági csomagban.

## D6 Core modulok

1. **DIMPRO DOCK – ProjektTér**  
   Központi projektáttekintés, résztvevők, aktivitás, rám váró feladatok, legutóbbi dokumentumok és modulindítás.
2. **DIMPRO DRIVE – Dokumentumtár**  
   Tartós projektfájltár, mappák, dokumentumok, verziók, revíziók és hozzáférési napló.
3. **DIMPRO DROP – Fájlkapu**  
   Külső, meghívásos, időkorlátos fájlátadás és fájlfogadás.
4. **DIMPRO DIALOG – Egyeztetések**  
   Szakági kérdések, adatkérések, tervészrevételek, témakártyák, felelősök és hozzászólások.
5. **DIMPRO DECIDE – Jóváhagyások**  
   Auditálható terv-, termékkiváltási, költség- és határidőhatásos döntési folyamatok.
6. **DIMPRO DIARY – Projektnapló**  
   Projekt- és kivitelezési események, naplótervezetek és eltakarás előtti ellenőrzési kérelmek. Nem helyettesíti a hivatalos e-építési naplót.

Minden modul egységes külső hexagon keretet kap. Az angol márkanév mellett vagy alatt mindig jól olvashatóan meg kell jeleníteni a rövid magyar nevet is. A D6 nem külön modul és nem verziószám, hanem a hat összekapcsolt projektmodul közös rendszerjelzése.

## Első működő felületi kör

A PROJEKTKAPU 0.1.0 fejlesztési körben létrejött:

- a `/projektkapu` kezdőútvonal;
- a `/projektkapu/projects` projektkörnyezet-választó;
- a `/projektkapu/project/[projectId]` projektkezdő oldal;
- a `/projektkapu/project/[projectId]/dock` D6 dashboard;
- a `/projektkapu/project/[projectId]/drive` előkészített Dokumentumtár;
- a `/projektkapu/project/[projectId]/drop` előkészített Projektkapu–Drop kapcsolódási hely;
- a `/projektkapu/project/[projectId]/dialog` előkészített Egyeztetések modul;
- a `/projektkapu/project/[projectId]/decide` előkészített Jóváhagyások modul;
- a `/projektkapu/project/[projectId]/diary` előkészített Projektnapló modul;
- a desktop oldalsáv, a tablet/mobil alsó dokk és a világos/sötét témakapcsoló;
- a mellékelt koncepciós dashboardhoz igazodó DOCK nézet;
- a szerveres DIMPRO rendszerstruktúra külön Projektkapu termékcsoportja.

A projektazonosító, projektadat, projekt-tagság, szerepkör, jogosultság, életciklus és auditnapló már a közös Project Core repositoryból érkezik. A dokumentum-, jóváhagyási és egyeztetési kártyák egyelőre bemutatóadatok; ezek a következő modulmotorok bekötésekor válnak teljesen perzisztenssé.

## Kötelező közös core rétegek

- **Identity & Access Core:** felhasználók, szervezetek, meghívások, projekt-tagságok, szerepek és szerveroldali jogosultságok;
- **Project Core:** projektek, projektblokkok, életciklus, read-only lezárás és archiválás;
- **Document Core:** mappák, logikai dokumentumok, fájlverziók és hivatkozások;
- **Workflow Core:** állapotgépek, feladatok, határidők és jóváhagyási láncok;
- **Communication Core:** ügyek, hozzászólások, említések és lezáró válaszok;
- **Audit Core:** változás-, hozzáférés-, döntés-, export- és törlési napló;
- **Notification Core:** webes, e-mailes, push- és desktop értesítések közös olvasottsági állapottal;
- **Export Core:** PDF, CSV/XLSX, ZIP és teljes projektarchívum.


## Arculati és témarendszer

A Projektkapu egységes, hosszú munkavégzésre optimalizált világos és sötét témát használ.

- világos alap: `#F2FAF8`, fehér kártyák, petrol szövegek és `#0798A6` elsődleges türkiz;
- sötét alap: `#071A1B`, `#102D2F` kártyák és `#2DD4BF` aktív türkiz;
- másodlagos akcentus: tompított zsályás-türkiz (`#68A89C` / `#72C5B7`);
- a korábbi neon lime nem használható modulkeretként, aktív navigációként, nagy gombon vagy glow effektként;
- a kártyák 8–10 px lekerekítést, vékony keretet és visszafogott árnyékot használnak;
- az aktuális modul erősebb ikonkeretet, halvány hátteret és keskeny aktív jelölősávot kap;
- minden modul ugyanazt a navigációt, kártyarendszert, tipográfiát és témát használja;
- a blueprint és D6 dekoráció világos módban 3–6%, sötét módban 5–8% vizuális erősségű.

## Domain- és hostlogika

- A felhasználóknak kommunikált elsődleges cím: `projektkapu.dimpro.hu`.
- A `door.dimpro.hu` nem külön alkalmazás; állandó 301-es átirányítással a Projektkapura vezet.
- A Projektkapu alkalmazásoldali hostkezelése a közös Next.js proxyban elő van készítve.
- A DNS-rekord, az Nginx server block és a TLS-tanúsítvány külön üzemeltetési lépés, amely csak a domain tényleges létrehozása után zárható le.
- A közös fiók célállapota `.dimpro.hu` szintű, biztonságosan konfigurált session, amennyiben az alkalmazott auth rendszer ezt támogatja.
- A publikus DROP meghívólink nem adhat automatikusan belső Projektkapu-hozzáférést.

## DIMPRO DROP fejlesztési határ

A PROJEKTKAPU 0.1.0 körben a `drop.dimpro.hu`, az `app/drop`, az `app/lib/drop`, a `components/drop` és a Drop API/adatmodell forrása **nem módosítható**. A DROP fejlesztése külön csevegésben folyik. A Projektkapu csak a későbbi kapcsolódási helyet és a közös rendszerstruktúra-leírást tartja fenn.

## Következő fejlesztési kör

**PROJEKTKAPU 0.2.0 – PostgreSQL Project Core és modulmotor-integráció**

Javasolt tartalom:

1. a jelenlegi file-backed Project Core migrálása saját PostgreSQL repositoryra;
2. szervezet- és projektmeghívási e-mail workflow;
3. tagsági státuszváltás, visszavonás és részletes szerepkörkezelés;
4. Document Core bekötése a DRIVE felülethez;
5. Communication Core bekötése a DIALOG felülethez;
6. Workflow Core bekötése a DECIDE felülethez;
7. naplóbejegyzés- és exportmotor bekötése a DIARY felülethez;
8. integrációs, jogosultsági és lifecycle tesztek.

## Elfogadási feltétel a PROJEKTKAPU 0.1.0 körhöz

- A D6 Core dashboard és mind a hat modulútvonal működik.
- Az angol és magyar modulnevek minden fontos navigációs helyen együtt látszanak.
- Desktopon, tableten és mobilon nincs vízszintes oldal-túlcsordulás.
- A világos és sötét mód olvasható.
- A Projektkapu útvonalak hitelesítés mögött maradnak.
- A `door.dimpro.hu` 301-es és a `projektkapu.dimpro.hu` host-routing alkalmazásoldali logikája elő van készítve.
- A Fejlesztési Központban a verzió és az időmérés rögzítve van.
- A DIMPRO rendszerstruktúra új Projektkapu/D6 Core termékcsoporttal frissült.
- A DIMPRO DROP forrása változatlan maradt.
- TypeScript, célzott ESLint, production build és smoke ellenőrzés sikeres.

## 2026-08-02 – Projektkapu-specifikus hibrid munkatér

A Projektkapu nem a DIMPROVER teljes háromoszlopos felületének másolata. A napi projektmunka számára külön hibrid shell készült, amely a közös DIMPROVER használati elveket megtartja, de a középső munkaterületet részesíti előnyben.

- Desktopon a bal oldali projektmenü összecsukható teljes menüből keskeny ikonsávvá.
- A jobb oldali projektkontextus-panel külön összecsukható, és az aktív D6 modulhoz igazodó fókuszpontokat, gyors eléréseket, projektállapotot és aktivitást mutat.
- A bal és jobb panel állapota böngészőnként megmarad.
- A két panel bezárásakor a középső munkafelület automatikusan teljesebb szélességet kap.
- 1260 px alatt a jobb panel ráúszó drawer-ként működik, háttérzárással.
- Mobilon és keskeny tableten a bal oldalsáv helyett az alsó D6 modulnavigáció marad, a projektkontextus pedig alapállapotban zárt drawer.
- A világos és sötét téma, a türkiz–petrol–zsályás arculat és a hat angol/magyar modulnév változatlanul megmaradt.
- A DIMPRO Drop forrásfájljai ebben a módosításban nem változtak.

Érintett fő fájlok:

- `components/project-gate/ProjectGateShell.tsx`
- `components/project-gate/ProjectGateShell.module.css`

Ellenőrzés:

- célzott ESLint: PASS;
- TypeScript: PASS;
- production build: PASS;
- Project Core/API és védett útvonal smoke: 10/10 PASS;
- világos/sötét, nyitott/összecsukott és reszponzív vizuális teszt: 6/6 PASS;
- vízszintes túlcsordulás: 0 px minden vizsgált nézetben.

## 2026-08-02 – PROJEKTKAPU 0.2.0 pre-SQL Project Core

A Project Core file-backed MVP-je repository-rétegre lett választva. A file adapter változatlan működést biztosít, miközben elkészült a Supabase/PostgreSQL adapter, az idempotens séma, az atomi projekt-, tagság- és életciklus-RPC, a health API és a file-state bootstrap. Az éles provider továbbra is `file`; Supabase-re csak sikeres kézi SQL, bootstrap, adat-összehasonlítás és candidate teszt után váltunk.

## 2026-08-02 – Project Core 0.2.0 Supabase aktiválva

A Project Core PostgreSQL-sémája sikeresen létrejött, a korábbi file-backed projektállapot átkerült a központi adatbázisba, és az éles provider `supabase` értékre váltott. A projekt-, tagsági és jogosultsági adatok egyeznek. Candidate tranzakciós teszt 11/11 PASS, éles Supabase regresszió és írási teszt 13/13 PASS. A file adapter csak kontrollált rollback célra maradt meg.

## 2026-08-02 – DRIVE Core 0.3.0 pre-SQL

A DRIVE / Dokumentumtár modul aktív munkatérre váltott. Elkészült a projektmappa-, dokumentum-, verzió-, audit- és desktop változáskurzor-réteg, a Project Core `document.read` / `document.write` jogosultságával. A felület hiányzó adatbázisséma esetén biztonságos telepítési állapotot mutat. Valós fájlbájt még nem kerül tárhelyre. A következő kézi lépés a `DIMPRO_PROJEKTKAPU_DRIVE_CORE_V030_BOOTSTRAP.sql` futtatása.

## 2026-08-02 – közös tipográfiai szabály

A Projektkapu projektlistája és minden modulja közös olvashatósági minimumot használ:

- minimum látható betűméret: 12 px;
- általános szöveg: jellemzően 14 px;
- űrlapok, táblázatok, navigációs és státuszfeliratok: minimum 12 px;
- desktop, tablet és mobil felületen is kötelező;
- az új modulok a `ProjectGateShell` tipográfiai skáláját öröklik.

## 2026-08-02 – DRIVE Object Storage 0.4.0 előkészítés

A DRIVE modulban megjelent a privát objektumtárhely állapotkártyája, a fájlfeltöltés és a dokumentumletöltés helye. Aktiválásig a műveletek letiltottak, miközben a D6 projekt 10 alapmappája és a teljes metaadat-alapú dokumentumtár használható marad.

## 2026-08-08 – Projektkapu Workspace UI 0.9.0

A Projektkapu teljes vizuális shellje a közös DIMPRO világos enterprise Design Systemhez igazodott. A munkatér fő tokenjei: navy rail `#06182c` / `#092641`, kék aktív navigáció `#1167ee`, külső shell `#edf3f8`, munkatér `#f7fafc`, panelek `#ffffff`, elválasztó `#dce6ef`, szöveg `#13233a`. A zöld szín csak jelentéssel bíró siker/aktív státuszhoz használható.

A bal oldali navigáció új működése:
- fix, mindig látható 58 px-es navy navigation rail desktopon és tableten;
- a railből nyíló 226 px-es projekt/modul board `position: fixed` lebegő overlay;
- a board nyitása és zárása nem változtatja a központi munkatér szélességét vagy bal pozícióját;
- telefonon a rail és a board eltűnik, a D6 alsó mobilnavigáció marad aktív.

A korábbi állandó „Gyors elérés – D6 Core modulok” alsó sáv kikerült. Helyette D6 modulváltó paletta készült: `Ctrl+Alt+M`, Tab / Shift+Tab, nyílbillentyűk, Enter, Esc és közvetlen `1–6` modulválasztás.

A nagy D6 moduláttekintő csak a ProjektTér / DOCK kezdőfelületén jelenik meg; a DRIVE, DROP, DIALOG, DECIDE és DIARY munkaterületek fölött nem foglal állandó helyet. A jobb oldali ContextBoard funkció megmaradt és a közös világos panelrendszerhez igazodik.

A DIMPRO Drive referenciaforrásai ebben a fejlesztési körben read-only módon kerültek felhasználásra; `components/drive/*` fájlhoz nem történt írás. A közös `DIMPRO Workspace Shell` kódszintű refaktor külön, összehangolt későbbi fejlesztés.

Validáció: ESLint PASS, TypeScript PASS, production candidate build PASS, élő desktop vizuális összevetés PASS, 12/12 élő acceptance PASS. Az élő Projektkapu és a referencia munkatér rail szélessége 58 px, board szélessége 226 px, navy gradientjei és `#f7fafc` munkatér-háttere egyeznek. Release: `.next-projectgate-drive-ui-20260808-release-final`.
