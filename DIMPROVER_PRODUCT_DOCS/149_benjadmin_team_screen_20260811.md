# BENJADMIN csapatképernyő – élő működési és infrastruktúra nézet

Dátum: 2026-08-11

## Cél

A BENJADMIN fejléc jobb felső részén, az adatvédelmi takaró gombja mellett külön csapatképernyő-gomb készült.

A csapatképernyő vizuálisan a takaróképernyő sötét, blueprint jellegű BENJADMIN arculatát folytatja, de nem takarófunkció: a BENJADMIN csapat, az infrastruktúra és a rendszer működési állapotának látványos bemutató/operátori nézete.

A fejlesztés a B3 / B3.1 / B3.2 normatív crosswalk szerint készült. PROD módosítás nem történt.

## Kanonikus csapatnevek

A felhasználói felületen kötelező megjelenítési forma:

- Benjadmin
- Ben-AI
- Ármin-AI
- Jázmin-AI
- Outmin-AI

A technikai azonosítók és adatbázis-kódok kompatibilitási okból változatlanok maradhatnak (`BENAI`, `ARMINAI`, `JAZMINAI`, `OUTMINAI`, `worker_outminai` stb.). A kötőjeles név megjelenítési szabály, nem adatbázis-migráció.

## Hexagon csapatemblémák

A csapatkártyák a már korábban elkészített, meglévő BENJADMIN hexagon képfájlokat használják:

- `public/benjadmin/team/01_BenjAdmin.webp`
- `public/benjadmin/team/02_BenAI.webp`
- `public/benjadmin/team/03_ArminAI.webp`
- `public/benjadmin/team/04_JazminAI.webp`
- `public/benjadmin/team/05_OutminAI.webp`

A forrásképek 96×64 px WebP állományok. A csapatképernyő ezeket teljes képként, `object-fit: contain` megjelenítéssel használja; a korábbi négyzetes crop nem alkalmazható, mert az levágná / torzítaná a hexagon emblémát.

## Megnyitás és bezárás

A csapatképernyő csak aktív, szerveroldalon is ellenőrzött BENJADMIN admin munkamenetben érhető el.

Megnyitás / bezárás:

- fejléc jobb felső `BENJADMIN csapatképernyő` ikon;
- `D` billentyű, ha a felhasználó éppen nem szövegmezőben gépel;
- `Ctrl+Alt+0`;
- a felső `DIMPRO BENJADMIN` felirat `D` betűjére dupla kattintás bezárja a képernyőt.

A `Ctrl+Alt+Space` adatvédelmi takaró gyorsbillentyű változatlan marad. A csapatképernyő és a takaróképernyő egymást kizáró overlay állapot.

## Középső munkatér

A középső munkatérben öt látványos csapatkártya jelenik meg:

- hexagon embléma;
- név;
- beosztás / szerepkör;
- fő feladatok;
- worker esetén aktuális állapot;
- nyitott feladatok száma;
- aktív munkamenetek száma.

A kártyák nem demo worker állapotot használnak: Ármin-AI, Jázmin-AI és Outmin-AI állapotai a Development Center élő read modelből érkeznek.

## Bal oldali oszlopsáv

Első verzióban a ténylegesen elérhető, valós DEV szerverállapot jelenik meg:

- BENJADMIN DEV VPS állapot;
- memória teljes / használt / szabad kapacitás;
- rendszerlemez teljes / foglalt / szabad kapacitás;
- 1 perces load average;
- PM2 online folyamatok;
- Nginx állapot;
- üzemidő;
- DEV / STAGING / PRODUCTION környezetek állapota és read-only/write policy;
- objektumtár / storage telemetry readiness.

Más szerverhez vagy tárhelyhez a UI nem talál ki terhelési vagy kapacitásadatot. Ha a B3.1 monitor collector még nem szolgáltat hozzá valós mintát, `Nincs adat` / telemetry-pending állapot jelenik meg.

## Jobb oldali oszlopsáv

A választott jobb oldali vizualizáció két vonaldiagram + rendszerpulzus:

1. **Fejlesztési aktivitás**
   - utolsó 7 nap;
   - task változások;
   - megnyitott work sessionök.

2. **Rendszerterhelési trend**
   - CPU;
   - memória;
   - lemez;
   - a `dev_center_monitor_samples` valós mintáiból.

3. **Vezérlési pulzus**
   - aktív command queue;
   - függő approval;
   - monitoring minták;
   - storage minták.

A rendszerterhelési vonaldiagram üres állapotot mutat addig, amíg nincs valós B3.1 monitoring adat. Demo vagy generált görbe tilos.

## Adatforrások

A csapatképernyő read-only GET hívásokat használ:

- `/api/dev/engine/state`
- `/api/license/server-status`
- `/api/dev/engine/control-plane`
- `/api/dev/engine/partner-projects`

30 másodperces silent refresh működik. A képernyő nem végez write, restart, build, migration vagy deploy műveletet.

## Biztonság

- csak hitelesített BENJADMIN shellben érhető el;
- admin kulcs továbbra is a meglévő zárt munkamenetből kerül a read-only API-khoz;
- raw secret / token / private key nem jelenik meg;
- PROD write jogot nem ad;
- Outmin-AI B3.2 default-deny / partner izolációja változatlan.

## Responsive

Desktop cél: teljes csapat + két oldalsáv egy képernyőn.

Tablet/mobil:

- középső csapatblokk kerül előre;
- infrastruktúra és diagramok alá rendeződnek;
- vízszintes oldal-overflow nem megengedett;
- az információ nem tűnik el, csak átrendeződik.

Működési szöveg minimum 12 px.

## Érintett fájlok

- `components/admin/BenjadminTeamScreen.tsx`
- `components/admin/AdminThemeShell.tsx`
- `components/admin/BenjadminOperatorConsole.tsx`
- `components/admin/DevEnginePanel.tsx`
- `components/admin/BenjadminPartnerDevelopmentPanel.tsx`
- `app/admin/admin-theme.css`
- `scripts/benjadmin-team-screen-acceptance.mjs`

A kapcsolódó régi acceptance tesztek csapatnév-elvárásai is a kanonikus kötőjeles megjelenítéshez lettek igazítva.

## DEV acceptance és build

A csapatképernyő célzott acceptance eredménye:

**20/20 PASS**

Külön ellenőrzött:

- fejlécgomb a takaróképernyő mellett;
- kanonikus nevek: `Benjadmin`, `Ben-AI`, `Ármin-AI`, `Jázmin-AI`, `Outmin-AI`;
- mind az öt meglévő 96×64 px hexagon embléma betöltése;
- hexagon képeknél `object-fit: contain`, négyzetes crop nélkül;
- DIMPRO BENJADMIN márkafelirat;
- bal infrastruktúra/tárhely sáv;
- jobb oldali vonaldiagramok;
- valós fejlesztési adatsor;
- monitoring-hiánynál kitalált rendszertrend tiltása;
- minimum 12 px működési tipográfia;
- 1440×900 desktop one-viewport;
- `D` nyit/zár;
- `Ctrl+Alt+0` nyit/zár;
- a DIMPRO BENJADMIN `D` betű dupla kattintása bezár;
- tablet és 390 px mobil horizontal overflow nélkül.

Regresszió:

- Operator UI: **30/30 PASS**;
- B3.2 P1 Partner Registry: **14/14 PASS**;
- B3.1 Control Plane: **13/13 PASS**;
- B3.2 P5 final: **53/53 PASS**;
- B3.2 P2 runtime/policy: **12/12 PASS**, runtime `READY`.

Aktív DEV build:

`xPU7aTFfPmDq2IXQsAs81`

PM2:

`dimpro-benjadmin-operator-ui-v2-dev` – online.
