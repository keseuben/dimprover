# DIMPRO DEV Artifact-backed Historical Release Cache Retirement V3

Dátum: 2026-09-24
Környezet: DEV ONLY · PROD DENY

## Cél

A V2 storage-retention guard szándékosan nem töröl automatikusan történeti release worktree-k regenerálható cache-eit, ha azok védett vagy történeti állapotúak.

A V3 kiegészítés kizárólag artifacttal bizonyított történeti release-cache nyugdíjazást enged.

## Törölhető célok

Csak egy explicit planben szereplő történeti release worktree-n belül:
- .next és .next* könyvtárak
- root node_modules
- desktop/benjadmin-developer-grid/node_modules
- desktop/benjadmin-developer-grid/dist
- desktop/benjadmin-developer-grid/dist-dev

Forrás, worktree, Git objektum, backup, immutable artifact, Central Core állapot, evidence vagy runtime nem törölhető ezzel az eszközzel.

## Kötelező bizonyítékok

Egy plan entry csak akkor eligible, ha minden feltétel teljesül:
1. worktree a canonical /srv/dimpro-dev/worktrees gyökér alatt van;
2. Git HEAD exact egyezik a plan expectedHead értékével;
3. worktree clean;
4. nincs PM2 cwd/exec/project-root/source-worktree referencia;
5. nincs aktív Central Core session referencia;
6. nincs nginx referencia;
7. immutable artifact manifest létezik az approved artifact root alatt;
8. manifest .sha256 sidecar egyezik;
9. manifest gitCommit exact egyezik a worktree HEAD-del;
10. environment DEV;
11. productionAccess DENY;
12. releaseMetadata VERIFIED;
13. standalone VERIFIED;
14. windowsArtifactProvenance VERIFIED;
15. packageSessionProvenance VERIFIED;
16. EXE hash és byte méret egyezik a manifesttel;
17. DEV ZIP hash és byte méret egyezik a manifesttel;
18. node_modules célban nincs shared hardlink.

Bármely eltérés: DENY · SAFE_DELETE_PREFLIGHT_FAILED.

## Dry-run / apply

Alapértelmezés: dry-run. A dry-run semmit nem töröl.

Apply csak:
- canonical DEV rooton;
- Safe Delete skill és directive hash-validáció után;
- a directive által exact SHA-256-tal jóváhagyott guard scripttel;
- futó coordinated maintenance lock alatt;
- explicit plan alapján.

## Implementáció

scripts/dimpro-dev-artifact-cache-retirement-v1.py

Contract:
scripts/dimpro-dev-artifact-cache-retirement-v1-contract.py

Acceptance:
- artifact-backed retirement contract: 12/12 PASS
- existing DIMPRO DEV Storage Retention V2 contract: 44/44 PASS

## Első tervezett használat

Csak külön dry-run és bizonyítás után, a következő történeti Developer Grid release worktree-k regenerálható cache-eire:
- v0.1.6 immutable
- v0.1.11 immutable
- v0.1.59 release
- v0.1.64 release

A v0.1.65, v0.1.66 és v0.1.67 aktív/rollback release-ek továbbra is védettek.
