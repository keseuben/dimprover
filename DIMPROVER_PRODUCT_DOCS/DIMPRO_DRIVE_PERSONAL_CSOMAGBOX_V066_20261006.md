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

Első PERSONAL CsomagBOX candidate:
- runtime: `dimpro-drive-v0913-auth044-personalbox-d0e255cb-p3384`;
- port: `3384`;
- PM2: online, 0 restart;
- source: `d0e255cb8e61a1a495aefdd72969fea4170d2108`;
- build ID: `Ua_bDqr4eEJABVzqfo9Ct`;
- Nginx backup: `/srv/dimpro-dev/artifacts/backups/nginx-drive-personalbox/dimpro-dev.conf.before-d0e255cb-20261006T174818Z`.

A cutover után BenjaminAI újabb Drive Desktop V0.1.8 candidate-et aktivált. Read-only Git ancestry ellenőrzés igazolta, hogy a `d0e255cb8...` PERSONAL CsomagBOX commit a jelenlegi integrált `9a0a4b513ea66bb742527af2028407d27303d42c` őse. Ezért a CsomagBOX fejlesztés nem veszett el és nem kell visszaváltani a 3384-es candidate-re.

Jelenlegi publikus integrált DEV állapot:
- runtime: `dimpro-drive-v018-open-handler-9a0a4b513-p3385`;
- port: `3385`;
- PM2: online, 0 restart;
- source commit: `9a0a4b513ea66bb742527af2028407d27303d42c`;
- source branch: `worker/benjaminai/drive-desktop-v015-fix1-20261003`;
- build ID: `Xahz_oxIUJVtzWfcsmqcF`;
- header: `9a0a4b51 DRIVE V0.9.13 AUTH V0.6.5 PERSONAL CSOMAGBOX + WINDOWS OPEN V0.1.8 + DESKTOP SCAN AUTH DEV`;
- a live standalone release tartalmazza mind a 8 PERSONAL BOX API route-ot;
- `d0e255cb8...` → `9a0a4b51...` ancestry: PASS;
- PROD DENY.

A 3384-es CsomagBOX candidate és a 3381-es korábbi személyes Drive runtime rollbackként online maradtak.

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

## PDF render guard javítás – 2026-10-06

A PERSONAL vizuális compare böngészős E2E során PDF.js canvas race jelentkezett: `Cannot use the same canvas during multiple render() operations.`

Javítás:
- a közös `pdfDocumentEngine` canvasonként legfeljebb egy aktív render taskot tart;
- új render előtt az előző task `cancel()` hívást kap, majd a promise rendeződik;
- a guard a PERSONAL compare, a projekt compare és a normál PDF preview közös motorját stabilizálja.

Ellenőrzések: PDF canvas guard 7/7 PASS, PERSONAL CsomagBOX 14/14 PASS, ProjectGate compare 10/10 PASS, Compare/Issue ACL 18/18 PASS, Windows Open V0.1.8 36/36 PASS, Windows acceptance 8/8 PASS, TypeScript/ESLint PASS.

Integrált source: `1b3517caf9368eb0d1a55530ef4f8b0352387c63`. Build ID: `ydKhzJs9p-nPqyDVZzkWy`. Artifact SHA-256: `fb0d439e6b2b7e7c2dda893d1d495fdc5611d9065cd730c38e009166bc089693`. DEV runtime: `dimpro-drive-v0913-auth044-pdfrender-1b3517caf-p3386`, publikus upstream `3386`; korábbi `9a0a4b51` / 3385 online rollback. PROD DENY.

## Fullscreen compare stabilizálás – 2026-10-06

A böngészős E2E során a teljes képernyős párhuzamos PDF összehasonlításnál layout-vibrálás jelentkezett. A gyökérok a külső compare-stage és a belső panelek egymásba visszacsatolt scrollbar/ResizeObserver méretváltozása volt.

Javítás:
- fullscreen párhuzamos módban a külső stage `overflow:hidden`, a két belső tervpanel marad görgethető;
- a panelek stabil scrollbar-guttert kapnak;
- a ResizeObserver requestAnimationFrame-coalescinget használ;
- 4 px alatti méretzaj nem indít új PDF renderelést.

Contract: fullscreen stability 6/6 PASS, PDF canvas guard 7/7 PASS, ProjectGate compare 10/10 PASS, TypeScript/ESLint PASS. Integrált source `f2b4a3ed900eb20d1c1304b977bc8bf241c48cc0`, build `2aWPn8q01rbTJ5Ycklfs6`, artifact SHA-256 `cc40f2bc05c85f0e1c2f82e44aa537a485b9aa5b7f9eb88391b021db91021c06`, DEV runtime 3387. PROD DENY.

## Determinisztikus összehasonlítási eredmény V1 – 2026-10-06

A vizuális compare közös AI nélküli eredménypanelt kapott. A motor automatikusan elemzi az aktuális PDF-oldalpárt és visszaellenőrizhető szabályok alapján jelzi az összehasonlíthatóságot.

V1 jelek:
- tervazonosító felismerése fájlnévből vagy PDF-szövegből;
- lépték felismerése `M 1:n`, `LÉPTÉK 1:n` vagy `1:n` alakból;
- oldalszám és PDF tartalomtípus;
- egyedi PDF-szöveg egyezés, hozzáadott és törölt szövegelemek;
- vektorszakasz- és kontúrdarabszám eltérés;
- `Valószínű revíziópár`, `Ellenőrzendő`, `Eltérő tervlap` státusz és kompatibilitási jelző.

A panel kifejezetten jelzi, hogy az eredmény szabályalapú, nem AI-vélemény és nem szakmai tervjóváhagyás. A részletes diff lenyitható, fullscreenben korlátozott magasságú.

Contractok: deterministic core 7/7 PASS, UI 8/8 PASS, fullscreen stability 6/6 PASS, PDF canvas guard 7/7 PASS, ProjectGate compare 10/10 PASS, Compare/Issue ACL 18/18 PASS, Personal BOX 14/14 PASS, TypeScript/ESLint/build PASS.

Source `6e16db6f45f314fb785fa4ff7a08238d4ac0c901`, build `9BFKy9I7kt4BnDpAjsNTm`, artifact SHA-256 `8f4cd61d9542b5de1da0bdde171f0bc5db3add55f0227e9ba46fdd93dc22214e`, DEV runtime 3388. PROD DENY.
