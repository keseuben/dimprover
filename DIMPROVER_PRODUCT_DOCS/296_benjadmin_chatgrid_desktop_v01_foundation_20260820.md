# 296 — BENJADMIN ChatGrid Desktop v0.1 foundation

Dátum: 2026-08-20
Branch: `feature/benjadmin-chatgrid-v1-20260820`
Baseline: `02455f3`
Környezet: kizárólag DEV fejlesztési worktree
Állapot: v0.1 DEV foundation és Windows portable csomag elkészült; fizikai Windows E2E még szükséges az első felhasználói indításkor.

## Cél

A BENJADMIN párhuzamos ChatGPT fejlesztési munkájához egy 2 × 2 cellás Windows desktop shell alapja készült. A négy ChatGPT munkafelület csak sikeres helyi jelszavas feloldás után jöhet létre. Minden cella külön kódmérnökhöz rendelhető és a meglévő BENJADMIN Worker Presence / Worker Activity adatforrásból mutatja a fejlesztési kontextust.

## v0.1 funkciók

- 4 konfigurálható cella, végleges alapkiosztás: BenAI, ÁrminAI, JázminAI, OutminAI;
- cellánként saját ChatGPT csevegés URL;
- közös perzisztens ChatGPT böngészőpartíció;
- keret nélküli BENJADMIN desktop shell saját fejléc- és ablakvezérléssel;
- cellánként újratöltés, nagyítás/visszaállítás, bezárás és újranyitás;
- opcionális Windows login autostart, a helyi jelszókapu megkerülése nélkül;
- Chrome-kompatibilis Chromium user-agent a ChatGPT webes kompatibilitás javítására;
- BENJADMIN élő állapotból megjelenített:
  - kódmérnök;
  - főmodul;
  - modul;
  - kontextus modul;
  - munkarész;
  - 1–6 munkafázis;
  - aktív / tesztel / build / lezárás / blokkolt / inaktív állapot;
- `in_progress → completed` feladatátmenetre értesítés;
- rövid helyi csengő;
- Windows toast;
- tálcavillogtatás;
- opcionális magyar TTS névbemondás.

## Kötelező jelszókapu

Első indításkor nincs hardcoded vagy gyári jelszó. A felhasználó hozza létre a saját ChatGrid-jelszót.

Biztonsági szabályok:
- minimum 8 karakter;
- nyers jelszó nem kerül fájlba;
- 16 bájtos véletlen salt;
- `scrypt` verifier: N=32768, r=8, p=1, 32 bájtos kulcs;
- timing-safe ellenőrzés;
- 5 hibás próbálkozás után 30 másodperces ideiglenes lockout;
- a ChatGPT `WebContentsView` példányok csak `unlocked=true` után jönnek létre;
- kézi zároláskor minden ChatGPT view bezáródik;
- Windows session lock esemény automatikusan zárolja a ChatGridet;
- új alkalmazásindításkor ismét jelszó szükséges.

A jelszókapu alkalmazásszintű védelem, nem helyettesíti a Windows-fiók, BitLocker és a fizikai eszköz védelmét.

## BENJADMIN kapcsolat

A desktop kliens a meglévő read-only útvonalat használja:

`GET /api/dev/console/live`

Hitelesítés:
- `x-dimpro-dev-reporter-key` header;
- a reporter kulcs nem kerül a normál JSON konfigurációba;
- helyben Electron `safeStorage` OS-titkosítással kerül mentésre;
- a renderer csak azt látja, hogy a kulcs be van-e állítva, az értéket nem kapja vissza.

A kliens 2 másodperces alap pollingot használ. A server response-ból csak a ChatGrid számára szükséges worker, task és presence mezőket tartja meg memóriában.

## Kódmérnöki kontextus

A cellafejléc a `workerPresence` rekordból használja:
- `workerCode`;
- `mainModule`;
- `moduleName`;
- `submoduleName`;
- `workItem`;
- `workStageIndex`;
- `phase`;
- `active`;
- `nextStep` és kapcsolódó lifecycle mezők előkészítve.

A készre jelentés hangjelzése nem pusztán a presence lease megszűnéséből származik. A ChatGrid a feladat tényleges státuszátmenetét figyeli, így egy `LEASE_RELEASED` vagy stale presence önmagában nem számít kész munkának.

## Web security

A ChatGPT felületek külön `WebContentsView` példányokban futnak:
- `nodeIntegration=false`;
- `contextIsolation=true`;
- `sandbox=true`;
- `webSecurity=true`;
- HTTPS navigáció;
- a konfiguráció csak `chatgpt.com` ChatGPT URL-t enged;
- v0.2.0-ban a ChatGPT web content kizárólag `chatgpt.com` eredetről kérhet audio/mikrofon hozzáférést; kamera/videó továbbra is tiltott;
- a beállítási modal idején a web view-k rejtve vannak, hogy ne takarják el a BENJADMIN shellt.

## Hangbevitel / mikrofon

A v0.2.0 verzióban mind a négy worker-cella és az ötödik központi ChatGPT-panel kap mikrofonindító műveletet. A ChatGrid kizárólag a `chatgpt.com` audio/mikrofon jogosultságát engedi; kamera/videó hozzáférést nem. A gomb megkísérli a ChatGPT saját hangbeviteli vezérlőjének indítását, és ha a ChatGPT aktuális DOM-ja miatt ez nem azonosítható, a ChatGPT saját alsó mikrofon gombja továbbra is használható. A ChatGrid nem tárol tartós hangfelvételt.

## Forrásfájlok

`desktop/benjadmin-chatgrid/`

Fő elemek:
- `src/main.cjs` — Electron shell, 4 view layout, lock/unlock, notification engine;
- `src/preload.cjs` — szűk IPC bridge;
- `src/security/password-store.cjs` — scrypt jelszókapu;
- `src/live/benjadmin-live-client.cjs` — read-only live kliens és completion-detekció;
- `src/config/defaults.cjs` — 4 cella és konfigurációs allowlist;
- `src/renderer/index.html` — shell, auth gate, cellafejlécek, settings;
- `src/renderer/styles.css` — 2 × 2 grid és BENJADMIN desktop UI;
- `src/renderer/renderer.js` — UI state, context megjelenítés, hangjelzés/TTS;
- `scripts/acceptance.mjs` — dependency nélküli foundation acceptance.

## Acceptance

`node desktop/benjadmin-chatgrid/scripts/acceptance.mjs`

Eredmény: **34/34 PASS**.

Ellenőrzött területek:
- négycellás alapkonfiguráció;
- URL allowlist;
- scrypt jelszó létrehozás és ellenőrzés;
- nyers jelszó hiánya;
- completion átmenet deduplikálása;
- lock gate;
- Windows screen-lock hook;
- safeStorage reporter key;
- sandbox / Node tiltás;
- settings overlay;
- főmodul/modul/kontextus fejléc;
- csengő és TTS foundation;
- CSP és preload IPC korlátozás.

## Következő gate

1. Windows gépes Electron runtime teszt;
2. ChatGPT bejelentkezés és session-perzisztencia ellenőrzés;
3. a négy konkrét fejlesztői csevegés URL-jének beállítása;
4. valódi BENJADMIN reporter key provisioning;
5. élő worker context és completion csörgés E2E;
6. Voice Input / hangrögzítő integráció.
7. BENJADMIN reporter kapcsolat egyszerűsített első indítási párosítása.

A foundation nem igényel Next.js DEV runtime cutovert vagy PM2 restartot. PROD nem módosult.

## Végső quality gate — 2026-08-20

- célzott ChatGrid acceptance: **34/34 PASS**;
- `npx tsc --noEmit`: **PASS**;
- `npm run lint`: **PASS**, 0 error, meglévő projekt warningok maradtak;
- `npm run build`: **PASS** a DEV környezethez tartozó `.env.local` ideiglenes, build alatti használatával;
- a build után az ideiglenes `.env.local` eltávolításra került;
- post-build storage retention sikeresen lefutott;
- PM2 restart nem szükséges, mert a ChatGrid új desktop kliens, a szerver runtime kódja nem módosult.

A build első próbája két környezeti ok miatt sikertelen volt: a megosztott `node_modules` symlink Turbopack korlátozásba ütközött, majd az izolált worktree-ben hiányzott a DEV Supabase környezet. Ezeket build-környezeti workarounddal kezeltük: hardlinkelt ideiglenes `node_modules` másolat és ideiglenes DEV `.env.local`. Forráskódos hiba nem maradt.

## Windows artifact

- fájl: `desktop/benjadmin-chatgrid/dist/BENJADMIN-ChatGrid-0.1.0-Windows-x64.exe`;
- cél: Windows x64 portable kiadás;
- méret: 92,523,253 byte (kb. 92.5 MB);
- SHA-256: `ce4c129d5d1f8aae778d9a0ea0434b20010460e455c044090e88ff1cc81d8e64`;
- Linux/headless Electron indulási smoke: **PASS** (12 mp futás, renderer runtime error nélkül);
- fizikai Windows E2E az első felhasználói indításkor következik.
- DEV letöltési staging útvonal: `/downloads/benjadmin-chatgrid/BENJADMIN-ChatGrid-0.1.0-Windows-x64.exe`;


## v0.2.0 — ChatGrid kibővített desktop munkatér

Dátum: 2026-08-20

### Végleges 2×2 worker sorrend

- bal felső: **BenAI**;
- jobb felső: **OutminAI**;
- bal alsó: **ÁrminAI**;
- jobb alsó: **JázminAI**.

A v0.1 konfiguráció worker-kód alapján migrálódik, ezért a már beállított ChatGPT-csevegés URL-ek a megfelelő kódmérnöknél maradnak.

### ChatGPT zoom

Mind a négy worker-cella és az ötödik központi csevegő saját 50–150% zoomot kap 10%-os lépésekben. A fejlécben `− / % / +` vezérlők vannak; a worker ChatGPT view-kban `Ctrl+-`, `Ctrl++`, `Ctrl+0` is használható. A zoomérték konfigurációban megmarad.

### Világos / sötét mód

A ChatGrid shell külön világos és sötét témával rendelkezik. A téma a fejlécből és a Beállításokból kapcsolható, perzisztensen tárolódik. A ChatGPT webes tartalom saját ChatGPT témabeállítását követi.

### 5. központi csevegő

Külön `centralChat` konfiguráció készült `DIMPRO / DIMPROVER Központ` alapnévvel. A panel középre nyílik, teljes használható magasságban, kb. 52% szélességgel, így a bal és jobb szélső területek láthatók maradnak. Saját ChatGPT URL, zoom, mikrofon, újratöltés és elrejtés vezérlő tartozik hozzá.

### Végleges globális gyorsbillentyűk

- `Ctrl+Alt+Space` — teljes ChatGrid tálcára rejtése / visszahozása; visszahozáskor normál 4 cellás nézet;
- `Ctrl+Alt+1` — BenAI teljes cella ↔ 4 cellás nézet;
- `Ctrl+Alt+2` — OutminAI teljes cella ↔ 4 cellás nézet;
- `Ctrl+Alt+3` — ÁrminAI teljes cella ↔ 4 cellás nézet;
- `Ctrl+Alt+4` — JázminAI teljes cella ↔ 4 cellás nézet;
- `Ctrl+Alt+5` — központi DIMPRO / DIMPROVER csevegő megjelenítés / elrejtés;
- `Ctrl+Alt+0` — szándékosan fenntartva későbbi funkciónak, jelenleg nincs regisztrálva.

A gyorsbillentyűk Electron `globalShortcut` regisztrációval működnek, ezért a ChatGPT WebContentsView fókusza mellett is elérhetők.

### Worker értesítések

A BENJADMIN live kapcsolat `completed`, `blocked` és `failed` állapotátmeneteket külön eseményként kezeli. A ChatGrid külön hangmintát ad a kész, blokkolt/döntést kérő és hibás eseményhez. Megmarad a Windows értesítés, tálcavillogás és opcionális magyar TTS.

### BENJADMIN élő státuszkapcsolat

A korábbi félreérthető `BENJADMIN kulcs szükséges` felirat helyett a UI ezt írja: `BENJADMIN élő státuszkapcsolat nincs beállítva`. A reporter kulcs nem ChatGPT-jelszó és nem ChatGrid-jelszó; kizárólag a worker-státuszok, moduladatok és események hitelesített lekérésére szolgál, és Electron `safeStorage` segítségével kerül helyi titkosított tárolásra.

### DEV kiadás

A Windows portable EXE mellett kötelezően készül külön DEV ZIP is. A DEV ZIP tartalmazza a teljes `desktop/benjadmin-chatgrid` forrásfát, `package.json`, `package-lock.json`, acceptance teszteket, `DEV_BUILD.md`, `build-windows.cmd` és ezt a termékdokumentációt. `node_modules` és korábbi `dist` artifactok nem kerülnek a DEV ZIP-be; `npm ci` után újraépíthető.

### v0.2.0 célzott acceptance

Eredmény: **52/52 PASS**.

Újonnan ellenőrzött területek: worker-sorrend és migráció; 5. központi chat; globális gyorsbillentyűk; tálcára/vissza 4-grid reset; zoom; világos/sötét téma; mikrofon audio-only engedély; completed/blocked/failed eseményhangok; `Ctrl+Alt+0` fenntartása.

### v0.2.0 Windows artifact

- fájl: `desktop/benjadmin-chatgrid/dist/BENJADMIN-ChatGrid-0.2.0-Windows-x64.exe`;
- méret: 92,527,611 byte;
- SHA-256: `7274709b20ef7e757c770aa4ad32e251e4c7c48f879fc871ea135424d57a4957`;
- Windows x64 portable build: **PASS**;
- teljes DEV quality gate: **PASS**;
- PROD nem módosult.


## v0.2.1 — Windows E2E visszajelzés utáni javítások

Dátum: 2026-08-20

A fizikai Windows teszt alapján a `Ctrl+Alt+Space` működött, de a számbillentyűs globális shortcutok nem minden esetben regisztrálódtak. A v0.2.1 ezért minden ChatGPT `WebContentsView` `before-input-event` útvonalán és a shell rendererben is helyi fallback shortcutkezelést kapott.

A Chromium az azonos `chatgpt.com` origin zoomját közös sessionben megoszthatja, ezért a félrevezető cellánkénti zoomvezérlés megszűnt. A zoom egységes, fő fejlécből állítható workspace-zoom lett.

Új 2 hasábos mód készült. A felső sávban a bal és jobb hasábhoz a négy worker-csevegő közül külön választható aktív csevegő; ugyanaz a chat nem választható mindkét oldalra. A 4/2 mód `Ctrl+Alt+6`-tal és fejlécgombbal kapcsolható.

A négy cella metszéspontján külön erős színű `+` gomb nyitja az ötödik központi DIMPRO / DIMPROVER csevegőt. A natív ChatGPT view-k között 18 px középső rés biztosítja, hogy a gomb kattintható maradjon.

Célzott acceptance: **58/58 PASS**.

### v0.2.1 Windows artifact

- `BENJADMIN-ChatGrid-0.2.1-Windows-x64.exe`
- méret: 92,529,825 byte
- SHA-256: `45052c9cd568881fd1558f60199c178275fd398b013dd52457eff8e167a137c7`
- Windows x64 portable build: **PASS**


## v0.2.2 — vékony cellakeret és lebegő központi plusz

A Windows E2E visszajelzés alapján a v0.2.1 18 px-es keresztirányú gap túl sok munkaterületet vett el. A v0.2.2 visszaállítja a 2 px-es cellaelválasztást. A központi `+` külön 24×24 px-es transparent child BrowserWindow overlay, benne 18×18 px-es hover gombbal. Így a plusz a natív ChatGPT WebContentsView-k fölött kattintható, de nem kell teljes vízszintes és függőleges sávot fenntartani számára.

Célzott acceptance: **60/60 PASS**.

### v0.2.2 Windows artifact

- `BENJADMIN-ChatGrid-0.2.2-Windows-x64.exe`
- méret: 92,531,642 byte
- SHA-256: `17017241475eddcdfee56a2c8d0762786166563df66c6f82339eff27b721b7db`
- Windows x64 portable build: **PASS**


## v0.2.3 — BENJADMIN élő státusz device pairing

Dátum: 2026-08-20

A korábbi statikus reporter kulcs helyett a normál ChatGrid használat egyszer használatos Windows-eszköz párosításra áll át. A meglévő BENJADMIN Windows Bridge pairing core kerül újrahasznosításra, de a ChatGrid nem kap PowerShell-capabilityt és nem használ execution endpointot.

Flow: admin web pairing kód → desktop claim → admin jóváhagyás → claim poll → egyszer kiadott device token → Windows safeStorage → dedikált `/api/dev/chatgrid/live` read-only státuszpolling.

A ChatGrid token nem kerül be az általános reporter/admin authentikációba. A read-only route külön `x-benjadmin-chatgrid-device-token` headert használ, és csak aktív `chatgrid-*` agenthez tartozó device tokent fogad.

A párosítási weboldal: `/admin/dev-console/chatgrid-pairing`. Az oldal csak BENJADMIN admin kulccsal hozhat létre pairinget és csak explicit emberi gombnyomással hagyhat jóvá eszközt. A szerveroldali Windows Bridge execution flag ChatGrid aktiválásnál OFF marad.

A v0.2.3-ban a központi plusz normál állapotban keret nélküli; a 24×24 px kattintási overlay megmarad, de vizuálisan csak a 18 px-es `+` látszik, keret/glow kizárólag hover/fókusz alatt jelenik meg.

Célzott ChatGrid acceptance: **71/71 PASS** a végleges artifact build előtti forrásellenőrzésen.


## v0.2.4 — státuszprioritás és plusz-középpont

Dátum: 2026-08-20

Az aktív task státusz (`claimed`, `in_progress`, `testing`, `ready`) magasabb prioritású a worker-presence `active=false` jelzésénél. Ezzel megszűnik az ellentmondásos `INAKTÍV` + `IN_PROGRESS` megjelenés. A részletes work stage továbbra is felülírhatja a generikus `AKTÍV` címkét (`TESZTEL`, `BUILD`, `LEZÁRÁS`).

Az eseményértesítések csak a négy ChatGrid cellában konfigurált workerre reagálnak, így más BENJADMIN worker nem csörgeti meg a desktop klienst.

A középső 5. chatet nyitó `+` mini overlay Windows pozíciója korrigálva lett: a vizuális középpontja a négy cella tényleges metszéspontjára kerül.


## v0.2.5 — autostart, legutóbbi chat és külön központi ablak

Dátum: 2026-08-21. A Windows portable kiadás tartós LocalAppData példányt regisztrál autostarthoz. A négy worker-cella és az ötödik központi chat automatikusan megőrzi a legutóbbi konkrét ChatGPT conversation URL-t. A worker cellák opcionális best-effort névfelismerése a `YYMMDD_sorszám_Kódmérnök` sémára épül. Az ötödik BENJADMIN chat külön natív, mozgatható, átméretezhető/maximalizálható Windows ablak, F11 teljes képernyő támogatással.

## v0.2.6 — Worker Task Launch

Dátum: 2026-08-21. A BENJADMIN task kiosztása és a worker ChatGPT tényleges indítása most külön életcikluslépés. Új, még el nem kezdett `ready` / `claimed` tasknál a megfelelő ChatGrid cella `INDÍTÁSRA VÁR` jelzést és `Indítás` gombot kap. A gomb explicit BenjAdmin műveletre fókuszálja a worker csevegőt és előkészíti a taskból generált teljes DEV-only promptot. A ChatGrid nem küldi el automatikusan az üzenetet; a végső küldés emberi kattintás marad. Meglévő ChatGPT draftot nem ír felül, ilyen esetben vágólapos fallbacket használ. Az előkészítés helyi, promptmentes task-launch rekordban megmarad, és a live felület `CHAT ELŐKÉSZÍTVE / ELLENŐRIZD · KÜLDD EL` állapotot mutat.

DEV artifact: `desktop/benjadmin-chatgrid/dist/BENJADMIN-ChatGrid-0.2.6-Windows-x64.exe`, 92,541,986 byte, SHA-256 `392cf2e56325eabf0b182a7fde5f7e538229ea1bc8a9c3c2fe38cb98a4bee8f3`. Célzott acceptance: **90/90 PASS**. A fizikai Windows E2E a ChatGPT aktuális composer DOM-jával még hátravan.

## v0.2.7 — napi indítás, azonosítható workerek és megbízható értesítés

Dátum: 2026-08-21. A végleges ChatGrid sorrend `01 BenAI`, `02 OutminAI`, `03 ÁrminAI`, `04 JázminAI`, `05 BenjAdmin`. A napi csevegések `YYMMDD_sorszám Név – leírás` névsémát követnek. A `NAPI INDÍTÁS` BenAI-nak DEV állapotfelvételi promptot készít, amely a BENJADMIN élő állapot, git/worktree, központi műveleti lock, PM2 runtime és a worker `*_LATEST.md` handoffok alapján rekonstruálja az előző munkanapot.

A cellafejlécek canonical BENJADMIN avatárt, erősebb státusz-pillt, aktív modul-jelvényt és cellánkénti beállításgombot kaptak. Kapcsolható, `pointer-events:none` háttér-vízjel kerülhet a ChatGPT nézet fölé. Light módban a státuszok és a stage-jelzés kontrasztja nőtt, a stage betű 10 px.

`Ctrl+Alt+Z` globális és helyi fallback útvonalon zárja a munkateret. Az értesítési réteg tartós Web Audio kontextust használ; teljes taskhoz és stage-előrelépéshez külön hang tartozik, a magyar TTS v6 migráció után alapból aktív. A fájlcsatolásnál a `fileSystem` engedély csak `chatgpt.com` read-only, nem könyvtár hozzáférésére adható.

Célzott acceptance a build előtt: **104/104 PASS**. Fizikai Windows E2E szükséges a natív fájlválasztó, audio/TTS, háttér-vízjel és aktuális ChatGPT composer DOM ellenőrzésére. PROD változtatás nincs.

DEV Windows artifact: `desktop/benjadmin-chatgrid/dist/BENJADMIN-ChatGrid-0.2.7-Windows-x64.exe`, 92,979,372 byte, SHA-256 `a8162725d82495be6838f25d4f307799b4bdc1ef15f716fa8ec40dfca3970dd4`. Windows x64 portable build: **PASS**.
