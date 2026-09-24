# DIMPRO DEV Developer Grid Pre-materialize Backup Retirement V1

Dátum: 2026-09-24
Környezet: DEV ONLY · PROD DENY

## Cél

Történeti Developer Grid pre-materialize .next snapshotok biztonságos nyugdíjazása úgy, hogy:
- teljes snapshot tree SHA-256 készül;
- immutable release és source proof ellenőrzött;
- backup könyvtár megmarad;
- RETIREMENT_EVIDENCE.json megmarad.

## Kötelező bizonyíték

- backup csak /srv/dimpro-dev/backups/developer-grid alatt lehet
- snapshot a backup könyvtáron belül
- .dimpro-release.json és BUILD_ID kötelező
- sourceCommit, sourceBranch, buildId exact plan egyezés
- source commit létezik a canonical Git repóban
- snapshot teljes tree SHA-256 és byte méret exact plan egyezés
- symlink és shared-hardlink tiltott
- active Central Core és PM2 source commit védett
- immutable release manifest + sidecar SHA exact
- immutable EXE és DEV ZIP SHA/byte exact
- releaseMetadata, standalone, windowsArtifactProvenance, packageSessionProvenance VERIFIED
- DEV ONLY · PROD DENY
- apply coordinated maintenance lock alatt
- apply csak directive-ben exact tool SHA-val

## Törlés

Csak az explicit snapshot könyvtár törölhető.
A backup gyökérkönyvtár és a RETIREMENT_EVIDENCE.json megmarad.

## Acceptance

Developer Grid pre-materialize backup retirement contract: 16/16 PASS.
