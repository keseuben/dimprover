# BENJADMIN Developer Grid v0.1.15 – fejléc egyszerűsítés + System Health kontraszt

**Dátum:** 2026-09-05
**Worker:** OutminAI
**Környezet:** DEV ONLY · PROD DENY
**Alap:** v0.1.14 Windows fizikai E2E visszajelzés

## Cél

A v0.1.14 Windows ellenőrzés alapján a Developer Grid alkalmazásfejléce túl sűrű volt, a System Health gyorsnézet címe alacsony kontrasztú maradt, a részletes System Health fejléc pedig világos és sötét módban is túl közel került a háttér tónusához. A v0.1.15 ezeknek a közvetlen fizikai Windows visszajelzéseknek a javító candidate-je.

## Fejléc

- A bal oldali termékazonosítás két soros lett.
- Első sor: `BENJADMIN Developer Grid`.
- Második sor: `AI Engineering Control Center · v0.1.15`.
- A középső aktív-task szövegsáv megszűnt.
- A látható `Utolsó frissítés` és külön `Grid UI` szövegek kikerültek a fejlécből.
- A jobb oldal vezérlő-orientált: DevminAI, layout/split, kompakt ChatGPT állapot + frissítés, napi indítás, Central Core, review, zoom, téma, beállítás, zárolás és ablakgombok.
- A ChatGPT frissítési idő továbbra is elérhető tooltipben, a részletes frissítési információ pedig a láblécben és a beállításokban megmarad.
- A fejléc drag-területe a termékazonosítás és a jobb oldali vezérlők között megmarad.

## System Health kontraszt

- A hoveres `SYSTEM HEALTH · GYORSNÉZET` áttetsző üvegfelület helyett határozott, közel teljesen fedett státuszfelületet kapott.
- A gyorsnézet címe, magyarázata és metric-kártyái explicit, teljes opacity értékkel és light/dark módra külön nagy kontrasztú színekkel jelennek meg.
- A részletes System Health panel 52 px magas, elkülönített, fedett fejlécsávot kapott.
- A `SYSTEM HEALTH`, frissítési idő, overall pill és vezérlőgombok háttere különválik a panel body-jától.
- Light és dark módban külön felület- és szövegszín biztosítja az olvashatóságot.
- A v0.1.14-ben elkészült Central Core / Health rétegzési és bounds-szabályok változatlanul érvényesek.

## Verzió és kiadás

A v0.1.14 publikus DEV artifact immutable. A fenti vizuális javítások új candidate-ként `v0.1.15` verziót kapnak; meglévő artifact nem írható felül.

## Kötelező kapuk

- DEV ONLY · PROD DENY.
- Tiszta, explicit branch/worktree/HEAD.
- Desktop UI/acceptance, System Health, workspace/chat és refresh contract PASS.
- Teljes TypeScript és lint ellenőrzés.
- Valódi BUILD01 FULL BUILD az MCP Build Transport Gatewayen keresztül.
- Windows artifact csak az exact current-HEAD BUILD_ID + `.dimpro-release.json` proof után.
- Publikus DEV staging után teljes EXE/ZIP/manifest SHA-256 visszaellenőrzés.
- A fizikai Windows E2E csak a felhasználói v0.1.15 indítás után tekinthető lezártnak.
