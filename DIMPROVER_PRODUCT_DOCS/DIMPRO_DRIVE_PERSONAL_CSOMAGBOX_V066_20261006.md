# DIMPRO Drive V0.6.6 – Saját Drive CsomagBOX

Dátum: 2026-10-06  
Környezet: DEV ONLY  
PROD: DENY

## Cél

A Saját Drive ugyanazt a közös CsomagBOX felületet és vizuális összehasonlító motort használja, mint a projekt Drive, de exact személyes owner-scope-pal. Projekt-specifikus tervellenőrzési/finding/hibajegy workflow nem kerül át a személyes munkatérbe.

## Adatmodell

- schema marker: `personal-drive-boxes` / `0.1.0` / migration count `1` / bootstrap `personal-drive-boxes-v010-20261006`;
- táblák: `dimpro_personal_drive_boxes`, `dimpro_personal_drive_box_folders`, `dimpro_personal_drive_box_items`, `dimpro_personal_drive_box_events`;
- exact `owner_user_id` scope;
- a BOX elem személyes `content_ref` hivatkozást tárol, nem projekt-dokumentumot és nem fájlmásolatot;
- same-owner BOX/mappa integrity FK-k, scope-trigger, RLS;
- közvetlen `anon` és `authenticated` tábla-hozzáférés tiltott; szerveroldali service-role hozzáférés;
- atomi RPC-k: BOX létrehozás, elem hozzáadás/eltávolítás, belső mappa, mozgatás, lifecycle.

A guarded DEV migráció preflight/apply/verify PASS. A post-activation verify szerint a meglévő Content Core állomány változatlanul 3 object / 3 ref / 0 személyes mappa, az új BOX táblák 0/0/0/0 sorral indultak.

## Felület és funkciók

- a Saját Drive a közös `BoxShelf` komponenst használja;
- BOX létrehozás és cél szerinti típus;
- fájl hozzáadás és eltávolítás;
- belső BOX mappák és almappák;
- BOX-elemek mappába mozgatása;
- lifecycle: `DRAFT`, `READY`, `SENT`, `ARCHIVED`;
- BOX előzmények;
- teljes ablakos táblázatban külön CsomagBOX panel;
- ZIP export a BOX belső mappastruktúrájának megtartásával;
- ZIP-be csak `security_status=clean` és `virus_scan_status=clean` személyes fájl kerülhet;
- automatikus `DIMPRO_Dokumentaciojegyzek.txt` a ZIP-ben;
- közös vizuális compare motor PERSONAL módban: side-by-side, overlay, difference és illesztés;
- a projekt finding / felelős / issue workflow PERSONAL módban nincs aktiválva.

## Forrás és build

- schema commit: `0cf320504554bb730b1b7833e102e8bfd70a7a68`;
- runtime source commit: `d0e255cb8e61a1a495aefdd72969fea4170d2108`;
- branch: `worker/arminai/dimpro-auth-drive-integration-20261003`;
- build runner: `build02`;
- Build Transport Gateway: HTTP 403, ezért dokumentált manual safe fallback;
- build ID: `Ua_bDqr4eEJABVzqfo9Ct`;
- artifact SHA-256: `6ae8e0ca869b020e173ee5269ae45ef7109ea0c5ae42558ac4d0060570544cbe`;
- release directory: `/srv/dimpro-dev/candidates/drive-pilot/releases/d0e255cb8e61`.

## DEV aktiválás

- új runtime: `dimpro-drive-v0913-auth044-personalbox-d0e255cb-p3384`;
- port: `3384`;
- PM2: online, 0 restart;
- publikus upstream: `drive.dev.dimpro.hu` → `127.0.0.1:3384`;
- header: `d0e255cb DRIVE V0.9.13 AUTH V0.6.5 PERSONAL CSOMAGBOX + LINKED PROJECTS + IDENTITY + BROWSER FULLSCREEN + SSO TERMINAL + DESKTOP SCAN AUTH DEV`;
- rollback runtime: `dimpro-drive-v0913-auth044-v065-0aa54e28-p3381`, port `3381`, online és érintetlen;
- Nginx backup: `/srv/dimpro-dev/artifacts/backups/nginx-drive-personalbox/dimpro-dev.conf.before-d0e255cb-20261006T174818Z`.

Publikus smoke:
- `/drive` → 307 central SSO start, no-store/no-cache;
- `/api/drive/personal/boxes` auth nélkül → 401 `AUTH_REQUIRED`;
- candidate header és `X-DIMPRO-Production-Access: DENY` látható;
- PM2 error log: 0 byte.

## Ellenőrzések

- PERSONAL CsomagBOX app contract: 14/14 PASS;
- SQL contract: 13/13 PASS;
- migration order: 3/3 PASS;
- ProjectGate compare regresszió: 10/10 PASS;
- ProjectGate CsomagBOX regresszió: 13/13 PASS;
- BOX history: 18/18 PASS;
- compact BOX UI: 19/19 PASS;
- resizable panel/folder UX: 13/13 PASS;
- compare/issue ACL: 18/18 PASS;
- célzott ESLint: PASS;
- TypeScript: PASS;
- `git diff --check`: PASS;
- build compile: PASS;
- build TypeScript: PASS;
- static generation: 103/103 PASS;
- standalone asset sync: 269 chunk PASS;
- DEV DB post-activation integrity verify: PASS.

## Nyitott ellenőrzés

A szerveroldali és publikus smoke PASS. A bejelentkezett böngészős E2E-t a felhasználói sessionnel kell fizikailag ellenőrizni: CsomagBOX megnyitás, BOX létrehozás, személyes fájl BOX-ba helyezése, mappa/lifecycle/history/ZIP és vizuális összehasonlítás.
