# DIMPRO Drive Desktop Windows Script V0.1.5 – exact Apply contract

Állapot: source candidate · DEV ONLY · PROD DENY.

## Exact ProjectGate Drive Core API

Upload init:
- `POST /api/projects/[projectId]/drive/uploads/init`
- új dokumentum: `folderId` kötelező;
- új verzió: `documentId`, opcionálisan `expectedCurrentVersion`;
- kliens küldi: `originalName`, `documentName`, `sizeBytes`, `mimeType`, `sha256`, `source=DESKTOP`;
- válasz: `upload.id`, `signedUpload.method/url/headers`, `completeUrl`, `abortUrl`.

Upload transfer:
- kizárólag HTTPS signed PUT;
- complete POST body nélkül;
- szerveroldali méret + SHA-256 visszaellenőrzés;
- kliens a complete response SHA-256 értékét is összeveti a helyi hash-sel;
- transfer/complete hiba esetén abort endpoint best-effort meghívása.

Download:
- `POST /api/projects/[projectId]/drive/documents/[documentId]/download`;
- opcionális `versionId`;
- signed HTTPS GET;
- célmappán belüli `.dimpro-part-*` ideiglenes fájl;
- opcionális SHA-256 ellenőrzés;
- szerver által jelzett méret ellenőrzése;
- meglévő célfájl nincs automatikusan felülírva;
- siker után `IO.File.Move` véglegesítés.

Cursor:
- `POST /api/projects/[projectId]/drive/sync/cursor`;
- `clientId`, `machineName`, `cursorValue`, `metadata`;
- csak minden Apply művelet sikeres lefutása után menthető.

## Apply safety gates

Kötelező:
- `-Mode Apply`;
- `-EnableApply`;
- `-AllowServerMutation`;
- `-AllowLocalMutation`;
- schemaVersion=1 Apply tervfájl;
- Project Drive health PASS;
- storage database ready;
- storage configured;
- upload esetén `realObjectWriteEnabled=true`;
- download esetén `realObjectDownloadEnabled=true`.

Törlési művelet V0.1.5-ben nincs.

## Auth

Alapértelmezett mód: `Bridge`.
A Windows kliens a DPAPI-val védett BENJADMIN Bridge device tokenből kér rövid életű `desktop-access` Bearer tokent. A Project Core ezt a meglévő auth láncon keresztül értelmezi, majd a normál projekt ACL ellenőrzés továbbra is kötelező.

## Ellenőrzések

- Drive Desktop access token contract: 11/11 PASS.
- Windows V0.1.5 exact Apply contract: 22/22 PASS.
- módosított szerver TypeScript források célzott transzpilációja: PASS.
- git diff --check: PASS.
- fizikai Windows PowerShell 5.1 acceptance: következő kapu.

PROD: DENY.

## V0.1.5 FIX1 physical Windows PowerShell 5.1 acceptance – PASS

Runtime: Windows PowerShell `5.1.22621.6133`

Result:
- `POWERSHELL_PARSE_PASS`
- main script SHA-256: `c291d582dfccb45ed91176b721db47430bfa71a6661a6c136cef24e7f751b623`
- `STATIC_GUARD_PASS`
- `EXACT_APPLY_CONTRACT_PASS`
- `DELETE_OPERATION_DENY_PASS`
- `PROBE_SKIPPED`
- `DIMPRO_DRIVE_DESKTOP_V015_FIX1_WINDOWS_ACCEPTANCE_PASS`

FIX1 source commit: `2d64728d85cde30e7cabda4031480d8b31a2ea2b`.

## V0.1.5 FIX1 + Drive V0.9.1 integration status

Integration base: `93c6c9eb140ec2b90de825e649552cbf96613cda` (`feat(drive): add premium boot loader`).

Integrated branch: `worker/benjaminai/drive-desktop-v015-fix1-20261003`.

Integrated source before secret hardening: `71c3cec2ea758436ebb019de17c6290f1f8696a5`.

Root-only secret-file hardening source: `100e89256554a85df5974fd921a05c57663b4ccd`.

Validation:
- Drive Desktop access contract: 12/12 PASS.
- Windows V0.1.5 exact Apply contract: 23/23 PASS.
- changed server TypeScript targeted transpile: PASS.
- physical Windows PowerShell 5.1 acceptance: PASS.
- Drive Core expected schema after integration: 0.9.1.

Remote build:
- run: `drive-desktop-v015-v091-secretfile-100e8925-001`
- runner: `build01`
- Build ID: `LpFVxzyzZnLZ30r6wQyZc`
- artifact SHA-256: `b392414c0b203e75145af611797a1a6f0bccaa103e0b20149ae6a240fc6961ce`
- status: PASS
- production access: DENY

DEV runtime notes:
- public Drive DEV remains on port 3317 / source `e4fd167e2f235c999eb5ec5ed4a66d9c98afb871`.
- obsolete pre-V0.9.1 Desktop candidate on port 3318 was stopped, not deleted.
- port 3319 is occupied by an unrelated newer Drive V0.9.1 candidate (`93c6c9eb140e`).
- intended next isolated Desktop candidate port: 3320.
- release `100e89256554` prepared on DEV host.
- candidate start is blocked in this execution channel because root-only `.env.local` runtime secrets cannot be sourced by the remote execution safety gate. No nginx cutover performed.

## V0.1.5 FIX1 + Drive V0.9.3 DEV cutover – PASS

Latest authoritative Drive base merged: `d1b367bc83812b037ab403d602d9a206a60cbf8f` (`feat(drive): hold ready loader and add wordmark`).

Integrated source: `403627e061fffc6db9294169dec1bf3c46ffe071`.

Validation after merge:
- Drive V0.9.2 Premium Loader contract: 14/14 PASS.
- Drive V0.9.3 Completion Hold + Wordmark contract: 16/16 PASS.
- Desktop access contract: 12/12 PASS.
- Windows V0.1.5 exact Apply contract: 23/23 PASS.
- Drive Core schema: 0.9.1.

Remote build:
- run: `drive-desktop-v015-v093-403627e0-001`
- runner: `build01`
- Build ID: `Xc9dkxVcu8E2M-aSBPXuB`
- artifact SHA-256: `580efc88bb76a243a001f5977ef836a65ee7f10d7ab6857528124ec2d4876fb6`
- status: PASS
- production access: DENY

DEV candidate runtime:
- release: `/srv/dimpro-dev/candidates/drive-pilot/releases/403627e061ff`
- PM2: `dimpro-drive-pilot-v015-v093-403627e0-p3322`
- port: 3322
- restart count at cutover: 0
- localhost login: 200
- authenticated desktop contract: PASS
- project list: PASS
- database ready: true
- expected/actual Drive Core schema: 0.9.1 / 0.9.1
- object storage configured: true
- real object write: true
- real object download: true
- activationSafe: true

DEV nginx cutover:
- `drive.dev.dimpro.hu` upstream: 3320 -> 3322
- public candidate header: `403627e0 DEV`
- `X-DIMPRO-Production-Access: DENY`
- nginx config test: PASS
- rollback runtime retained online: `dimpro-drive-pilot-v093-readyhold-wordmark-d1b367bc` on port 3320
- rollback nginx backup: `/etc/nginx/dimpro-backups/dimpro-dev.conf.before-drive-v015-v093-403627e0-20261003T164638Z`
- PM2 state saved after cutover.

Public HTTPS smoke after cutover:
- `/drive`: redirect to `/login` as expected.
- desktop contract: PASS.
- `desktop-access` mode advertised: true.
- project count: 2.
- health: PASS.
- database ready: true.
- schema match: true.
- storage configured: true.
- real upload/download: true / true.
- activationSafe: true.

Next physical gate: Windows PowerShell 5.1 Bridge-backed `-RunProbe` from the approved V0.1.5 FIX1 package. Apply remains blocked until physical Probe PASS.
