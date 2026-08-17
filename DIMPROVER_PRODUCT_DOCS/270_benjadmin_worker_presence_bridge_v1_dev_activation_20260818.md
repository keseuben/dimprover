# 270 — BENJADMIN Worker Presence Bridge V1 — DEV aktiválás

Dátum: 2026-08-18  
Környezet: kizárólag DEV (`dimpro-dev`, `/srv/dimpro-dev`)  
PROD hozzáférés: `DENY`

## Cél

A BENJADMIN Közös fejlesztői csevegése akkor is automatikusan mutassa a tényleges AI worker aktivitását, ha a fejlesztés másik ChatGPT-csevegésből vagy közvetlen DEV VPS műveletből indul, és az adott csevegő nem ír külön kézi worker-activity eseményt.

## V1 bizonyítékforrások

A Worker Presence Bridge több, egymástól független DEV bizonyítékból dolgozik:

1. explicit worker lease (`claim` / `heartbeat` / `release`);
2. aktív fejlesztési task/session;
3. központi koordinált művelet (`build`, `release`, `restart`, `maintenance`) `workerCode` mezővel;
4. friss konfigurált fájlmódosítás;
5. friss commit és érintett fájlútvonal.

Az evidencia pontozott és fail-closed. Bizonytalan tulajdonos esetén a rendszer nem találgat.

## Worker-hozzárendelés

- `ARMINAI`: explicit Ármin owner / worker code;
- `JAZMINAI`: explicit Jázmin worker code, továbbá konfigurált `drop-*`, `field-capture-*`, `terep-*`, `terepi-*` fejlesztési ownerek;
- további támogatott kódok: `OUTMINAI`, `MFORGE`, `VGUARD`.

## Lease lifecycle

A `scripts/benjadmin-worker-presence.mjs` támogatja:

- `claim`;
- `heartbeat`;
- `release`.

A release nem törli nyomtalanul a lease-t: `RELEASED` marker marad, amely alapján a bridge a hozzá tartozó aktív presence sort azonnal `ENDED` állapotba teszi `LEASE_RELEASED` okkal. Minden presence rekord `productionAccess: DENY` jelölést kap.

## UI működés

A BENJADMIN élő API `workerPresence` állapotot ad a felületnek. A worker kártya automatikusan képes megjeleníteni:

- dolgozik / inaktív állapotot;
- aktuális munkafázist;
- 6 fokozatú fejlesztési állapotot;
- Főmodul / Modul / Almodul kontextust;
- aktuális munkarészt;
- AUTO eredetet.

A worker-váltás és a lezárás nem duplikálja korlátlanul az aktivitási sorokat: azonos presence key frissül, új kulcsnál az előző aktív sor lezáródik.

## DEV acceptance

Statikus Worker Presence contract:

- `27/27 PASS`.

Candidate build:

- source commit: `4975704eaf5baa440b6868a7973a004b7ed4beb5`;
- build ID: `4f2vcEN1qZQUMKk3Okpd3`;
- Next compile: PASS;
- TypeScript: PASS;
- statikus oldalak: `94/94`;
- standalone statikus chunk ellenőrzés: `248 PASS`;
- `/admin/dev-console`: HTTP 200;
- `/admin/dev-map`: HTTP 200;
- `/api/dev/console/live`: HTTP 200 hitelesítve;
- Terminal Hub secret-vault auth gate: HTTP 401 jogosultság nélkül.

Valós Jázmin cross-chat lifecycle E2E a végleges 3100-as DEV runtime-on:

1. explicit Jázmin lease létrejött;
2. a monitor automatikusan észlelte;
3. a live API Jázmint `active: true`, `inferredBy: explicit-lease` állapotban adta vissza;
4. kontextus: `BENJADMIN → Közös fejlesztői csevegés → Worker Presence`;
5. release után a lease `RELEASED` lett;
6. a következő monitor ciklusban `ended: 1`;
7. a live API ugyanazt a worker presence-t `active: false` állapotban adta vissza.

Eredmény: `PHASE1_FINAL_E2E=PASS`.

## DEV runtime

Aktív BENJADMIN release:

- `NEXT_DIST_DIR=.next-benjadmin-worker-presence-release-v1-4975704`;
- PM2: `dimpro-benjadmin-operator-ui-v2-dev` online;
- monitor: `dimpro-benjadmin-monitor-dev` online;
- monitor intervallum: 60 másodperc;
- PROD nem módosult.

## Build erőforrás-megfigyelés

A release build TypeScript fázisában a 4 GiB `MemoryHigh` soft limit memória-pressure throttlingot okozott. A futó DEV scope ideiglenesen 5 GiB `MemoryHigh` értéket kapott; ezután a TypeScript szabályosan befejeződött. A build után visszamaradt 509 MiB swap biztonságos DEV maintenance lock alatt kiürítésre került.

A közös build policy tartós finomhangolását külön fejlesztési checkpointban kell elvégezni; ez nem része a Worker Presence V1 funkcionális release-ének.

## Rollback

A V1 előtti kódállapothoz megmaradt backup ref, a release előtti runtime build könyvtárak pedig a DEV retention szabályai szerint védetten kezelhetők. Runtime rollbacknél a PM2 `NEXT_DIST_DIR` és az `active-next-release` pointer együtt állítandó vissza.
