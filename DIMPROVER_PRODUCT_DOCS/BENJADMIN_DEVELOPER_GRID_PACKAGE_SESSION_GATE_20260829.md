# BENJADMIN Developer Grid — EXE + DEV ZIP package-session gate — 2026-08-29

## Környezet
- Developer Grid only
- DEV ONLY · PROD DENY
- ChatGrid v0.3.x változatlan

## Cél
A Windows EXE és a DEV ZIP ne két egymástól független fájl legyen a release pipeline-ban. A DEV ZIP csak akkor fogadható el, ha ugyanahhoz az exact Git commit + branch + Build ID állapothoz és ugyanahhoz a Windows EXE hashhez tartozó package session bizonyíték készült.

## Új package-session marker
A DEV ZIP csomagolás végén létrejön:

`desktop/benjadmin-developer-grid/dist-dev/.dimpro-package-session.json`

A marker tartalmazza:
- exact Git commit;
- canonical branch;
- Build ID;
- desktop verzió;
- DEV environment / PROD DENY;
- Windows EXE fájlnév, SHA-256 és byte méret;
- DEV ZIP fájlnév, SHA-256 és byte méret;
- determinisztikus `packageSessionId`.

A marker csak akkor készülhet el, ha a korábbi `.dimpro-windows-artifact.json` ugyanahhoz az exact source/build állapothoz tartozik és az EXE hash ténylegesen egyezik.

## Release gate
A Release Artifact Engine a Windows marker után külön package-session markert is kötelezően ellenőriz. Bármely commit/branch/Build ID/EXE/ZIP/hash/méret/DEV-DENY eltérés fail-closed release blokkot eredményez.

Az új manifest rögzíti:
- `windowsArtifactProvenance: VERIFIED`
- `packageSessionProvenance: VERIFIED`
- `packageSessionId`

## Elfogadási állapot
- Release Artifact contract: 55/55 PASS
- Foundation contract: 29 required files / 44 invariants PASS
- Work-start P0 contract: 17/17 PASS
- Operation Reconciler: 12/12 PASS
- Windows package contract: 14/14 PASS
- State contract: 17/17 PASS
- Runtime provenance: 10/10 PASS
- Canonical build contract: 27/27 PASS
- Desktop acceptance: 59/59 PASS
- Native delta: 19/19 PASS
- TypeScript: PASS
- npm audit: 0 vulnerability
- git diff --check: PASS

## Build állapot
Ebben a fejlesztési blokkban nem indult új teljes Next build. A host pillanatnyi MemAvailable értéke kb. 2.1 GiB volt, ezért a canonical build resource gate-et nem kerültük meg. Az esti RC teljes buildje csak megfelelő resource preflight után indulhat.

**DEV ONLY · PROD DENY**
