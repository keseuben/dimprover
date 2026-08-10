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
