# 268 — BENJADMIN Fejlesztési Térkép V1 · DEV aktiválás

**Dátum:** 2026-08-17  
**Állapot:** DEV aktív · PROD változatlan

## Cél

A BENJADMIN Fejlesztői Konzol korábbi bal oldali nyers `FELADATOK` listája vezetői szinten nehezen volt értelmezhető, mert technikai acceptance-, E2E- és korábbi milestone taskok keveredtek a tényleges termékfejlesztésekkel. A V1 célja egy olyan fejlesztési térkép, amelyen a fejlesztéseket termék- és modulkontextus szerint lehet áttekinteni és biztonságosan átsorolni.

## Végleges DEV runtime

- runtime source / trusted code baseline: `9f1c07156478fc8e6c565812d14aef58d91a15a5`
- build: `YemJawidC5RIFJvn2tWjo`
- active release: `.next-field-capture-p0-p4-gesture-9f1c071`
- rollback release: `.next-field-capture-p0-p4-final-411c11b`
- operator docs/test HEAD az aktiváláskor: `9f6a81c1fbdb8608997334cdc0fe94f4391834bb`
- PM2 UI: online, unstable 0
- PM2 monitor: online, unstable 0
- PROD: nem módosult

## 1. Bal oldali kompakt Fejlesztési Térkép

A korábbi nyers `FELADATOK` lista helyett a konzol bal railjén `AKTÍV FEJLESZTÉSEK` jelenik meg.

A kompakt kártya vezetői szintű adatokat mutat:

- fejlesztés neve;
- projekt / modul útvonal;
- hatfokozatú munkafázis, például `6/3 · TESZTELÉS`;
- aktív/várakozó/blokkolt állapot.

A technikai M2/M3/P9/P10/P101/P102, acceptance és E2E taskok alapból nem terhelik a kompakt listát. Külön `Technikai / acceptance taskok` összesítőn keresztül érhetők el a teljes térképen.

## 2. Teljes Fejlesztési Térkép

Új route:

`/admin/dev-map`

A munkaterület nagy képernyőn két logikai hasábot használ:

1. **Forrás / átsorolandó fejlesztések**
   - keresés;
   - technikai taskok kapcsoló;
   - lezárt taskok kapcsoló;
   - még nem biztosan besorolt elemek jelzése;
   - draggable fejlesztési kártyák.

2. **Projekt- és modulhierarchia**
   - Főcsoport;
   - Projekt;
   - Modul;
   - Kontextus Modul / Almodul;
   - Munkarész.

A jelenlegi V1 taxonómia külön konfigurációs modellben van, ezért a BenjAdmin által átnézett Excel alapján később egyszerűen pontosítható.

## 3. Ctrl + Alt + 2

A BENJADMIN globális shell új gyorsbillentyűje:

`Ctrl + Alt + 2`

Működés:

- normál BENJADMIN felületről: megnyitja / fókuszálja a külön teljes méretű Fejlesztési Térkép ablakot;
- a Fejlesztési Térkép ablakban újra lenyomva: `window.blur()` + opener `focus()`, vagyis visszarejti/minimalizálja a térképet a munkafolyamatból;
- a felső sávban külön Térkép ikon is elérhető;
- a kompakt bal rail `Térkép` gombja ugyanezt a globális ablakot nyitja.

Live 3100 acceptance:

- Ctrl+Alt+2 megnyitás: PASS;
- popup opener kapcsolat: PASS;
- Ctrl+Alt+2 visszarejtés / opener focus: PASS.

## 4. Drag & drop átsorolás

A kártya célmodulra húzásakor a V1 **nem mozgat fizikailag Git objektumot**.

Módosul:

- `dev_center_tasks.metadata.developmentMap`;
- `dev_center_tasks.metadata.developmentContext`;
- task `updated_at`;
- audit esemény.

Nem módosul automatikusan:

- `project_id` fizikai projektkapcsolat;
- Git branch;
- Git worktree;
- fájlútvonal;
- repository tartalom.

Audit action:

`TASK_DEVELOPMENT_MAP_MOVED`

Kötelező audit meta:

- `productionAccess: DENY`;
- `physicalGitMove: false`;
- előző és új térképcél;
- Főcsoport / Projekt / Modul / Kontextus Modul.

## 5. Kezdeti taxonómia

Főcsoportok:

- Belső fejlesztési platform;
- DIMPRO;
- DIMPROVER;
- Belső infrastruktúra.

Kiemelt projektek:

- BENJADMIN Fejlesztői Konzol;
- DIMPRO Drop;
- DIMPRO Drive;
- DIMPRO Fájlműhely;
- DIMPROVER enterprise platform;
- DIMPRO Szerverüzemeltetés és Infrastruktúra.

A Drive és Drop a térképen már külön fejlesztési projektként szerepel. A BENJADMIN belső fejlesztései saját `BENJADMIN Fejlesztői Konzol` projektkontextust kapnak, nem a DIMPROVER termékprojektet terhelik vezetői nézetben.

## 6. Mobil / reszponzív javítás

A teljes térkép mobilon logikailag megtartja a forrás- és célterületet, de egymás alá tördelve jeleníti meg őket.

A térkép ikon hozzáadása kezdetben 390 px-en kb. 10–11 px globális topbar túlcsordulást okozott. A végleges javítás:

- mobil topbar `min-width: 0` / `max-width: 100%`;
- kompakt 32×32 vezérlőgombok;
- `CANONICAL` badge mobilon rejtve;
- DEV badge megmarad;
- hosszú aktív oldal cím mobilon rejtve;
- minden fontos funkcióikon elérhető marad.

Mobil browser acceptance: horizontal overflow = false.

## 7. Acceptance eredmények

Fejlesztési Térkép statikus contract:

- **25/25 PASS**

Exact `9f1c071` candidate:

- map runtime: **16/16 PASS**
- map browser: **15/15 PASS**
- desktop overflow: PASS
- mobile overflow: PASS
- drag & drop: PASS
- metadata persistence: PASS
- audit: PASS
- physical Git move tiltás: PASS

Post-cutover live 3100:

- map runtime: **16/16 PASS**
- map browser: **15/15 PASS**
- Ctrl+Alt+2 live: **2/2 PASS**
- Developer Console HTTP: 200
- Fejlesztési Térkép HTTP: 200
- Drop `/send`: HTTP 200
- Field Capture: auth-védett route, HTTP 307

Kapcsolódó regressziók:

- Conversation Archive V1.5: **8/8 PASS**
- Worker Context runtime: **14/14 PASS**
- Worker Context browser: **14/14 PASS**
- V1.5 command/testing runtime: **20/20 PASS**
- V1.5 testing browser: **10/10 PASS** a részletes task-kártyán
- Overnight Scheduler runtime: **30/30 PASS**
- Overnight Scheduler browser: **14/14 PASS**
- Plus V1.2 runtime: **29/29 PASS**
- Drop/GyorsSend: **44/44 PASS**
- Field Capture statikus: **36/36 PASS**
- Field Capture mobil browser: **19/19 PASS**

## 8. Következő lépés

A felhasználó által átnézett `DIMPRO_BENJADMIN_fejlesztesi_leltar_es_atrendezesi_javaslat_2026-08-17.xlsx` visszaérkezése után a taxonómia pontosítandó. A térkép konfigurációját ennek megfelelően kell frissíteni, majd a jelenlegi rossz helyen lévő taskokat a UI-n keresztül auditált drag & drop átsorolással rendezni.

V2 irány:

- saját Projekt / Modul / Kontextus Modul admin szerkesztő;
- új csoport/modul létrehozás a térképről;
- több kártya kijelölése és tömeges átsorolás;
- szűrés worker, státusz, 6-os fázis, dátum és termék szerint;
- archivált technikai taskok külön rétege;
- átsorolási history / undo;
- Excel import-javaslat és eltéréslista.
