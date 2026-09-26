# Projektkapu candidate retention guard V0.1 – terv

Dátum: 2026-09-26
Környezet: DEV ONLY
PROD: DENY

## Cél

A `/srv/dimpro-dev/candidates/projectkapu-drop-drive-pilot` alatt felhalmozódó korábbi Next.js candidate build outputok kontrollált kezelése.

## Biztonsági állapot

A V0.1 guard **dry-run only**. Törlési képessége nincs.

`--apply` használatakor kötelezően leáll:
`PROJECTKAPU_CANDIDATE_RETENTION_DENY`.

## Pozitív bizonyíték

Regenerálhatónak csak olyan régi candidate nevezhető, amelynél:
- canonical DEV candidate root;
- Safe Delete skill SHA egyezik;
- `.next/.dimpro-release.json` rendelkezésre áll;
- gitCommit létezik a canonical bare repóban;
- gitBranch a BenjaminAI worker branch;
- buildId létezik;
- `.next/standalone/server.js` létezik;
- a candidate nem az aktív `latest-source-path`;
- a 3299 runtime CWD nem alatta fut.

## Védelmek

Mindig védett:
- aktuális runtime candidate;
- legújabb előző teljes candidate mint rollback;
- hiányos/UNKNOWN candidate;
- source fájlok;
- candidate gyökér;
- env/config;
- coordination, artifacts, backups, repositories.

Ha később külön jóváhagyott apply verzió készül, annak célja is kizárólag az explicit bizonyított régi candidate `.next` könyvtára lehet.

## Jóváhagyás

Apply csak külön:
1. guard review + immutable Git commit,
2. script SHA-256 rögzítés a Safe Delete directive-ben,
3. dry-run report,
4. explicit emberi jóváhagyás,
5. preflight,
6. post-delete audit
után engedélyezhető.
