# BENJADMIN V1.3 – PWA push-feliratkozás hardening és eszközállapot DEV aktiválás

Dátum: 2026-08-16
Állapot: DEV ACTIVE / PASS
PROD: `READ_ONLY`, változatlan.

## Cél

A push/ETA háttérréteg és a task deep-link után a következő lépés a valós telefon/PWA eszköz egyszerű és biztonságos feliratkoztatásának előkészítése volt.

## Elkészült funkciók

### Release-független push subscription store

A push subscription adattár most a közös `DIMPRO_PROJECT_ROOT` projektgyökeret használja, ugyanazon elv szerint, mint a Dev Center fő store.

Tartós útvonal:

`.data/dimpro-dev-center/push-subscriptions.json`

Ez megakadályozza, hogy egy Next release-váltás az aktív telefonos push-feliratkozásokat elveszítse.

### PWA eszközállapot

A BENJADMIN Telepítés / Értesítések panel külön jelzi:

- PWA/böngésző állapot;
- PushManager + Service Worker támogatás;
- böngésző értesítési engedély;
- ezen az eszközön van-e aktív subscription;
- a BENJADMIN push szerver VAPID konfigurációja kész-e;
- szerveren regisztrált push-eszközök száma;
- utolsó állapotellenőrzés időpontja.

Külön `Állapot frissítése` gomb került a panelre.

### Engedélyezési UX

Ha a böngészőben az értesítés tiltott, a panel nem próbál újra vakon feliratkozni, hanem egyértelműen jelzi, hogy a webhely értesítési jogosultságát kell engedélyezni.

Állapotüzenetek:

- `KÉSZ`: az eszköz aktív subscriptionnel rendelkezik;
- `TEENDŐ`: push engedélyezése szükséges;
- `ELLENŐRZÉS SZÜKSÉGES`: támogatási vagy szerverkonfigurációs hiány.

### Task push teszt

A korábbi általános Push teszt helyett a panel most `Task push teszt` műveletet használ.

A teszt:

1. lekéri a BENJADMIN élő tasklistát;
2. kiválaszt egy valós taskot;
3. a tesztpush URL-jét erre állítja:
   `/admin/dev-console?task=<taskId>`;
4. értesítésre kattintáskor a már elkészült deep-link motor a konkrét feladatot nyitja meg.

A szerveroldali teszt endpoint a `targetTaskId` és `targetUrl` értéket is visszaadja acceptance célra.

## Biztonsági szabályok

- VAPID privát kulcs nem kerül kliensre;
- a kliens csak a publikus VAPID kulcsot kapja;
- subscription endpoint és kulcsok csak hitelesített DEV route-on rögzíthetők;
- PROD továbbra is `READ_ONLY`;
- natív AI provider/executor nem került bevezetésre.

## Acceptance

- PWA subscription contract: `26/26 PASS`
- persistent subscription runtime: `13/13 PASS`
- PWA browser desktop/mobile: `11/11 PASS`
- task deep-link browser: `12/12 PASS`
- push/ETA runtime regresszió: `17/17 PASS`
- live ETA browser: `9/9 PASS`
- next-chain runtime: `12/12 PASS`
- Plus-only V1.2 runtime: `29/29 PASS`
- teljes BENJADMIN Konzol: `40/40 PASS`
- TypeScript: PASS
- lint: `0 error / 103 meglévő warning`
- Next build: PASS
- static chunks: `245 PASS`
- Identity: `0.2.1 READY`
- trusted baseline readiness: `7/7 PASS`
- PM2 operator: online, unstable restart 0
- ETA monitor: online, `etaAlerts.ok:true`

## Final release

Aktív pointer:

`.next-benjadmin-v13-pwa-subscription-final`

Build:

`BDgezeB9qEAmoq06oP0Ku`

Release source:

- branch: `feat/benjadmin-operator-ui-v2`
- commit: `400e7de8ac8316f6e1e3ceaf02c5ec92dc6f7578`

Trusted baseline:

- `refs/heads/integration/benjadmin-dev`
- `400e7de8ac8316f6e1e3ceaf02c5ec92dc6f7578`

Védett final source ref:

`refs/heads/backup/benjadmin-v13-pwa-subscription-final-active-20260816`

Cutover artifact:

`/srv/dimpro-dev/artifacts/benjadmin-v13-pwa-subscription-cutover-20260816_202239`

## Rollback

Közvetlen rollback:

`.next-benjadmin-v13-push-deeplink-final-operator`

- build: `WEUYIqSaVPyEtViDaWb2X`
- source: `90d85b40bbeefb22f1c3c9c470e2e8662b998f0f`
- Identity V0.2.1 kompatibilis;
- push/ETA + task deep-link működik;
- új tartós subscription-store és PWA eszközállapot UX nincs benne.

## Jelenlegi valós push helyzet

DEV subscription count: `0`.

A szerveroldali rendszer és a PWA felület kész. Az első valós telefonos E2E-hez a felhasználónak a BENJADMIN PWA Telepítés panelen egyszer meg kell nyomnia a `Push engedélyezése` gombot és jóvá kell hagynia a böngésző értesítési engedélyét.

Utána a `Task push teszt` gombbal közvetlenül ellenőrizhető a teljes lánc:

push küldés → rendszerértesítés → kattintás → konkrét task → automatikus projektváltás → task fókusz.

## Következő fejlesztési irány

A DEV lemezhasználat továbbra is magas, ezért következő szerveroldali prioritás:

**BENJADMIN release retention / automatikus biztonságos artifact- és worktree-karbantartás.**
