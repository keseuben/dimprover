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
- Build: PASS, build ID `IGufj1j-QidbvaUr0jPQs`.
- Auth hardening contract: 10/10 PASS.
- DEV Restic backup: snapshot `420c45d1`.

## Nyitott M0 release-gate-ek

1. `admin.dev.dimpro.hu` publikus DNS A rekord hiányzik. Cél: `213.160.68.32`.
2. GitHub DEV write hozzáférés még nincs aktiválva. Dedikált ED25519 deploy key előkészítve a DEV VPS-en; a publikus kulcsot a GitHub repositoryhoz write jogosultsággal kell hozzáadni, ezután a remote SSH-ra váltható és push smoke futtatható.
   - Deploy key fingerprint: .
3. Drive és Drop külön DEV Object Storage credential még nincs provisionálva; a write mód ezért tudatosan `disabled`, fail-closed.

## Következő két óra végrehajtási sorrend

1. M0 acceptance automatizálás és állapotriport véglegesítése.
2. GitHub deploy-key bekötés, amint a publikus kulcs manuálisan felkerül a repositoryhoz; SSH remote + push smoke.
3. `admin.dev.dimpro.hu` DNS létrehozása után Nginx/TLS bekötés és HTTP/TLS smoke.
4. Ha rendelkezésre áll külön DEV-only Object Storage access key: credential telepítés, Drive/Drop izolált write/read/delete smoke, majd csak siker esetén a DEV storage mód aktiválása.
5. M0 végső build/smoke/backup/restore-check, Dev Center lezárás.
6. M1 csak akkor indulhat el, ha az M0 kötelező gate-ek lezártak.

## Automatikus ellenőrző

Futtatás:

```bash
node scripts/benjadmin-m0-release-gate-check.mjs
```

Az ellenőrző titkot nem ír ki; a release-gate-eket `PASS` / `BLOCKED` állapotban összesíti.
