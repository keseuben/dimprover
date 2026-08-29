# BENJADMIN Developer Grid — Release ↔ Windows marker gate — 2026-08-29

## Környezet
- Developer Grid only
- DEV ONLY · PROD DENY
- ChatGrid v0.3.x változatlan

## Cél
A Release Artifact Engine többé ne fogadjon el pusztán név alapján megtalált Windows EXE-t. A release előtt kötelező legyen a canonical Windows package wrapper által készített `.dimpro-windows-artifact.json` marker exact ellenőrzése.

## Kötelező egyezések
A release csak akkor folytatható, ha a markerben és a tényleges release állapotban azonos:
- verzió;
- exact Git commit;
- canonical branch;
- Build ID;
- DEV environment;
- productionAccess = DENY;
- EXE fájlnév;
- EXE teljes SHA-256;
- EXE byte méret;
- signed = false.

Marker hiány, érvénytelen marker vagy bármilyen eltérés fail-closed release blokkot eredményez.

## Release manifest
Az új release manifest külön `windowsArtifactProvenance: VERIFIED` mezővel rögzíti, hogy az EXE provenance gate sikeresen lefutott.

## Várt lánc
`canonical build → Build ID/release metadata → package-windows.sh → Windows marker → EXE/DEV ZIP → Release Artifact Engine → immutable manifest → public SHA-256 verification`

A már befagyasztott v0.1.5 artifactot ez a post-release source változás nem írja át. Az új gate a következő release-től kötelező.

**DEV ONLY · PROD DENY**
