# DIMPRO BENJADMIN B3 – M0 release-gate állapot

Dátum: 2026-08-09
Környezet: DEV (`213.160.68.32`)
Branch: `infra/benjadmin-b3-m0`

## Automatikusan igazolt állapot

- Supabase DEV külön projekt és külön adatmodell: PASS.
- Identity / Project / Calendar / Drive / Dialog / Decide / Diary / Drop adatbázis contractok: PASS a korábban rögzített M0 tesztkör szerint.
- DIMPRO Auth szerveroldali allowlist: PASS; jelenleg 1 engedélyezett cím.
- Supabase Auth új felhasználói signup: TILTVA (`disable_signup=true`).
- Automatikus Auth user-létrehozás a DIMPRO OTP route-ban: TILTVA (`shouldCreateUser=false`).
- Valódi 6 számjegyű DEV OTP request / verify / browser login: PASS.
- Nem engedélyezett e-mail OTP kérés: HTTP 403, PASS.
- Közvetlen Supabase signup negatív teszt: `Signups not allowed for this instance`, PASS.
- DEV HTTP smoke: `dev`, `app.dev`, `drop.dev`, Identity health: 4/4 PASS.
- TypeScript: PASS.
- Lint: 0 error / 108 örökölt warning.
- Build: PASS, build ID `twdXp2Z5LPyLFEKs-b9iM`.
- Auth hardening contract: 10/10 PASS.
- DEV Restic backup: záró snapshot a Dev Center lezárási rekordban naplózva.

## M0 release-gate-ek – lezárva

- `admin.dev.dimpro.hu` DNS/TLS: PASS (`213.160.68.32`, HTTPS 200).
- GitHub DEV write: PASS dedikált deploy key + SSH remote + valós push smoke.
- DRIVE DEV Object Storage: külön DEV credential + bucket, put/head/read/delete smoke PASS, `quarantine` mód aktív.
- DROP DEV Object Storage: külön DEV credential + külön bucket, credential isolation PASS, put/head/read/delete smoke PASS, `quarantine` mód aktív.
- DEV CORS originok környezetfüggővé téve: DRIVE `projektkapu.dev.dimpro.hu`, DROP `drop.dev.dimpro.hu`.
- Ismert nem-M0 blokkoló: a Hetzner DROP bucket `OPTIONS` preflight jelenleg 403-at ad, miközben az aláírt PUT sikeres és az `Access-Control-Allow-Origin` fejlécet visszaadja. Ezt a DROP böngészős közvetlen feltöltési körben külön kell tovább vizsgálni; az M0 szerveroldali Object Storage izoláció és read/write/delete acceptance sikeres.

## Következő fejlesztési pont

Az M0 kötelező gate-ek lezárása után a következő fejlesztési kör a BENJADMIN B3 M1 előkészítése. M1 csak új Dev Center verzióval, új backup/checkpointtal és külön worktree/branch munkafolyamattal indulhat.

## Automatikus ellenőrző

Futtatás:

```bash
node scripts/benjadmin-m0-release-gate-check.mjs
```

Az ellenőrző titkot nem ír ki; a release-gate-eket `PASS` / `BLOCKED` állapotban összesíti.
