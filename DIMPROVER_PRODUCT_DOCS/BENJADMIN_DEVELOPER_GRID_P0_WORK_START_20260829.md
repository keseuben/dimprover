# BENJADMIN Developer Grid — P0 napi munkaindító composer — 2026-08-29 12:00

## Környezet
- DEV ONLY · PROD DENY
- Developer Grid only
- ChatGrid v0.3.x fallback/reference változatlan
- Induló HEAD: `4f0a2010282e65f8371bb762326f6ac26e8afd79`

## Elkészült P0 blokk
A BENJADMIN Fejlesztői Vezérlőpult tetején elkészült a napi munka elsődleges indítófelülete:
- `Mit fejlesszünk?` nagy, több soros szövegmező;
- opcionális projekt- és modulkontextus;
- `MUNKA INDÍTÁSA` gomb;
- Ctrl+Enter explicit indítás, sima Enter új sor;
- KÉSZ / ELŐKÉSZÍTÉS / AKTÍV / BLOKKOLT állapot;
- aktív task azonosító, cím és state revision megjelenítés;
- backend/auth hiba esetén a beírt draft megmarad;
- kliensoldali busy gate és szerveroldali idempotency task ID védi a dupla beküldést;
- az eredeti emberi utasítás változtatás nélkül `sourcePrompt` formában kerül a task metadata és `developmentContext` részébe;
- nincs AI-s automatikus átírás.

## Authoritative backend
Új Developer Grid-specifikus adapter:
- `POST /api/dev/grid/work-start` — párosított Developer Grid device-auth szükséges;
- `GET /api/dev/grid/work-start` — reconnect/újraindítás után visszatölti az authoritative aktív state-et;
- új task a meglévő `dev_center_tasks` engine-ben készül, nem párhuzamos taskmotorban;
- BenAI meglévő `autoRouteDevEngineTaskByAvailability` routingját használja;
- `materializeGridTaskSession` az authoritative Developer Grid state/delta store-ba ír;
- `SOURCE_BASELINE_MISMATCH` fail-closed;
- minden válasz DEV / productionAccess DENY.

## Idempotencia
A kliens minden indítási kísérlethez idempotencyKey-t tart fenn. A szerver ebből determinisztikus task ID-t képez. Ismételt kérés ugyanazzal a kulccsal és ugyanazzal a sourcePrompttal a meglévő taskot használja; eltérő prompt ugyanazzal a kulccsal konfliktus. Párhuzamos create race esetén a szerver újraolvassa az engine state-et és csak az exact azonos prompttal létrejött taskot fogadja el újrafelhasználhatóként.

## Acceptance
- Work-start contract: **17/17 PASS**
- Foundation contract: **28 required files / 42 invariants PASS**
- Desktop acceptance: **59/59 PASS**
- Native delta contract: **19/19 PASS**
- State contract: **17/17 PASS**
- Runtime provenance: **10/10 PASS**
- TypeScript: **PASS**
- npm audit: **0 vulnerability**
- git diff --check: **PASS**

## Build / release
Ebben az önálló órás blokkban teljes canonical Next build és új EXE/DEV ZIP nem indult. A következő RC/release blokk kizárólag erről a tiszta checkpoint commitról vagy annak leszármazottjáról indulhat a meglévő canonical build → candidate → Windows marker → release artifact pipeline-on.

## Következő lépés
A P0 composer forrás és contract kész. Következő blokk: exact checkpoint provenance újraellenőrzés, majd canonical candidate build és valós route/candidate smoke kiegészítése a `work-start` GET/POST auth/fail-closed viselkedésre. Az esti kézi Windows acceptance során egy valódi napi taskot innen kell elindítani.

**DEV ONLY · PROD DENY**
