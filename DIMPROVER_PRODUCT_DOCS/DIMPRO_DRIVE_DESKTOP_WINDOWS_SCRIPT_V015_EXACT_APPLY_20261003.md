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

## Physical Windows Bridge bootstrap gate

The first Bridge-backed `-RunProbe` reached the intended fail-closed gate on Windows PowerShell 5.1 because `%LOCALAPPDATA%\\DIMPRO\\BenjAdminBridge\\device-token.dpapi` did not exist yet.

This is not a Drive Desktop parser/runtime defect. The existing BENJADMIN Windows Bridge P8.1 enrollment flow is the authoritative bootstrap:
1. install verified P8.1 agent package;
2. create one-time pairing in `/admin/dev-console/chatgrid-pairing`;
3. run `PAIR.ps1` with PairingId + PairingCode;
4. approve the pending device in the BENJADMIN UI;
5. agent stores the one-time device token with Windows DPAPI CurrentUser protection;
6. run one heartbeat;
7. rerun Drive Desktop V0.1.5 FIX1 `-RunProbe -AuthMode Bridge`.

Bridge readiness verified on DEV:
- foundationReady=true;
- bridgeEnabled=true;
- pairingEnabled=true;
- pairing secret configured=true;
- one-time pairing lifetime=600 seconds;
- outbound HTTPS only;
- no inbound port;
- executionEnabled=false;
- PROD execution denied.

P8.1 package contracts: 44/44 PASS + hardening 30/30 PASS.
Windows ZIP SHA-256: `ec8015c0d848a8dc28b8751ef70fcfddd30402c7b1a673f33fe7c821c3d831ec`.

## V0.1.5 FIX4 physical Windows Bridge Probe – PASS

Windows PowerShell: `5.1.22621.6133`

Main script SHA-256: `140dbc669f5915497d32ce3c0d91cbbe5e77f7f3ff0e1219a1cb7c77d197eb43`

Physical results:
- `POWERSHELL_PARSE_PASS`
- `STATIC_GUARD_PASS`
- `EXACT_APPLY_CONTRACT_PASS`
- `DELETE_OPERATION_DENY_PASS`
- Bridge device identity present: true
- Bridge DPAPI token present: true
- Bridge heartbeat: PASS
- live Bridge-backed desktop access token exchange: PASS
- live read-only Probe: PASS
- project count: 2
- applyReadiness.ready: true
- serverMutation: false
- localMutation: false
- delete: false
- `PROBE_PASS`
- `DIMPRO_DRIVE_DESKTOP_V015_FIX4_WINDOWS_ACCEPTANCE_PASS`

Latest Drive UI source merged after Probe hardening: `19456f260089520f95dc1184a3fc92b2fcefa80f` (V0.9.6 loader polish).
Integrated merge HEAD: `5a52865de233a6c955ab340e92a96c0caed1c9fd`.
V0.9.2 through V0.9.6 UI contracts: PASS.
Desktop access contract: 12/12 PASS.
Desktop Windows V0.1.5 contract: 29/29 PASS.

Next gate: controlled DEV `UPLOAD_NEW -> DOWNLOAD` acceptance using a dedicated test file. No delete operation is allowed.

## V0.1.5 FIX4 physical Windows Apply Acceptance – PASS

Executed on physical Windows PowerShell `5.1.22621.6133` against `https://drive.dev.dimpro.hu` using Bridge auth.

Acceptance result:
- code: `DIMPRO_DRIVE_DESKTOP_V015_APPLY_ACCEPTANCE_PASS`
- project: `d6-irodaepulet`
- folder: `drive-folder-03148ec117a64388d88a` (`99_Archivum`)
- document: `drive-document-cde50a0b770f`
- version: `drive-version-dad16b7f2b7d`
- source SHA-256: `4455993068b7beef4ae7ab2b1a4aa7165b4a914f7fdf1d11926b992485137f52`
- download SHA-256: `4455993068b7beef4ae7ab2b1a4aa7165b4a914f7fdf1d11926b992485137f52`
- serverMutation: true
- localMutation: true
- delete: false

Server-side read-back verification:
- document source: `DESKTOP`
- currentVersionNumber: 1
- object storage provider: `S3`
- version size: 206 bytes
- stored SHA-256 matches the physical Windows source/download SHA-256
- version status after complete: `QUARANTINED`
- normalized revision code: `R00`
- createdBy: `drive-desktop-desktop-a0b5dm2`

Observed non-blocking defect:
- UTF-8 text supplied in `description` is rendered with replacement characters in the server-side document details (`tesztf�jl`, `t�rl�s`, etc.). Binary/file integrity is unaffected; metadata request/response encoding needs a dedicated fix before general desktop release.

Next acceptance gate should be controlled `UPLOAD_VERSION` on the same dedicated DEV acceptance document, followed by exact-version download and SHA-256 verification. This must remain DEV-only and requires a new explicit mutation confirmation.

## V0.1.6 FIX2 physical Windows version acceptance – PASS

Executed on physical Windows PowerShell `5.1.22621.6133` against `https://drive.dev.dimpro.hu` using Bridge auth.

Static acceptance:
- `POWERSHELL_PARSE_PASS`
- `STATIC_GUARD_PASS`
- `EXACT_APPLY_CONTRACT_PASS`
- `DELETE_OPERATION_DENY_PASS`
- `DIMPRO_DRIVE_DESKTOP_V016_WINDOWS_ACCEPTANCE_PASS`

Live Bridge Probe:
- `PROBE_PASS`
- project count: 2
- applyReadiness.ready: true
- serverMutation: false
- localMutation: false
- delete: false

Controlled `UPLOAD_VERSION -> exact DOWNLOAD` acceptance:
- code: `DIMPRO_DRIVE_DESKTOP_V016_VERSION_ACCEPTANCE_PASS`
- project: `d6-irodaepulet`
- document: `drive-document-cde50a0b770f`
- previousVersionNumber: 1
- expectedNewVersionNumber: 2
- created versionId: `drive-version-4fa294b0ff13`
- UTF-8 changeNote: `V0.1.6 UTF-8 ellenőrzés – Árvíztűrő tükörfúrógép, őűŐŰ`
- source SHA-256: `ed9849ac8c25e25614af05c29146833008d8af98ca49d3518fc99c3cc0175150`
- download SHA-256: `ed9849ac8c25e25614af05c29146833008d8af98ca49d3518fc99c3cc0175150`
- serverMutation: true
- localMutation: true
- delete: false

Conclusion:
- Windows PowerShell 5.1 request-side UTF-8 JSON byte handling: PASS.
- Bridge -> Desktop short-lived token exchange: PASS.
- AUTH V0.3.3 Desktop own-auth transport: PASS.
- `UPLOAD_VERSION` optimistic version flow: PASS.
- exact returned-version download: PASS.
- byte integrity by SHA-256: PASS.
- no delete operation used.

## V0.1.6 FIX3 physical Windows UTF-8 response acceptance – PASS

FIX3 source commit: `6a0e85942f37e6ad2d09981ec20444df18480dc8`.

Physical Windows package main script SHA-256: `43d30fda66cb2c7f9b7766217087166f291865cf89d3897f2a70cc06965ce7fd`.

Static acceptance:
- `POWERSHELL_PARSE_PASS`
- `STATIC_GUARD_PASS`
- `EXACT_APPLY_CONTRACT_PASS`
- `DELETE_OPERATION_DENY_PASS`
- `DIMPRO_DRIVE_DESKTOP_V016_FIX3_WINDOWS_ACCEPTANCE_PASS`
- `DIMPRO_DRIVE_DESKTOP_V016_WINDOWS_ACCEPTANCE_PASS`

Read-only live Probe:
- `PROBE_PASS`
- project count: 2
- applyReadiness.ready: true
- serverMutation: false
- localMutation: false
- delete: false

UTF-8 response decoding verified on physical Windows PowerShell 5.1. Previously mojibake-rendered values now render correctly:
- `Szekszárd Zrt és Szajki Zrt - szarvasmarhatelep`
- `Előkészítés`
- `D6 Irodaépület`
- `Koncepciós DIMPRO Projektkapu munkakörnyezet a D6 Core modulok fejlesztéséhez.`
- `Tervezés és előkészítés`

FIX3 transport rule:
- JSON API response: `Invoke-WebRequest -UseBasicParsing -> RawContentStream -> strict UTF-8 -> ConvertFrom-Json`.
- JSON API response decoding no longer relies on Windows PowerShell 5.1 `Invoke-RestMethod` automatic charset behavior.
- signed binary upload/download paths remain unchanged.

FIX3 contracts:
- Windows V0.1.6 contract: 37/37 PASS.
- V0.1.6 version acceptance contract: 17/17 PASS.
- Desktop access contract: 15/15 PASS.
- AUTH V0.3.3 session-policy contract: 15/15 PASS.

V0.1.6 final acceptance status:
- static Windows PowerShell 5.1: PASS
- Bridge live Probe: PASS
- request UTF-8: PASS
- response UTF-8: PASS
- upload new: PASS (V0.1.5 baseline)
- upload version: PASS
- exact version download: PASS
- SHA-256 integrity: PASS
- delete: DENY / unused
- PROD access: DENY

Next development level: real manual Desktop synchronization workflow built on `Probe -> Plan -> reviewed Apply`, while retaining fail-closed mutation gates and no-delete policy.


## V0.1.7 Phase 2 FIX2 – Desktop security-scan auth transport correction

Physical Windows evidence on 2026-10-04:
- V0.1.7 Phase 2 FIX2 static Windows acceptance: PASS.
- Bridge-backed live Probe: PASS.
- reviewed `ScanPlan` reached the Drive host but was rejected by the central proxy with `AUTH_REQUIRED`.

Root cause:
- the short-lived `dpat1` Desktop bearer was valid and accepted by the Drive API auth layer, but `proxy.ts` Desktop own-auth route allowlist did not include the exact version security-scan endpoint;
- the request therefore never reached the route-level `document.read` / `document.approve` authorization.

Correction:
- allow exact Desktop bearer transport for `/api/projects/{projectId}/drive/documents/{documentId}/versions/{versionId}/security-scan`;
- this is transport-only: the route still independently enforces Project Core permissions;
- no generic `/api/projects/*` bypass was added;
- no cookie/session check was weakened for browser traffic;
- PROD remains DENY for this DEV acceptance workflow.

Acceptance requirement after deployment:
1. existing Bridge Probe remains PASS;
2. reviewed security scan returns 5/5 `CLEAN` with exact SHA-256 matches;
3. only then may restart-safe DOWNLOAD Apply continue.


## V0.1.7 Phase 2 FIX2 – DEV deployment evidence 2026-10-05

Integrated source after the current Drive V0.9.13 / AUTH V0.4.4 SSO HOSTFIX line was merged:
- source commit: `01fd976ace0b828e74ec085c8f368287465079ac`;
- source branch: `worker/benjaminai/drive-desktop-v015-fix1-20261003`;
- BUILD-01 run: `drive-v017-scan-auth-01fd976a-20261005-b1`;
- build ID: `CXb0i535hLDf8T9B7R2Oa`;
- artifact SHA-256: `97b20435a0a0ff1a8a4774642d59715c1da1c4c94ce22193525bdd3e2f991460`;
- BUILD-01 result: PASS;
- Next production build and TypeScript phase completed successfully.

DEV deployment:
- release: `/srv/dimpro-dev/candidates/drive-pilot/releases/01fd976ace0b`;
- runtime: `/srv/dimpro-dev/runtime/drive-v0913-auth044-scanfix-01fd976a`;
- PM2 candidate: `dimpro-drive-v0913-auth044-scanfix-01fd976a-p3372`;
- candidate port: `3372`;
- previous public rollback candidate: `09d5856f / 3371`, intentionally kept online;
- nginx backup before cutover: `/srv/dimpro-dev/coordination/backups/dimpro-dev.conf.before-drive-scanfix-20261005T203345`;
- public `drive.dev.dimpro.hu` upstream changed from `3371` to `3372`;
- nginx config test: PASS;
- nginx reload: PASS;
- PM2 state saved after successful cutover.

Public smoke after cutover:
- `/drive` -> `307` central SSO redirect;
- redirect target -> `/api/dimpro-auth/start?return_to=%2Fdrive`;
- central authorize callback resolves to `https://drive.dev.dimpro.hu/api/dimpro-auth/callback`;
- cache policy remains `no-store`;
- unauthenticated Drive health remains `401 AUTH_REQUIRED`;
- public candidate header: `01fd976a DRIVE V0.9.13 AUTH V0.4.4 SSO HOSTFIX + DESKTOP SCAN AUTH DEV`;
- `X-DIMPRO-Production-Access: DENY`;
- candidate PM2 status: online, zero restarts at cutover smoke;
- rollback candidate `09d5856f / 3371`: online, zero restarts.

Remaining physical acceptance gate:
1. rerun Windows Bridge-backed V0.1.7 security scan acceptance against the same reviewed plan;
2. require `scanCount = 5` and `cleanCount = 5` with exact SHA-256 matches;
3. only after that PASS, run the restart-safe DOWNLOAD Apply acceptance.


## V0.1.7 Phase 2 FIX2 – FINAL physical Windows acceptance PASS 2026-10-06

Physical Windows PowerShell `5.1.22621.6133` acceptance completed against `https://drive.dev.dimpro.hu` using Bridge auth and the already reviewed immutable plan.

Reviewed plan binding:
- project: `d6-irodaepulet`;
- reviewed plan SHA-256: `d5533020951ba11d2a345d873bc9246f7a63a5c072c077f97f65a3311023000a`;
- reviewed download operation count: 5.

Security scan acceptance completed first:
- code: `DIMPRO_DRIVE_DESKTOP_V017_SECURITY_SCAN_ACCEPTANCE_PASS`;
- scanCount: 5;
- cleanCount: 5;
- scannerReady: true;
- scanner engine: ClamAV `1.5.4`;
- signature version: `28144`;
- documentContentMutation: false;
- localMutation: false;
- delete: false.

Restart-safe DOWNLOAD Apply acceptance:
- code: `DIMPRO_DRIVE_DESKTOP_V017_DOWNLOAD_APPLY_ACCEPTANCE_PASS`;
- downloadCount: 5;
- newlyDownloadedCount: 3;
- alreadyPresentVerifiedCount: 2;
- cursorSaved: true;
- documentMutation: false;
- localMutation: true;
- delete: false;
- result path: `C:\\Users\\admin\\AppData\\Local\\Temp\\DIMPRO-Drive-V017-Download-Apply-Acceptance\\apply-result-20261006T154122Z.json`.

This physically proves:
- the reviewed plan SHA binding survives end-to-end;
- all 5 remote versions passed server-side malware scanning before download;
- already present local files are SHA-256 verified and reused instead of overwritten;
- 3 missing files were downloaded successfully;
- restart/resume behavior is safe and deterministic;
- cursor persistence completes successfully;
- no delete operation is used;
- no server-side document content mutation occurs.

V0.1.7 Phase 2 FIX2 DEV acceptance is therefore functionally CLOSED.

Non-blocking terminology cleanup for a later patch:
- the acceptance result currently reports `serverMutation: "ACCEPTANCE_CURSOR_ONLY"`;
- this label is narrower than the complete transport behavior because download-init can create audit/download metadata while document content remains immutable;
- recommended future label: `DOWNLOAD_AUDIT_AND_ACCEPTANCE_CURSOR`;
- this is a reporting/contract wording cleanup only and does not invalidate the physical PASS.

## V0.1.8 – Windows Open Handler / partial workfiles architecture

V0.1.8 deliberately separates **Windows file opening** from future **Drive Desktop Sync**.

### Product rule

`Megnyitás Windowsban` must NOT mirror the complete DIMPRO Drive project tree and must NOT imply that a project is synchronized locally.

The user selects one **Helyi munkafájlok** root. Only documents explicitly opened from Drive are written below that root. V0.1.8 may use one shallow per-project bucket for collision avoidance and readability, for example:

`<user root>\D6-001 D6 Irodaépület - DIMPRO MUNKAFÁJLOK\G-101_....dwg`

No remote subfolder hierarchy is reproduced. Empty Drive folders are never created locally by the Open Handler. Full or selective Drive folder synchronization remains a separate future `DIMPRO Drive Desktop Sync` feature.

### Web-to-Windows flow

1. Browser user chooses `Megnyitás Windowsban` for a readable document version.
2. Web API requires `document.read`, an exact version with a valid SHA-256 identity, and issues a 90-second opaque `dimpro-drive` open ticket.
3. Only the SHA-256 hash of the ticket is stored server-side.
4. Browser invokes `dimpro-drive://open-file?ticket=...`; no server URL is carried in the custom URI.
5. The Windows handler reads the already paired Bridge token from DPAPI storage and exchanges it for the short-lived Drive Desktop `dpat1` token.
6. `/api/drive/desktop-open/redeem` accepts only `desktop-access` auth, atomically consumes the ticket, rechecks project `document.read`, preserves the server-issued web actor for download audit, and uses the normal Drive download initializer. V0.1.8 DEV does **not** claim canonical user binding for `dpat1`; that requires the future Bridge device ↔ DIMPRO user ownership layer.
7. The normal download initializer keeps the existing security-scan gate and returns a short-lived signed GET URL plus exact file SHA-256 and size.
8. The Windows handler writes only into the configured workfiles root, verifies size and SHA-256, updates a local workfile index, and launches the file through the Windows default file association.

### Local workfile safety

- Workfiles are **not automatically deleted**.
- The index explicitly records `PARTIAL_WORKFILES_NOT_SYNC` semantics.
- The local index keeps **two hashes**: `baseServerSha256` = the last server hash actually downloaded/accepted as the local baseline, and `remoteSha256` = the latest server hash observed during the current open.
- If the local file hash still equals `baseServerSha256` and the server has a newer version, V0.1.8 may safely refresh the local file and advance the baseline.
- If the local file is modified, `baseServerSha256` is preserved even when `remoteSha256` changes, so the original editing baseline is not lost.
- If the local file hash differs from the previously downloaded server hash, the state becomes `LOCAL_MODIFIED`; the handler opens the local file and does **not** overwrite it.
- If both the local file and server version changed, the handler warns that conflict handling is required before any later upload/sync action.
- New downloads are written to a temporary sibling file, size/SHA-256 verified, and only then moved into the final path.
- Unknown filename collisions do not overwrite existing files; a document-id suffix is used.

### Protocol and trust boundary

- URI scheme: `dimpro-drive`.
- Registration is per-user under `HKCU:\Software\Classes\dimpro-drive`; no administrator rights are required.
- The URI may contain only the opaque open ticket. URI-provided server override is denied.
- V0.1.8 DEV handler accepts only `https://drive.dev.dimpro.hu`; arbitrary HTTPS hosts are rejected so the Bridge token cannot be redirected to another service.
- Existing BENJADMIN Windows Bridge heartbeat behavior remains unchanged: no remote terminal command execution is enabled and no inbound port is opened.
- **DEV limitation:** the current `dpat1` token contains device/agent/client identity but no canonical DIMPRO user claim. DEV alias compatibility allows the present single-user physical acceptance flow, but this must not be treated as final multi-user identity binding. Before production or general multi-user rollout, the Bridge device must be explicitly bound to a canonical DIMPRO user and that user identity must be carried/verified by the Desktop access token or equivalent server-side device ownership mapping.
- PROD remains DENY.

### Implementation files

- `app/lib/drive/openTicketStore.ts`
- `app/api/projects/[projectId]/drive/documents/[documentId]/open-ticket/route.ts`
- `app/api/drive/desktop-open/redeem/route.ts`
- `scripts/dimpro-drive-desktop-open-handler-v018.ps1`
- `scripts/dimpro-drive-desktop-open-handler-manager-v018.ps1`
- `scripts/dimpro-drive-desktop-v018-windows-acceptance.ps1`
- `scripts/drive-desktop-open-v018-contract.mjs`
- `scripts/drive-desktop-open-v018-windows-acceptance-contract.mjs`

### Static acceptance at implementation checkpoint

- V0.1.8 Windows Open Handler contract: **36/36 PASS**.
- V0.1.8 Windows acceptance contract: **8/8 PASS**.
- Existing Drive V0.4.5 open/download/ZIP regression: **26/26 PASS**.
- Existing Desktop access contract: **16/16 PASS**.
- Existing V0.1.7 Plan contract: **47/47 PASS**.
- Existing V0.1.7 security scan acceptance contract: **15/15 PASS**.
- Existing V0.1.7 restart-safe Download Apply acceptance contract: **16/16 PASS**.

Physical Windows installation/open acceptance is still required before V0.1.8 may be closed.

## V0.1.9 – általános Windows-megnyitás + első használati telepítési UX

Dátum: 2026-10-07
Környezet: **DEV PILOT · PROD DENY**

### Cél

A V0.1.8 Windows Open Handler fizikai E2E bizonyította a dimpro-drive:// protokollos megnyitást, a workfile SHA-256 ellenőrzést, a SERVER_CURRENT, SERVER_UPDATED, LOCAL_MODIFIED állapotlogikát és a helyi módosítás felülírás elleni védelmét.

A V0.1.9 célja, hogy a webes DIMPRO Drive Windows-megnyitása ne csak a fejlesztői gépen, BENJADMIN Windows Bridge token mellett működjön, hanem normál meghívott/pilot Windows-felhasználó számára is telepíthető legyen.

### Open-ticket authorization változás

A V0.1.9-ben az egyszer használatos Windows-open ticket továbbra is:

- randomBytes(32) alapú, 256 bites opaque capability;
- SHA-256 hash alapján tárolt, a nyers token nem kerül fájlnévbe;
- alapból 90 másodpercig érvényes;
- maximum 180 másodperces TTL-lel rendelkezik;
- atomikusan, rename művelettel egyszer használható.

A ticket schema V2 lett, és szerveroldalon tárolja az actorUserId és actorUserAliases adatokat.

A ticketet továbbra is kizárólag hitelesített web-session és document.read jogosultság mellett lehet kiadni.

Redeemkor a backend a tickethez kötött canonical aliasokkal újra lekéri az aktuális projekt-hozzáférést, és ismét megköveteli a document.read jogosultságot. Ha a jogosultság a ticket kiadása és redeem között megszűnik, a megnyitás fail-closed.

Ezért az egyszeri Windows-open flow már nem igényel BENJADMIN Developer Grid Windows Bridge device tokent. Ez a könnyítés kizárólag az egyszeri, web által kezdeményezett open-ticket flow-ra vonatkozik; teljes Drive Desktop sync, háttérszinkron vagy tartós Desktop API-hozzáférés továbbra is külön jövőbeli Desktop-auth capability.

### V0.1.9 Windows Handler

Új források:

- scripts/dimpro-drive-desktop-open-handler-v019.ps1
- scripts/dimpro-drive-desktop-open-handler-manager-v019.ps1

Fő szabályok:

- nincs BENJADMIN Bridge token / DPAPI token függés;
- a dimpro-drive://open-file?ticket=... URI nem adhat meg szerver override-ot;
- csak az exact https://drive.dev.dimpro.hu DEV host engedélyezett;
- a letöltött fájl SHA-256 és méret ellenőrzése megmaradt;
- helyileg módosított workfile továbbra sem írható felül;
- workfile automatikus törlés nincs;
- teljes Drive tree mirror/sync nincs;
- Windows fájltársítás szerinti Start-Process megnyitás megmaradt.

### Telepítőcsomag

Webes letöltési artifact:

/downloads/DIMPRO_Drive_Desktop_V019_WINDOWS_DEV.zip

A ZIP tartalma:

- DIMPRO_Drive_Desktop_Install.cmd
- DIMPRO_Drive_Desktop_Uninstall.cmd
- dimpro-drive-desktop-open-handler-v019.ps1
- dimpro-drive-desktop-open-handler-manager-v019.ps1
- README.txt

A telepítés nem igényel HKLM módosítást; a protokollregisztráció per-user HKCU:\Software\Classes\dimpro-drive alatt történik. A telepítő nem törli és nem szinkronizálja automatikusan a felhasználói Drive tartalmat.

DEV artifact SHA-256:

bff6556c6a033307c66e5f5d060a2ecb576b152472caea903077aaefc88f64d7

### Web UX

A Drive webes felületen:

1. a Műveletek menüben külön Drive Desktop letöltése művelet érhető el;
2. az első Megnyitás Windowsban kattintáskor a web még nem kér open-ticketet;
3. első használati panel jelenik meg: Drive Desktop letöltése / Telepítve van – megnyitás / Mégsem;
4. a panel röviden leírja a ZIP kicsomagolását és a DIMPRO_Drive_Desktop_Install.cmd futtatását;
5. a felhasználó Telepítve van visszajelzését a böngésző localStorage-ban jegyzi meg;
6. későbbi Windows-megnyitáskor közvetlenül az open-ticket flow indul.

A localStorage csak UX-jelzés, nem authorization. A szerveroldali hozzáférés minden open-ticket kiadáskor és redeemkor külön ellenőrzött.

### Acceptance

Új contract:

scripts/drive-desktop-open-v019-contract.mjs

DEV static eredmény:

- V0.1.9 Windows Open contract: **24/24 PASS**;
- git diff --check: PASS;
- PROD: **DENY**.

A következő fizikai acceptance:

1. V0.1.9 ZIP letöltése a Drive webes felületről;
2. telepítés olyan Windows felhasználói környezetben, ahol nincs BENJADMIN Windows Bridge token;
3. dimpro-drive:// protokollregisztráció ellenőrzése;
4. webes első-use panel ellenőrzése;
5. Excel/PDF/JPG Windows-megnyitás;
6. SERVER_CURRENT + LOCAL_MODIFIED regresszió;
7. külön SERVER_UPDATED és local+remote conflict acceptance.

### V0.1.9 validációs lezárás

2026-10-07 DEV validáció:

- V0.1.9 Windows Open contract: **24/24 PASS**;
- git diff --check: **PASS**;
- teljes TypeScript ellenőrzés: **PASS** kompatibilis, package.json/package-lock szinten azonos dependency worktree használatával, 3072 MB Node heap mellett;
- V0.1.9 által érintett TypeScript/TSX fájlok célzott ESLint ellenőrzése: **PASS / 0 error**;
- repository teljes ESLint futás: **25 error / 107 warning**, kizárólag korábban meglévő, V0.1.9 által nem módosított fájlokban; ezért ez baseline lint debt, nem V0.1.9 regresszió;
- Next.js 16.2.6 Webpack production compile: **PASS**, 24.5 perc;
- build saját TypeScript fázisa: **PASS**, 9.5 perc;
- statikus oldal generálás: **103/103 PASS**;
- standalone server.js: létrejött;
- BUILD_ID: hs0ohxzH5Ga4p7x6XXz5A;
- local Turbopack build nem kódhibán, hanem a validációhoz használt külső node_modules symlink fájlrendszer-root korlátozásán állt meg; Webpack builddel a production buildképesség igazolt;
- standalone asset-copy helyben nem lett futtatva, mert a helper destruktív cleanup műveleteket is tartalmaz, amelyet a DEV safe-delete policy külön kapuval véd;
- PROD továbbra is **DENY**.

### V0.1.9 integration checkpoint – active Drive V0.9.22 base

A publikus Drive DEV host 2026-10-07-én már a 8e08ebec9aca89b1b9d10362604e7909e6daba66 (Drive V0.9.22) forráson futott, amely a V0.1.9 eredeti fejlesztési ágával a 9a0a4b513ea66bb742527af2028407d27303d42c közös alap után szétvált. Emiatt az eredeti V0.1.9 commit közvetlen deployja tiltott lett volna, mert frissebb Drive UI/funkciókat írhatott volna vissza.

A V0.1.9 ezért külön integration worktree-ben az aktív 8e08ebec9... commitra lett ráemelve. A konfliktusfeloldás megőrizte a V0.9.22 folder access, drag/move, deterministic compare és kapcsolódó UI/CSS rétegeit; ezek mellé került a V0.1.9 Desktop first-use/download UX.

Integration pre-commit validáció:

- V0.1.9 contract: **24/24 PASS**;
- git diff --check: **PASS**;
- teljes TypeScript: **PASS**;
- érintett V0.1.9 TypeScript/TSX/MJS célzott ESLint: **PASS / 0 error**;
- package.json és package-lock.json hash egyezik a jelenlegi V0.9.22 kompatibilis dependency worktree állapotával;
- PROD: **DENY**.

### V0.1.9 final integration checkpoint – Drive V0.9.23 candidate base

A párhuzamos Drive/AUTH fejlesztés közben a dc3eec69e2f97ced5b2ca44b53f443073c1537ba V0.9.23 candidate elkészült a 3401-es DEV porton. Ez az aktív V0.9.22 8e08ebec9... leszármazottja, ezért a V0.1.9 végleges forrása erre a frissebb candidate-alapra lett ráemelve.

A V0.9.23 personal trash/quota/fullscreen preview CSS és Workspace változásai megmaradtak; a V0.1.9 Desktop first-use/download UX ezek mellé került.

Final integration pre-build validáció:

- V0.1.9 contract: **24/24 PASS**;
- TypeScript: **PASS**;
- célzott ESLint: **PASS / 0 error**;
- git diff --check: **PASS**;
- PROD: **DENY**.

A korábbi 31de645e2... V0.9.22-alapú BUILD01 artifact superseded; deployra nem használható.
