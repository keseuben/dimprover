# 221 — BENJADMIN Windows Desktop Bridge P8.1 · secure pairing candidate

Dátum: 2026-08-14
Branch: `feat/benjadmin-windows-bridge-p81`
Baseline: `6d91c24`
Állapot: KÓD CANDIDATE KÉSZ · DB migráció NINCS alkalmazva · live Bridge/Pairing/Execution OFF.

## P8.1 cél
A Windows Desktop Bridge helyi agent identity, egyszer használatos pairing, emberi device-jóváhagyás, device-token kezelés, revoke, heartbeat és audit biztonsági rétege elkészült. PowerShell parancsvégrehajtás továbbra sincs.

## Pairing és tokenbiztonság
- pairing kód: 10 karakter, 5-5 tagolás;
- pairing élettartam: max. 600 s;
- hibás próbálkozás: max. 5;
- pairing kód DB-ben csak HMAC-SHA256;
- HMAC secret minimum 32 karakter és külön szerveroldali secret;
- claim token DB-ben csak SHA-256 hash;
- device token DB-ben csak SHA-256 hash;
- nyers device token csak egyszer, aktiváláskor adható vissza az agentnek;
- revoke azonnal nullázza a token hash-t és lezárja az aktív sessiont;
- heartbeat csak aktív device token + aktív session mellett fogadható;
- heartbeat `commands: []`, P8.1-ben nincs végrehajtási csatorna.

## Adatmodell
Előkészített, de még NEM alkalmazott migráció:
`supabase/migrations/20260814230000_benjadmin_windows_bridge_p81.sql`

SHA-256 sidecar:
`supabase/migrations/20260814230000_benjadmin_windows_bridge_p81.sql.sha256`

Rollback:
`supabase/rollback/20260814230000_benjadmin_windows_bridge_p81_rollback.sql`

Táblák:
- `dev_center_windows_bridge_devices`;
- `dev_center_windows_bridge_pairings`;
- `dev_center_windows_bridge_sessions`.

Mindhárom RLS-es, anon/authenticated hozzáférés visszavonva, service-role backend-only. Egy device-hoz legfeljebb egy aktív session tartozhat. Az aktiválás tranzakciós, `FOR UPDATE`-os security-definer DB functionnel készül.

## API
Admin-only:
- `GET /api/dev/terminal-hub/windows-bridge/devices`;
- `POST /api/dev/terminal-hub/windows-bridge/pairings`;
- `POST /api/dev/terminal-hub/windows-bridge/devices/[deviceId]/approve`;
- `POST /api/dev/terminal-hub/windows-bridge/devices/[deviceId]/revoke`.

Agent-facing:
- `POST /api/dev/terminal-hub/windows-bridge/claim`;
- `GET /api/dev/terminal-hub/windows-bridge/claim/status?pairingId=...` Bearer claim tokennel;
- `POST /api/dev/terminal-hub/windows-bridge/heartbeat` Bearer device tokennel.

Nincs `command` vagy `execute` route.

## Windows agent
Fájl: `scripts/benjadmin-windows-bridge-agent-p81.ps1`

Módok:
- `Pair`;
- `Heartbeat`;
- `Once`.

Biztonsági szabályok:
- kizárólag HTTPS;
- identity: `%LOCALAPPDATA%\\DIMPRO\\BenjAdminBridge\\identity.json`;
- device token: DPAPI CurrentUser védelemmel;
- pairing kód nem kerül fájlba;
- nincs `Invoke-Expression`;
- nincs `Start-Process`, `powershell.exe`, `pwsh.exe` indítás;
- ha heartbeat parancsot adna vissza, az agent security violationnel leáll.

A Large DEV Linux VPS-en `pwsh` nincs telepítve, ezért a PowerShell agent tényleges parser/runtime tesztje Windows gépen szükséges a későbbi E2E gate-ben.

## BENJADMIN UI
A Terminal Hub P8 panel P8.1-re bővült:
- one-time pairing panel;
- visszaszámláló;
- pending device lista;
- kézi `Jóváhagyás`;
- aktív/jóváhagyott device `Visszavonás`;
- pairing kód csak React state-ben él, browser storage-ba nem kerül;
- pairing csak Bridge + Pairing + pairing-secret readiness mellett indítható.

## Acceptance
- P8 contract: **37/37 PASS**;
- P8.1 contract: **44/44 PASS**;
- teljes P2–P8.1 regresszió: **329/329 PASS**;
- TypeScript: PASS;
- célzott lint: PASS;
- teljes lint: **0 error / 104 meglévő warning**;
- candidate build: **`-FXCK_w3uoPWzBx8N7UMO` PASS**;
- pre-migration candidate `/admin/dev-console`: HTTP 200;
- Bridge OFF + admin pairing POST: HTTP 403 `WINDOWS_BRIDGE_PAIRING_DISABLED`;
- Bridge OFF + admin device GET: HTTP 403 `WINDOWS_BRIDGE_DISABLED`;
- headless browser: P8.1 panel PASS, pairing gomb disabled, execution OFF;
- browser console/page/network/external errors: **0/0/0/0**.

## DB migration gate — BLOKKOLT, biztonságosan
Az operator `.env.local` jelenleg nem tartalmazza a migrációhoz szükséges:
- `SUPABASE_DB_URL`;
- `SUPABASE_DB_PASSWORD`;
- `BENJADMIN_PROD_SUPABASE_URL`;
- `BENJADMIN_EXPECTED_SUPABASE_URL`.

Ezért nem bizonyítható a meglévő DB preflighttal a cél DEV adatbázis és PROD fizikai elkülönítése, így a migráció NEM futott le. Secure credential-forrás automatikus keresését a szervervédelmi réteg blokkolta; ezt nem kerültük meg.

A repository központi `DIMPRO_MIGRATION_ORDER_V1.txt` fájlja már P8.1 előtt is elmaradt a migrations könyvtártól (29 listaelem vs. 37 SQL a P8.1 hozzáadása után); ezt a külön történeti problémát P8.1 nem írja át mellékesen.

## Integrációs szabály
A P8.1 kód biztonságosan integrálható DEV-re úgy, hogy:
- `BENJADMIN_WINDOWS_BRIDGE_ENABLED=0`;
- `BENJADMIN_WINDOWS_BRIDGE_PAIRING_ENABLED=0`;
- `BENJADMIN_WINDOWS_BRIDGE_EXECUTION_ENABLED=0`.

Bridge OFF esetén a device lista és pairing API DB-hozzáférés előtt fail-closed. A DB migráció és valódi Windows pairing külön későbbi gate.

PROD nem módosult.
