# Developer Grid: indítás és átadás forrásjavítása

Dátum: 2026-10-23, Europe/Budapest. DEV ONLY · PROD DENY.
Kézi, nyomon követhető feladat: MANUAL-CODEX-GRID-LAUNCH-HANDOFF-20261023.
Felelős: Codex. Forrásbázis: bc6e82fc89a81f88c6730d1e09b30c9246e6dda9.
Ág: codex/grid-launch-handoff-20261023.
Worktree: /srv/dimpro-dev/worktrees/codex-grid-launch-handoff-20261023.

## Igazolt hibák és változások

- A fizikai Windows kliens 0.1.100, de az app.asar-ból olvasott auto-work-start.cjs még a régi, asszisztensszövegből is következtető modulválasztást tartalmazza. A bc6e82fc8 forrásjavítás még nincs ebben az EXE-ben.
- A HANDOFF_ASSISTANT_SCRIPT String.raw sablonjában a marker nélküli V2 és a régi átadó felismerése duplán escape-elte a whitespace regexeket. Ezek most tényleges whitespace-t keresnek.
- Generálás alatt nincs menthető átadó és nincs recovery-prompt beszúrás. A már folyamatban levő válasz végét meg kell várni.
- A handoff parser és a handoff műveletek egységesen kezelik a BENJAMINAI/BENAI aliasokat. Más worker továbbra sem fogadható el ugyanennek a workernek.
- A legutolsó USER protokollüzenet nem jogosít korábbi emberi fejlesztési utasítás újrajátszására.
- A transcript 500 üzenetes kerete a legutolsó 500 üzenetet tartja meg, így hosszú chatben a friss felhasználói utasítás is megmarad.
- Az Execution Bridge ellenőrzi a proof teljes SHA-tartalmát, READY/PROD DENY állapotát és provenance-kötését; a Dev Engine task/session/worker/project/DEV-környezet és aktuális task ownership egyezését is újra ellenőrzi. A meglévő BOOT ACK, lease, scope, Git HEAD és branch védelmek megmaradnak.
- Két elavult statikus tesztelvárást a jelenlegi exact session lookuphoz és a task/session/HEAD-hez kötött recovered proof fallbackhez igazítottunk. A teszteket nem töröltük.

## Validáció és határok

- Indítás/átadás futásidejű regresszió: 18/18 PASS.
- Execution Bridge izolált futásidejű security: 38/38 PASS.
- Execution Bridge korábbi kontraktus: 36/36 PASS.
- Chat auto work-start: 24/24 PASS.
- Central Core recovery: 7/7 PASS; BOOT ACK turn identity: 10/10 PASS; RUNNING BOOT ACK resume: 4/4 PASS.
- Teljes TypeScript: PASS, --noEmit --incremental false, a végső ownership-módosítás után is.
- Teljes lint: 0 hiba, az első futásban 104 figyelmeztetés. Az új teszt egy unused figyelmeztetését ezután javítottuk; az összes érintett lintelt fájl célzott lintje 0 hiba / 0 figyelmeztetés.
- Teljes desktop npm run check: 1038 PASS sor után RELEASE_DIST_NEXT_ROOT_MISSING. Ez nem teljes suite PASS. A worktree-ben nincs ebből a forrásból készült .next kiadási build.
- A futásidejű tesztek a tényleges DOM-scriptet és a TypeScriptből fordított valódi validációs kódot futtatják szintetikus, izolált függőségekkel. Nem fizikai Windows/DEV-adatbázis E2E bizonyítékok.
- Külön npm run check:runtime futtatható; a teljes check is ezzel indul.

## Élő állapot és kiadás

A fizikai Windows UI korábbi/elavult munkát és SOURCE_BASELINE_MISMATCH / AUTHORITATIVE_STATE_OLDER_THAN_72H állapotot mutatott. A sessionök nem lettek átírva, lezárva vagy másik csevegéshez átkötve.

A forrásváltozás önmagában nem frissíti a telepített EXE-t vagy a DEV runtime-ot.
Az új kiadási build/csomag, artifact-hash, rollback és a fizikai indítás → BOOT ACK → engedélyezett DEV-olvasás → eredmény → átadás/folytatás próba külön bizonyítandó.
Nincs merge, PROD módosítás, adatbázismigráció, aktív runtime-csere vagy PM2/Nginx újraindítás.

## Visszaállítás

A javítás az elkülönített codex ágon készül. A működő EXE és runtime jelenleg egyben rollback pont. Forrásszinten a bázis bc6e82fc8; a javító commit szükség esetén külön revert commitban visszavonható. Más worker állapotát ehhez nem kell módosítani.

## Csomagolási függőségek utóellenőrzése

A Windows packaging audit Electron 43.6.0 moderate és http-cache-semantics 4.2.0 high találatot adott. Az Electron exact verzióját 43.8.3-ra emeltük; a cache-függőség 4.3.0-ra frissült a meglévő kompatibilis tartományban. electron-builder változatlanul 26.15.3. A dependency security contract megőrzi a brace-expansion patch-ellenőrzéseket és az új verziókat is számon kéri. A frissített desktop dependency audit: 0 sérülékenység. Az első c88c29b5f build nem tekinthető az új függőségi commitból készült végleges artifactnak; a kiadási provenance-hez új build kell.

Ellenőrzött források: https://github.com/electron/electron/releases/tag/v43.8.3 ; https://github.com/electron/electron/security/advisories/GHSA-fw47-9c62-h3vw ; az npm registry Electron 43.8.3 és http-cache-semantics 4.3.0 csomagmetaadatai; a tényleges npm audit kimenete.

## Teljes kliensellenőrzés tényleges kiadási builddel

A BUILD01 cfdfc76fb forrásból készült buildje PASS: BUILD_ID yDmRPZroi8FZ6H22BVySj, tarball SHA-256 bca53272d3e6baed63133b7b15cd53bd57de31acc43956c63c1f447061bbeebe. Az izolált worktree-be csak hash- és metadata-ellenőrzés után került.
A teljes kliens npm run check ezután egy további, a chat-refresh contractban maradt 43.6.0 Electron pinre jelzett. Ezt a 43.8.3 security patchhez igazítottuk; további régi 43.6.0 pin a desktop/scripts forrásban nincs. A teljes npm run check most PASS, így a korábbi RELEASE_DIST_NEXT_ROOT_MISSING környezeti akadály tényleges builddel feloldódott. A végső commit új csomagolási provenance-éhez külön, exact HEAD build szükséges; régebbi artifactot nem címkézünk át.
A BUILD02 kérést DEV_STORAGE_ADMISSION_BLOCKED állította meg: a 2026-10-07-i dev-storage-freeze.json még ACTIVE. A tiltás változatlan maradt; BUILD01 a megfelelő, működő útvonal.


## Fizikai próba: új ChatGPT üzenetszerkezet – 2026-10-23

A tulajdonos elindította a 0de6740a Windows jelöltet, majd kifejezetten ÁrminAI vagy BenjáminAI használatát kérte négycellás nézetben. BenjáminAI új, elkülönített projektcsevegésében a GRID-E2E-20261023-BENAI, kizárólag állapotellenőrző próbaüzenet megérkezett. A válasz WAITING_FOR_LAUNCH_PACKET állapotot jelzett; nem érkezett új Grid Launch Packet. Ez nem sikeres BOOT ACK/E2E.

A próbacsevegés Chrome-ból végzett csak olvasási DOM-vizsgálata igazolta: nincs [data-testid^="conversation-turn-"] és nincs [data-message-author-role]. Az új felület USER/ASSISTANT egységeit a data-chatgpt-search-unit-key és data-chatgpt-search-message-ids attribútumok jelölik; az assistant külön h4[data-conversation-role] címkét is ad. A korábbi közös DOM-adapter így nulla üzenetet látott, és az automatikus indítás még az intent-felismerés előtt visszatért.

A DOM-adapter 1.1.1 támogatja a megfigyelt új szerkezetet, stabil üzenetazonosítással, duplikációszűréssel és valódi DOM-sorrenddel a vegyes régi/új szerkezetben. A szerepet strukturális attribútumokból olvassa; ismeretlen vagy ellentmondó szerep nem válhat felhasználói utasítássá. A régi formátum, az 500 legfrissebb üzenet korlátja és a generálás alatti átadás tiltása megmarad. Tizenhárom új futásidejű regressziós eset fedi a megfigyelt szerkezetet. A frissített fizikai Windows-próba az új csomag indítása után szükséges.

A célzott új futásidejű ellenőrzés 31/31 PASS, a DOM-adapter kontraktus 23/23 PASS. A teljes kliens check 1075 PASS sorral és 0 kilépési kóddal futott a korábbi valódi 0de6740a kiadási dist használatával; ez a tesztek végrehajtását igazolja, nem az új commit csomagolási provenance-ét. A következő Windows csomaghoz új exact-HEAD BUILD01 artifact szükséges.
