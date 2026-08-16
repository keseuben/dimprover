# BENJADMIN V1.3 – Push task deep-link final DEV aktiválás / szünet előtti checkpoint

Dátum: 2026-08-16
Állapot: DEV ACTIVE / PASS
PROD: `READ_ONLY`, változatlan.

## Elkészült funkció

A BENJADMIN task push értesítések most konkrét task deep-linket használnak:

`/admin/dev-console?task=<taskId>`

Ez érvényes:

- ETA 15 percen belüli értesítésre;
- ETA lejárt értesítésre;
- sikeres task COMPLETE értesítésre;
- FAIL / blokkolt task értesítésre.

## Konzol oldali működés

Push értesítés megnyitásakor a Konzol:

1. kiolvassa a `task` query paramétert;
2. megkeresi a taskot az élő state-ben;
3. automatikusan kiválasztja a task projektjét;
4. a projektválasztást localStorage-ban is rögzíti;
5. a taskot akkor is visszaemeli a középső munkafelületre, ha már `completed`;
6. a fókuszált taskot a lista elejére rendezi;
7. automatikusan odagörget;
8. `Értesítésből megnyitva` jelzést és vizuális kiemelést ad;
9. mobilon és desktopon is overflow nélkül jeleníti meg.

Manuális projektváltáskor a deep-link fókusz és a `?task=` query paraméter törlődik.

A service worker meglévő `notificationclick` logikája már korábban is képes volt a push URL-re navigálni nyitott PWA-ablakban és új ablak esetén is; ezt a blokk új notification engine nélkül használja.

## Final release

Aktív pointer:

`.next-benjadmin-v13-push-deeplink-final-operator`

Build:

`WEUYIqSaVPyEtViDaWb2X`

Release source:

- branch: `feat/benjadmin-operator-ui-v2`
- commit: `90d85b40bbeefb22f1c3c9c470e2e8662b998f0f`

Trusted baseline:

- ref: `refs/heads/integration/benjadmin-dev`
- commit: `90d85b40bbeefb22f1c3c9c470e2e8662b998f0f`

Védett release source ref:

`refs/heads/backup/benjadmin-v13-push-deeplink-final-active-20260816`

Cutover artifact:

`/srv/dimpro-dev/artifacts/benjadmin-v13-push-deeplink-cutover-20260816_103349`

## Rollback

Közvetlen rollback release:

`.next-ben-push-project-identity-v100-final`

- build: `bmpSo999l5WI0ZAE3JqFG`
- source: `02e5074b7f0ac06b98b383783f45512b389e0576`
- Identity V0.2.1 kompatibilis;
- Push/ETA watcher működik;
- csak a task deep-link fókusz nincs benne.

## Acceptance

Deep-link blokk:

- source contract: `18/18 PASS`
- completed-task browser acceptance: `12/12 PASS`
- desktop deep-link: PASS
- mobil deep-link: PASS
- manuális fókusztörlés: PASS
- completed task visszaemelés: PASS
- automatikus projektváltás: PASS
- automatikus scroll: PASS

Meglévő regresszió:

- push/ETA contract: `21/21 PASS`
- push/ETA runtime: `17/17 PASS`
- live ETA browser: `9/9 PASS`
- next-chain runtime: `12/12 PASS`
- next-chain browser: `9/9 PASS`
- pull-feedback runtime: `16/16 PASS`
- Plus-only V1.2 runtime: `29/29 PASS`
- teljes BENJADMIN browser/responsive/PWA: `40/40 PASS`
- Identity runtime health: `ready:true`, version `0.2.1`, marker `0.2.1`
- trusted baseline readiness: `7/7 PASS`
- TypeScript: PASS
- lint: `0 error / 103 meglévő warning`
- final Next build: PASS
- 245 statikus chunk: PASS
- PM2 operator: online, unstable restart 0
- ETA monitor: online, `etaAlerts.ok:true`
- PROD: `READ_ONLY`

## Push-feliratkozás aktuális helyzete

A szerveroldali push és ETA háttérlogika kész, de a jelenlegi DEV push subscription count továbbra is `0`.

Ezért a következő fejlesztési/tesztelési kör első természetes lépése egy valós telefon vagy PWA eszköz egyszeri push-feliratkozása, majd end-to-end ellenőrzés:

- értesítés tényleges megérkezése;
- hang/rezgés;
- háttér/foreground viselkedés;
- értesítésre kattintás;
- konkrét task automatikus megnyitása és fókusza.

## Szünet utáni folytatási pont

Első prioritás:

**Valós mobil/PWA push subscription + notification-click E2E acceptance.**

Utána:

1. push hang/rezgés UX véglegesítés;
2. foreground/background értesítési viselkedés;
3. ETA alert napló megjelenítése a Konzolban;
4. release retention / automatikus tárhely-karbantartás;
5. további BENJADMIN V1.3 workflow-finomítások.

A natív AI provider/executor továbbra sincs konfigurálva. A jelenlegi Plus-only útvonal továbbra is a ChatGPT + MCP bridge-re épül, fail-closed natív executor mellett.
