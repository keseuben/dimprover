# BENJADMIN Developer Grid — Windows artifact provenance marker — 2026-08-29

## Scope
- Developer Grid Windows packaging only.
- DEV ONLY · PROD DENY.
- ChatGrid v0.3.x fallback/reference változatlan.

## Cél
A Windows EXE elkészülése után már a DEV ZIP / Release Artifact manifest létrejötte előtt legyen exact, gépileg ellenőrizhető bizonyíték arról, hogy az EXE mely source HEAD, branch és web Build ID alapján készült.

## Új wrapper
`scripts/developer-grid/package-windows.sh`

Kötelező kapuk:
- canonical host/worktree/repository/branch;
- clean exact source HEAD;
- `.next/BUILD_ID` megléte;
- `.next/.dimpro-release.json` exact HEAD/branch/Build ID egyezés;
- desktop acceptance;
- native delta contract;
- npm audit;
- central exclusive `build` lock;
- `build:raw` tiltott.

## Marker
A Windows packaging sikeres végén, még ugyanazon koordinált operation belsejében fut a `write-windows-artifact-marker.mjs`.

Létrejövő fájl:
`desktop/benjadmin-developer-grid/dist/.dimpro-windows-artifact.json`

Tartalma:
- version;
- gitCommit;
- gitBranch;
- buildId;
- environment = DEV;
- productionAccess = DENY;
- EXE fájlnév;
- teljes SHA-256;
- byte méret;
- generatedAt.

A marker atomikusan készül és `0600` jogosultságot kap. Marker csak akkor írható, ha a source és a web build provenance a csomagolás végén is pontosan egyezik.

## Reconciliation
Az Operation Reconciler Windows timeout után elsődlegesen ezt a markert ellenőrzi. Exact marker + EXE hash egyezés esetén:
`COMPLETED / DO_NOT_REPEAT / WINDOWS_ARTIFACT_MARKER_VERIFIED`

Régi kiadásoknál, ahol marker még nem készült, megmarad a kompatibilitási operation-history + EXE fallback, illetve a release manifest bizonyíték.

## Acceptance
- Windows package contract: 14/14 PASS.
- Operation reconcile contract kibővítve exact és stale marker esettel.
- teljes regressziós csomag checkpoint előtt kötelező.

**DEV ONLY · PROD DENY**
