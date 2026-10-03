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
