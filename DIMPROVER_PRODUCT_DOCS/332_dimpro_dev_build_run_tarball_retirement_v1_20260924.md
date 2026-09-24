# DIMPRO DEV Build-run Tarball Retirement V1

Dátum: 2026-09-24
Környezet: DEV ONLY · PROD DENY

## Cél

A régi BUILD01/BUILD02 run könyvtárak nagy build-artifact.tar.gz fájljainak biztonságos nyugdíjazása úgy, hogy a build auditbizonyíték megmaradjon.

## Megmaradó evidence

A tool soha nem törli:
- build-run könyvtárat
- metadata.json
- result.json
- immutable release manifestet
- immutable EXE/DEV ZIP release artifactot
- source/Git/worktree adatot
- Central Core állapotot

Csak a build-artifact.tar.gz törölhető.

## Kötelező bizonyítékok

- metadata és result DEV / PROD DENY
- result status PASS
- metadata/result sourceCommit, buildId, artifactSha256 exact egyezés
- build-artifact.tar.gz SHA exact egyezés
- exact sourceCommit + buildId alapján VERIFIED immutable release manifest
- manifest SHA sidecar egyezés
- immutable EXE és DEV ZIP hash + byte méret egyezés
- aktív Central Core source commit nem érinthető
- PM2 aktív/rollback source commit nem érinthető
- build node aktuális currentRunId nem érinthető
- apply csak coordinated maintenance lock alatt
- apply csak directive-ben exact SHA-256-tal jóváhagyott toolból

Bármely eltérés: DENY · SAFE_DELETE_PREFLIGHT_FAILED.

## Acceptance

- Build-run tarball retirement contract: 13/13 PASS
- A meglévő artifact-cache retirement és storage-retention guardok változatlanok.
