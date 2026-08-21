# 297 — BENJADMIN ChatGrid projektregisztráció + External Review Room terv

Dátum: 2026-08-21
Környezet: DEV only
PROD: DENY

## Cél

A BENJADMIN ChatGrid Desktop ne különálló segédalkalmazásként, hanem a BENJADMIN Fejlesztői Konzol hivatalos moduljaként legyen nyilvántartva. Emellett a ChatGrid jövőbeli M.Forge-AI / V.Guard-AI integrációja külön, auditálható External Review Room modulként szerepeljen.

## Hivatalos BENJADMIN projekt

- Projekt ID: `project_benjadmin`
- Név: `BENJADMIN Fejlesztői Konzol`
- Kategória: `Belső fejlesztési és AI-vezérlő platform`
- Státusz: `active`
- PROD hozzáférés: `DENY`

A projekt a következő fő képességeket fogja össze:

- BenAI fejlesztési koordináció;
- AI worker task routing és lifecycle;
- ChatGrid Desktop;
- M.Forge-AI / V.Guard-AI külső AI workflow;
- live státusz / worker presence;
- audit, build/release koordináció és BENJADMIN Gate.

## Regisztrált ChatGrid verziók

### BENJADMIN ChatGrid Desktop v0.2.9

- Version ID: `version_benjadmin_chatgrid_029`
- Modul: `ChatGrid Desktop`
- Státusz: `testing`
- Platform: Windows Electron
- Source commit: `55f4ae330a61fde592df7327d281dbae89c8b8c2`
- Source acceptance: `123/123 PASS`
- Windows hotfix ellenőrzés: Ctrl+Alt+9 és globális BEÁLLÍTÁSOK fizikailag PASS
- Teljes Windows E2E: még nyitott

### ChatGrid External Review Room V0.1

- Version ID: `version_benjadmin_chatgrid_external_review_v01`
- Modul: `ChatGrid External Review Room`
- Státusz: `planned`
- Résztvevők: `BENJADMIN`, `BENAI`, `MFORGE`, `VGUARD`
- Provider réteg: `OPENAI_CODEX`, `CLAUDE`
- Alapállapot: read-only review
- DEV write: csak explicit BenjAdmin jóváhagyással
- PROD: DENY

## ChatGrid megjelenési terv

A meglévő 01–04 worker grid és az 05 BenjAdmin központi ablak nem változik alapstruktúrájában.

A fő felső sávba kerül egy `REVIEW` vezérlő M.Forge-AI és V.Guard-AI kis avatárjával és várakozó review-számlálóval.

Kattintásra egy széles központi External Review Room nyílik:

`M.Forge-AI kártya | közös Review Thread | V.Guard-AI kártya`

### M.Forge-AI kártya

Mutatja:

- worker állapot;
- provider / modell;
- task ID;
- baseline és result commit;
- diff / changed file count;
- aktuális jogosultság: `READ ONLY`, `WRITE REQUESTED`, `SCOPED DEV WRITE`;
- utolsó megállapítás vagy javaslat.

### Közös Review Thread

A thread minden üzenete BenjAdmin számára látható. A résztvevők:

- BenAI;
- M.Forge-AI;
- V.Guard-AI;
- BenjAdmin.

Nem lehet háttérben rejtett AI–AI beszélgetés. Minden érdemi üzenet, finding, javaslat, válasz és döntés ugyanabban az auditálható threadben jelenik meg.

BenjAdmin bármikor:

- hozzászólhat;
- STOP-ot adhat;
- kérdést tehet fel;
- döntést hozhat;
- scope-ot módosíthat;
- DEV írási engedélyt adhat vagy visszavonhat.

### V.Guard-AI kártya

Mutatja:

- review readiness;
- provider / modell;
- vizsgált commit/diff;
- findingok severity/category bontásban;
- verdict: `PASS`, `PASS WITH NOTES`, `FAIL`;
- független reviewer státusz.

V.Guard-AI alapból review-only. Ha BenjAdmin explicit scoped DEV write engedélyt ad neki és kódot módosít, az adott taskon a független reviewer státusza megszűnik. Ilyenkor új, független review szükséges másik reviewer/model által.

## Jogosultsági modell

1. `READ ONLY REVIEW` — alapállapot, nincs fájlírás.
2. `WRITE REQUESTED` — worker indoklással engedélyt kér.
3. `BENJADMIN APPROVED` — emberi, task- és scope-specifikus jóváhagyás.
4. `SCOPED DEV WRITE` — kizárólag kijelölt DEV worktree és engedélyezett pathok.
5. `REVIEW REQUIRED` — módosítás után kötelező független ellenőrzés.
6. `PROD DENY` — külön explicit PROD gate nélkül nincs éles művelet.

## BENJADMIN backend jelenlegi állapota

A M.Forge-AI és V.Guard-AI backend-oldali alapjai már léteznek a BENJADMIN DEV forrásban:

- worker identitás és profil;
- külső AI worker policy;
- M.Forge JIT worktree / patch pipeline;
- M.Forge provider executor;
- V.Guard review prompt / readiness / review parser;
- OpenAI Codex / Claude model adapter választás;
- External AI Worker drawer a webes BENJADMIN konzolban;
- PROD-DENY és review-only kapuk.

A következő fejlesztési lépés ezért elsősorban nem a backend worker létrehozása, hanem a ChatGrid External Review Room UI és a közös, BenjAdmin számára látható review-thread szerződés kiépítése.

## Reprodukálható DEV registry

Forrás:

`scripts/benjadmin-chatgrid-project-registry.mjs`

A script csak az engedélyezett DEV hostokon fut:

- `app.dev.dimpro.hu`
- `admin.dev.dimpro.hu`

A script idempotensen felvezeti a `project_benjadmin` projektet és a két ChatGrid verziót. PROD környezeten fail-closed.
