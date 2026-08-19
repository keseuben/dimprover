# 295 — BENJADMIN Weekly Development Flow V2.2 · projektportfólió heti összevetés

**Dátum:** 2026-08-19
**Környezet:** kizárólag DEV
**Állapot:** DEV-en aktiválva · combined BENJADMIN + Commerce baseline · teljes live regresszió zöld · PROD DENY

## Cél

A Weekly Development Flow V2.2 a heti fejlesztési irányítást projektportfólió-szintre emeli. Egy közös vezetői nézetben összehasonlíthatók az aktív projektek ugyanazzal a Weekly Summary / Management Score motorral, amelyet az egyedi projekt heti összesítője is használ.

## Funkció

Projektenként megjelenik:

- rangsor;
- projekt neve és státusza;
- 0–100 flow-score;
- `stable / watch / critical` vezetői állapot;
- heti aktivitás;
- lezárt és blokkolt task;
- várakozás és hiba;
- aktív worker;
- worker handoff;
- max. handoff gap;
- elsődleges heti kockázat.

Portfóliószinten összesítve megjelenik:

- projektek száma;
- stable / watch / critical projektek száma;
- átlagos score;
- aktivitás;
- lezárt és blokkolt task;
- várakozás és hiba;
- egyedi aktív worker szám.

A problémás projekt automatikusan előrébb kerül. Elsődleges sorrend: `critical`, `watch`, `stable`; azonos állapoton belül alacsonyabb score, több hiba, több várakozás, több blokkolt task, végül projektnév dönt.

## Adatforrás és terhelés

- canonical projektforrás: `dev_center_projects`;
- csak aktív projektek;
- szerveroldali maximum 40 projekt;
- heti summary ugyanazzal a Management Score motorral;
- projekt-summary batch méret: 2;
- a V2.2-höz új DB tábla vagy migráció nem készült;
- a release-kori DEV adatbázisban 5 aktív projekt volt.

## API

Új endpoint:

`GET /api/dev/console/weekly-portfolio`

Opcionális query: `week`.

Biztonság:

- `isDevCenterAuthorized(..., true)`;
- `Cache-Control: private, no-store`;
- `x-dimpro-production-access: DENY`;
- anonim olvasás tiltott;
- PROD módosítás nem történt.

## UI

A `HETI FEJLESZTÉSI ÖSSZESÍTŐ` része új `PROJEKTPORTFÓLIÓ · HETI ÖSSZEVETÉS` panelt kapott.

A panel:

- öt összesített KPI-kártyát mutat;
- rangsorolt projektlistát jelenít meg;
- vizuálisan jelzi a stable / watch / critical állapotot;
- kijelöli az aktuális canonical projektet;
- projektkártyáról közvetlenül váltja a teljes BENJADMIN projektkiválasztást;
- a projektváltás a meglévő canonical state / localStorage mechanizmust használja;
- 5 percenként automatikusan frissül;
- a kézi heti Refresh a summary, a 8 hetes trend és a portfólióadatot együtt frissíti;
- korábbi hétre váltáskor nem renderel stale portfólióadatot.

Responsive szabály:

- desktop: egy soros projekt-összevetés;
- tablet: a metrikák szükség szerint külön sorra törnek;
- mobil: 2 oszlopos KPI- és projektmetrika-rács;
- oldal-szintű horizontális overflow nem megengedett.

## Érintett V2.2 forrásfájlok

- `app/api/dev/console/weekly-portfolio/route.ts`
- `app/lib/dev-center/developer-console.ts`
- `components/admin/developer-console/DeveloperConsole.module.css`
- `components/admin/developer-console/DeveloperConsoleShell.tsx`
- `components/admin/developer-console/DeveloperConversation.tsx`
- `components/admin/developer-console/WeeklyDevelopmentSummary.tsx`
- `components/admin/developer-console/types.ts`
- `scripts/benjadmin-weekly-development-flow-v22-portfolio-contract.mjs`
- `scripts/benjadmin-weekly-development-flow-v22-portfolio-runtime-browser-acceptance.mjs`

## V2.2 commitok

Eredeti feature commit:

`cc65952d3411e64f1099a5d81426b049e7d99475` — `feat(benjadmin): add weekly project portfolio`

Stale-week javítás:

`65a308be29e84d9cc5713d638955a17e96064588` — `fix(benjadmin): hide stale weekly portfolio data`

A V2.2 eredeti izolált buildje `65a308b` source-ról zöld volt, de közvetlen shared DEV release nem történt, mert a közös integration ág időközben Commerce / Árutér változásokat kapott.

## Combined integration Commerce-szel

A combined worktree a legfrissebb Commerce source-ról indult:

- Commerce merge baseline: `951e809390c47636cb15ed078d224701848ec578`
- Commerce DEV-domain kiegészítés: `15c22131a6af3a5e7955f8d4f4d2d73fa70f3464`
- combined worktree: `/srv/dimpro-dev/worktrees/armin-weekly-flow-v22-commerce-combined`
- combined branch: `feature/armin-weekly-flow-v22-commerce-combined-20260819`
- combined source: `484a82e43356b3c93e143da5cc9351b6471c505f`

A két V2.2 commit konfliktus nélkül került a `15c2213` Commerce source fölé. Commerce fájl nem lett automatikusan felülírva vagy eldobva.

## Combined source gate

BENJADMIN:

- V2.2 contract: **26/26 PASS**
- targeted ESLint: **PASS**
- `npx tsc --noEmit`: **PASS**
- `git diff --check`: **PASS**

Commerce / Árutér source regresszió:

- DEV root routing: **5/5 PASS**
- Árutér compatibility: **10/10 PASS**
- Storefront Pilot: **62/62 PASS**
- multi-item checkout contract: **44/44 PASS**
- cart UI contract: **56/56 PASS**
- queue idempotency: **25/25 PASS**
- mirror retry-due: **15/15 PASS**
- mirror worker: **54/54 PASS**

Canonical operator gate a ref-integráció után:

- `npx tsc --noEmit`: **PASS**
- teljes `npm run lint`: **0 error / 103 meglévő warning**
- `git diff --check`: **PASS**

## Exact combined candidate build

Build idő: **2026-08-19 21:45:25–21:53:52 CEST**

Source:

`484a82e43356b3c93e143da5cc9351b6471c505f`

BUILD_ID:

`t8yLKhRRHfotpR_H1xmtS`

Candidate artifact:

`/srv/dimpro-dev/worktrees/armin-weekly-flow-v22-commerce-combined/.next-benjadmin-weekly-flow-v22-commerce-combined-484a82e`

Build log:

`/srv/dimpro-dev/logs/benjadmin-weekly-flow-v22-commerce-combined-484a82e-build.log`

Eredmény:

- build exit 0;
- standalone PASS;
- standalone asset check: **254 statikus chunk PASS**;
- post-build storage retention lefutott.

OutminAI ugyanerről a `484a82e` source-ról külön canonical Commerce release buildet is futtatott 2026-08-19 22:04:13–22:14:20 CEST között; BUILD_ID: `9RmBAwS4znxStd85U6Ayv`. Ez további cross-worker build-verifikáció volt, a BENJADMIN shared release azonban a fent validált `t8yLKhRRHfotpR_H1xmtS` exact artifactot használja.

## Exact candidate runtime acceptance

Az exact `t8yLKhRRHfotpR_H1xmtS` artifact izolált localhost runtime-on lefutott.

BENJADMIN:

- V2.2 portfolio: **20/20 PASS**
- Weekly Summary V1.1: **35/35 PASS**
- V2.1 trend: **19/19 PASS**
- V2.0 report: **21/21 PASS**
- V1.4 Flow: **58/58 PASS**
- Common Chat V2: **30/30 PASS**
- Scheduler runtime: **30/30 PASS**
- Scheduler browser: **14/14 PASS**
- PROD: **DENY**
- V2.2 API 5 valós aktív DEV projekttel kb. **2,1 s** candidate válaszidőt adott.

Commerce exact candidate runtime:

- Storefront cart browser E2E: **20/20 PASS**
- multi-item checkout HTTP E2E: **23/23 PASS**
- idempotencia: PASS
- Commerce queue → `SUCCEEDED`: PASS

A shared DEV konfigurációban a Commerce queue továbbra is szándékosan kikapcsolt (`ARUTER_STOREFRONT_COMMERCE_QUEUE_ENABLED=0`); a queue útvonalat külön candidate E2E ellenőrizte.

## Ref-integráció

Expected-old védelemmel, központi koordinátoron keresztül történt.

Korábbi:

- operator: `d02fc2dcee038d1103b3fb0dfec13ac97f363e39`
- `integration/benjadmin-dev`: `951e809390c47636cb15ed078d224701848ec578`

Combined code baseline:

`484a82e43356b3c93e143da5cc9351b6471c505f`

A `484a82e` tartalmazza a Commerce `15c2213` source-ot és a V2.2 mindkét commitját.

## Shared DEV release

Release artifact:

`.next-benjadmin-weekly-flow-v22-commerce-release-484a82e`

BUILD_ID:

`t8yLKhRRHfotpR_H1xmtS`

Artifact promotion:

- sikeres: 2026-08-19 22:16:07–22:16:12 CEST
- backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v22-commerce-artifact-promotion-20260819T221607+0200`

Első cutover:

- 2026-08-19 22:18:00–22:18:13 CEST
- automatikusan rollbackelt a korábbi V2.1 release-re;
- ok: az izolált candidate futtatásból az artifact `standalone/.dimprover` útvonalában maradt egy dangling symlink, ezért a startup `EEXIST` hibával leállt;
- backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v22-commerce-cutover-20260819T221800+0200`.

A hibás runtime-linket kódmódosítás nélkül, ellenőrzött DEV artifact-higiéniai művelettel eltávolítottuk:

`/srv/dimpro-dev/backups/benjadmin-weekly-flow-v22-commerce-runtime-link-cleanup-20260819T221905+0200`

Sikeres cutover:

- 2026-08-19 22:19:15–22:19:27 CEST
- backup: `/srv/dimpro-dev/backups/benjadmin-weekly-flow-v22-commerce-cutover-20260819T221915+0200`
- PM2: `dimpro-benjadmin-operator-ui-v2-dev`
- aktív release pointer: `.next-benjadmin-weekly-flow-v22-commerce-release-484a82e`
- a release `standalone/.dimprover` symlinkje már a canonical operator `.dimprover` adattárra mutat.

OutminAI 2026-08-19 22:20:27–22:20:34 CEST között ugyanennek a `484a82e` shared runtime-nak az Árutér/Commerce cutover ellenőrzését is sikeresen lefuttatta; az aktív release és BUILD_ID nem változott.

## Shared DEV live smoke és regresszió

Kötelező smoke:

- `/admin/dev-console`: **PASS / HTTP 200**
- `/terep`: **PASS / auth redirect HTTP 307 → `/login`**
- `/api/field-capture/health`: **PASS / HTTP 200 / `ok: true`**
- `/api/dev/console/weekly-portfolio`: **PASS / 5 aktív projekt / PROD DENY**
- `/api/dev/console/weekly-trend-history?weeks=8`: **PASS / 8 pont / PROD DENY**
- `/api/dev/console/weekly-report-export?format=json`: **PASS / `BENJADMIN_WEEKLY_REPORT_V2_0` / PROD DENY**
- Árutér DEV root: **PASS / 307 → `https://app.dev.dimpro.hu/aruter/kovacs-kerteszet`**
- Árutér storefront: **PASS / HTTP 200**
- Árutér public products: **PASS / HTTP 200 / pilot=true / multi-item=true / 2 termék**

Teljes shared DEV live regresszió:

- V2.2 portfolio: **20/20 PASS**
- Weekly Summary V1.1: **35/35 PASS**
- V2.1 trend: **19/19 PASS**
- V2.0 report: **21/21 PASS**
- V1.4 Flow: **58/58 PASS**
- Common Chat V2: **30/30 PASS**
- Scheduler runtime: **30/30 PASS**
- Scheduler browser: **14/14 PASS**

A live V2.2 portfolio API válaszidő a regressziós futásban kb. **1,7 s** volt 5 aktív DEV projekttel.

## Végállapot

- Weekly Development Flow V2.2: **DEV-en aktív**
- combined BENJADMIN + Commerce code baseline: `484a82e43356b3c93e143da5cc9351b6471c505f`
- shared runtime BUILD_ID: `t8yLKhRRHfotpR_H1xmtS`
- PM2: online
- központi lock: szabad
- `/terep` és Field Capture regresszió: zöld
- Árutér / Commerce smoke: zöld
- PROD módosítás: **nem történt**
- PROD access: **DENY**
