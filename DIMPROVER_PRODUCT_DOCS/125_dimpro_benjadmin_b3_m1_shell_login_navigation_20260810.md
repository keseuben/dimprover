# DIMPRO BENJADMIN B3 – M1 shell / login / protective screen / navigáció

Dátum: 2026-08-10
Állapot: fejlesztés és tesztelés alatt
Mérföldkő: M1
Dev Center verzió: `version_6798d30a-18d`
Dev Center munkamenet: `work_147e7523-93a`

## Indítási baseline

- DEV VPS: `213.160.68.32`
- PROD: `213.160.68.24` – M1 alatt read-only
- DB VPS: `213.160.68.33`
- M0 lezárt branch: `infra/benjadmin-b3-m0`
- M0 végső commit: `049ffcdad2c2284a0451052ad0c42e544bc2a378`
- M1 branch: `feat/benjadmin-b3-m1-shell`
- M1 worktree: `/srv/dimpro-dev/worktrees/benjadmin-m1-shell`
- M1 előtti DEV Restic checkpoint: `8ffdd72e`
- M1 előtti érintett forrásfájl-mentés: `/srv/dimpro-dev/artifacts/benjadmin-m1-preedit-20260809T232550Z`

## M1 cél

A BENJADMIN saját, zárt admin shelljének kialakítása úgy, hogy a meglévő licencadmin, fejlesztési központ és üzemeltetési funkciók megmaradjanak.

Fő UX elvek:

- publikus felületen csak a `DIMPRO BENJADMIN` márkanév és az `AI Fejlesztési és Üzemeltetési Központ` alcím látszik;
- a belépőkártya alapállapotban rejtett;
- asztali gépen a `D` betű dupla kattintásával vagy `Ctrl+Alt+B` kombinációval nyitható;
- mobilon és tableten a `D` betű hosszú érintésével nyitható;
- hitelesítés után keskeny, sötét ikonrail szolgál fő navigációként;
- a második navigációs board lebegő rétegként nyílik meg, és nem szűkíti össze a munkaterületet;
- `Ctrl+Alt+Space` adatvédelmi takaróképernyőt kapcsol;
- takaróképernyőről a `D` dupla kattintása / hosszú érintése csak érvényes BENJADMIN munkamenet esetén enged vissza.

## M1 első fejlesztési kör

Létrejött:

- `components/admin/BenjadminBrandScreen.tsx`
  - közös publikus és privacy protective screen;
  - látható belépési instrukció nélkül;
  - dupla kattintás és hosszú érintés kezelése.
- `components/admin/AdminThemeShell.tsx`
  - BENJADMIN shell;
  - keskeny ikonrail;
  - lebegő második board;
  - világos/sötét téma;
  - DEV környezetjelző;
  - privacy cover;
  - kijelentkezés;
  - belső AI családfa rövid jelzése csak hitelesítés után.
- `app/admin/page.tsx`
  - a meglévő admin OTP + admin kulcs folyamat megőrzése;
  - rejtett protective entry;
  - `Ctrl+Alt+B`;
  - sikeres OTP + admin kulcs után tabhoz kötött BENJADMIN session-jelző;
  - a tárolt admin kulcs önmagában nem minősül aktív BENJADMIN-munkamenetnek.
- `app/admin/admin-theme.css`
  - protective screen;
  - desktop shell;
  - lebegő board;
  - tablet és mobil bottom-dock / bottom-drawer viselkedés.
- `app/admin/layout.tsx`
  - BENJADMIN metadata és PWA megnevezés.
- `proxy.ts`
  - `admin.dimpro.hu`, `admin.dev.dimpro.hu`, `admin.stag.dimpro.hu` BENJADMIN host felismerés;
  - `/` és `/login` belső rewrite az admin protective entryre.

## Fő BENJADMIN nézetek

1. Áttekintés
2. Fejlesztés
3. Környezetek
4. Infrastruktúra
5. Licencek
6. Audit

A meglévő oldalak első körben ezekhez a nézetekhez vannak bekötve, így M1 nem törli és nem írja újra szükségtelenül a már működő modulokat.

## Biztonsági szabály

A protective screen vizuális elrejtés, nem önálló hitelesítési mechanizmus. A tényleges hozzáférés továbbra is a meglévő admin OTP + admin kulcs ellenőrzéshez kötött. A BENJADMIN shell csak aktív, tabhoz kötött session-jelző és szerveroldalon újraellenőrzött admin kulcs együttese esetén jelenik meg.

PROD-hoz M1 alatt nem történik írás.

## Ellenőrzési állapot

Első statikus kör:

- TypeScript: PASS
- célzott ESLint: 0 error; 1 örökölt warning (`machineMetaSaveStatus`)
- M1 által bevezetett új lint warning: 0

Hátralévő kötelező gate-ek:

- teljes repository lint;
- koordinált production build;
- M0 regressziós smoke;
- BENJADMIN candidate HTTP/browser smoke;
- desktop 1440×1000;
- tablet 1024×1366;
- mobil 390×844;
- DEV aktiválás csak minden candidate gate PASS után;
- végső Dev Center napló és M1 lezárás.

## Candidate gate – 2026-08-10

A root host routing első candidate próbája feltárt egy belső rewrite-proxy problémát. A végleges M1 megoldás nem proxyzza saját magára az admin hostot: az `app/page.tsx` host alapján relatív `/admin` redirectet ad, az `admin.* /login` pedig szintén `/admin` irányba tér vissza. Így a BENJADMIN entry nem függ belső DNS vagy loopback proxyzástól.

Candidate eredmények:

- végső candidate build ID: `zlfd79DEmENOtTNpBA4FA`
- standalone asset check: 141/141 PASS
- TypeScript: PASS
- teljes ESLint: 0 error, 108 meglévő warning
- M1 célzott lint: 0 error; csak az örökölt `machineMetaSaveStatus` warning maradt
- M0 regressziós release gate: 13/13 PASS
- BENJADMIN browser acceptance: 6/6 PASS
  - public desktop 1440×1000
  - public tablet 1024×1366
  - public mobil 390×844
  - shell desktop 1440×1000
  - shell tablet 1024×1366
  - shell mobil 390×844
- horizontal overflow: 0 mind a hat esetben
- lebegő board workspace-szélesség változás: 0 px mindhárom shell viewportban
- privacy cover restore: PASS mindhárom viewportban
- public hidden login reveal:
  - `Ctrl+Alt+B`: PASS
  - `D` dupla kattintás: PASS
  - `D` hosszú érintés: PASS

A candidate külön `127.0.0.1:3201` porton futott. Az aktív DEV 3100-as runtime ezen ellenőrzések alatt nem változott.

## DEV aktiválás és live acceptance – 2026-08-10

Az M1 candidate minden gate PASS eredménye után kontrolláltan aktiválásra került kizárólag a DEV VPS-en.

Aktív DEV runtime:

- PM2 process: `dimpro-benjadmin-m1-dev`
- port: `3100`
- build ID: `zlfd79DEmENOtTNpBA4FA`
- standalone asset ellenőrzés: 141/141 PASS
- M0 rollback process: `dimpro-benjadmin-m0-dev`, leállított állapotban megtartva
- PROD változtatás: nem történt; PROD továbbra is read-only

Aktiválás előtti második DEV Restic checkpoint:

- `12720a53`

M1 előtti első checkpoint:

- `8ffdd72e`

A DEV runtime adatfolytonosság megtartása érdekében az M0 `.dimprover` és `.data` runtime állományai átöröklésre kerültek az M1 worktree-be. Visszaellenőrzés:

- admin kulcs egyezés: PASS
- login audit log egyezés: PASS
- Drop runtime state egyezés: PASS
- M1 Dev Center állapot megmaradt: PASS

Aktiválás utáni helyi health gate:

- `admin.dev.dimpro.hu/admin`: 200
- `admin.dev.dimpro.hu/`: 307 → `/admin`
- Drop health: 200
- Identity health: 200

Publikus HTTPS ellenőrzés:

- `https://admin.dev.dimpro.hu/`: 307 → `/admin`
- `https://admin.dev.dimpro.hu/admin`: 200
- `https://admin.dev.dimpro.hu/login`: 307 → `/admin`
- Drop health: 200
- Identity health: 200

### Live responsive browser acceptance

A candidate 6/6 responsive browser acceptance után ugyanez a teszt az aktív DEV HTTPS környezeten is lefutott:

- live browser acceptance: 6/6 PASS
- desktop public + shell: PASS
- tablet public + shell: PASS
- mobil public + shell: PASS
- horizontal overflow: 0 mind a hat esetben
- lebegő board workspace-szélesség változás: 0 px desktop/tablet/mobil
- privacy restore: PASS desktop/tablet/mobil

### Kibővített M1 UI acceptance

További 19 külön live böngészős acceptance eset futott, 19/19 PASS eredménnyel. A responsive 6 esettel együtt az M1 lezárási UI acceptance készlet 25 PASS esetet tartalmaz.

A kibővített ellenőrzés többek között lefedte:

- publikus felületen login rejtett: PASS
- publikus felületen belső AI család rejtett: PASS
- `Ctrl+Alt+B` rejtett login előhívás: PASS
- `/login` protective entry: PASS
- jogosulatlan `/admin/dev` védett: PASS
- admin API kulcs nélkül 401: PASS
- hitelesített BENJADMIN shell: PASS
- hat fő navigációs elem: PASS
- lebegő board nem szűkíti a workspace-t: PASS
- belső AI család csak hitelesített shellben: PASS
- `Ctrl+Alt+Space` privacy cover: PASS
- privacy restore: PASS
- theme váltás és reload utáni megőrzés: PASS
- Környezetek / Infrastruktúra / Licencek / Audit shell route: PASS
- kijelentkezés törli a BENJADMIN sessiont és visszaadja a protective entryt: PASS

Tesztlogok:

- `/srv/dimpro-dev/logs/m1-live-visual-smoke/results.json`
- `/srv/dimpro-dev/logs/benjadmin-m1-live-additional-acceptance.json`

### M1 release-gate

A korábbi M0 gate az admin rooton közvetlen HTTP 200-at várt. M1-ben ez szándékosan megváltozott: a root 307-tel `/admin`-ra irányít, ahol 200 érkezik. Emiatt az M1 gate ezt az új route-szerződést ellenőrzi.

Végső M1 release-gate:

- 13/13 PASS
- 0 blocker
- auth allowlist: PASS
- signup disabled: PASS
- valós OTP E2E audit: PASS
- DEV/App/Drop/Identity health: PASS
- admin DNS/TLS: PASS
- admin root 307 → `/admin`, `/admin` 200: PASS
- GitHub deploy key/write routing: PASS
- Drive DEV storage quarantine/write config: PASS
- Drop DEV storage quarantine/isoláció: PASS

Gate log:

- `/srv/dimpro-dev/logs/benjadmin-m1-live-release-gate.json`

A legacy M0 gate aktiválás előtt továbbra is 13/13 PASS volt. Aktiválás után ugyanaz a régi gate 12/13-at jelez kizárólag azért, mert még a régi admin-root HTTP 200 szerződést várja; funkcionális regressziót nem talált.

## Végső forrás- és buildállapot

- M1 forrás commit: `28aca6bac3456631eed733266effb193882b6df9`
- branch: `feat/benjadmin-b3-m1-shell`
- GitHub push: PASS, remote commit egyezés PASS
- TypeScript: PASS
- teljes ESLint: 0 error, 108 meglévő warning, az M0 baseline-nal azonos warning-szint
- build: PASS
- végső aktív build ID: `zlfd79DEmENOtTNpBA4FA`
- standalone assets: 141/141 PASS
- `git diff --check`: PASS

Az M1 saját kódja új lint hibát nem vezetett be. Az `npm ci` a jelenlegi dependency lockfile alapján 11 npm audit találatot jelzett (1 low, 10 high); automatikus `npm audit fix` nem futott, mert az külön dependency-hardening feladat és nem keverhető kockázat nélkül az M1 UI release-be.

## Ismert, M1-et nem blokkoló utómunka

- DROP Hetzner böngészős `OPTIONS` preflight 403 továbbra is külön ismert tétel; presigned PUT működik és az M1 nem módosította ezt a réteget.
- dependency audit/hardening külön fejlesztési körben kezelendő.

## M1 lezárási állapot

Az M1 shell / login / protective screen / navigáció fejlesztési céljai teljesültek, DEV-en aktívak és a release-gate szerint elfogadottak. Az M0 rollback állapot szándékosan megmarad a DEV VPS-en.

Következő terv szerinti fázis: BENJADMIN B3 M2 – Development Center + PostgreSQL task/session engine, központi session/task/worker/lock modell és párhuzamos AI fejlesztési munkafolyamat alapozása.
