# BENJADMIN Developer Grid — Operation Reconciler — 2026-08-29

## Környezet
- **Developer Grid only**
- DEV ONLY · PROD DENY
- A ChatGrid v0.3.x fallback/reference forrását ez a fejlesztés nem módosítja.

## Probléma
A kliensoldali MCP/SSH hívás időtúlléphet úgy is, hogy a canonical DEV szerveren a hosszú build, Windows csomagolás vagy release művelet tovább fut, sőt közben sikeresen be is fejeződhet. A v0.1.5 Windows EXE buildnél ez történt: a központi operation history már rögzítette a sikeres befejezést, miközben a vezérlő munkamenet timeoutként érzékelte a hívást.

## Új szabály
Timeout vagy bizonytalan visszatérés után **tilos ugyanazt a hosszú műveletet vakon újraindítani**. Előbb az `operation-reconcile.mjs` fut.

A reconciler a következő bizonyítékokat vizsgálja:
1. `active-development.json` — csak sanitizált mezők, élő PID ellenőrzéssel;
2. `development-operations.jsonl` — csak sanitizált státuszmezők, a tárolt `command` mező soha nem kerül a kimenetbe;
3. canonical `.next/BUILD_ID` + `.next/.dimpro-release.json` + standalone runtime;
4. Windows EXE saját `.dimpro-windows-artifact.json` provenance marker + teljes SHA-256;
5. régebbi kiadásnál kompatibilitási fallbackként Windows EXE megléte + sikeres koordinált operation history;
6. Release Artifact Engine manifest + EXE/DEV ZIP teljes SHA-256 egyezés.

## Állapotok
- `RUNNING / WAIT` — ugyanaz a hosszú művelet ténylegesen fut; újraindítás tilos.
- `COMPLETED / DO_NOT_REPEAT` — hiteles bizonyíték szerint elkészült; továbblépés szükséges, nem ismétlés.
- `BLOCKED` — más exclusive művelet fut, előző futás hibás, provenance eltér, vagy további ellenőrzés kell.
- `NOT_FOUND / SAFE_TO_START_AFTER_PREFLIGHT` — nincs aktív vagy kész bizonyíték, és a source ugyanazon exact HEAD/branch, tiszta állapotban van; csak ekkor indulhat új művelet a normál resource/lock preflight után.

## Használat
```bash
node scripts/developer-grid/operation-reconcile.mjs \
  --kind=build \
  --expected-commit=<EXACT_HEAD> \
  --expected-branch=feature/benjadmin-developer-grid-v1-20260827 \
  --task="Developer Grid canonical build"
```

Windows csomagolásnál `--kind=windows --version=x.y.z`, release-nél `--kind=release --version=x.y.z` használatos.

## Acceptance
- matching active operation → WAIT;
- idegen exclusive operation → BLOCKED;
- exact build provenance → COMPLETED;
- build mismatch nem minősül késznek;
- sikeres Windows history + EXE → DO_NOT_REPEAT;
- failed operation → REVIEW_FAILURE;
- release manifest + SHA-256 → COMPLETED;
- hash mismatch nem lehet COMPLETED;
- manifest nélküli release history további ellenőrzést kér;
- history `command`/secret tartalma nem kerül a kimenetbe.

## Valós v0.1.5 próba
A reconciler a már kiadott v0.1.5 release exact `44a20c1429e39c136cc466c7f445cf04729b9e09` forrására külön ellenőrizte:
- canonical web build: `COMPLETED / BUILD_PROVENANCE_VERIFIED`;
- Windows EXE: `COMPLETED / WINDOWS_ARTIFACT_MANIFEST_VERIFIED`;
- DEV release: `COMPLETED / RELEASE_ARTIFACT_MANIFEST_VERIFIED`.

Ez akkor is helyes eredményt ad, ha a fejlesztési branch később dokumentációs commitokkal továbbhaladt, mert a hosszú művelet exact release commitjához tartozó immutable bizonyítékot vizsgálja.

**DEV ONLY · PROD DENY**
