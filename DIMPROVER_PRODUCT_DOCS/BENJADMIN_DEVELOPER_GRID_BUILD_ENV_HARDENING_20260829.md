# BENJADMIN Developer Grid — Build env audit hardening — 2026-08-29

## Scope
- Developer Grid canonical build wrapper only.
- DEV ONLY · PROD DENY.
- ChatGrid v0.3.x nem módosult.

## Probléma
A canonical Developer Grid buildhez szükséges két publikus DEV Supabase változó korábban közvetlen `bash/systemd-run` argumentumként került továbbadásra. A központi `dimpro-coordinated-operation.sh` auditálja a futtatott parancsot, ezért a command history-ba maga az argumentumérték is bekerülhetett.

## Javítás
- A wrapper továbbra is kizárólag a két szükséges `NEXT_PUBLIC_*` DEV értéket olvassa ki.
- Az értékek base64 formában rövid életű fájlba kerülnek a `/srv/dimpro-dev/coordination/secrets` könyvtárban.
- könyvtár jogosultság: `0700`;
- fájl jogosultság: `0600`;
- a fájl neve csak HEAD/PID azonosítót tartalmaz, értéket nem;
- a coordinated operation command-line kizárólag a fájl elérési útját kapja meg;
- a build child olvassa és memóriában dekódolja az értékeket;
- `EXIT/HUP/INT/TERM` esetén a wrapper törli az ideiglenes fájlt;
- privileged `SUPABASE_SERVICE_ROLE_KEY` és `DATABASE_URL` továbbra sem része a build wrappernek.

## Biztonsági eredmény
A jövőbeli Developer Grid build operation history `command` mezője nem tartalmazza a két publikus DEV Supabase érték konkrét tartalmát. Az Operation Reconciler ettől függetlenül továbbra is csak sanitizált history mezőket ad ki.

## Acceptance
- `bash -n`: PASS
- build candidate contract: protected mode-600 env file, child-side decode és command-argument tiltás ellenőrzése.
- teljes Developer Grid regressziós kapuk checkpoint előtt.

**DEV ONLY · PROD DENY**
