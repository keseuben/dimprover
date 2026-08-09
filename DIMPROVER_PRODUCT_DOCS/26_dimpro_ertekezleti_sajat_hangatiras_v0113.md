# DIMPRO Értekezleti Asszisztens – saját hangrögzítés és beszélőkre bontott átírás v0.1.13

Dátum: 2026-07-23

## Cél

Az Értekezleti Asszisztens a Microsoft Teams értekezletek mellett személyes értekezleteket is kezel. A felhasználó az értekezlet létrehozásakor először módot választ:

- `teams` – Microsoft Teams értekezlet;
- `in_person` – személyes értekezlet.

A két mód közös jegyzőkönyvi és dokumentumkezelési motorra épül, de csak a kiválasztott értekezlettípushoz tartozó integrációs funkciókat mutatja.

## Értekezletmód

Új adatmező:

```ts
meetingMode: "teams" | "in_person"
```

A munkatér adatformátuma `version: 8` értékre emelkedett. A korábbi munkaterek kompatibilitási okból alapértelmezetten `teams` módot kapnak.

### Teams mód

Megjelenik:

- Microsoft Graph átiratkapcsolat;
- Entra szervezőazonosító;
- Graph `onlineMeeting` azonosító;
- Teams átiratszinkronizálás;
- Teams jelenléti jelentés;
- Teams-stage és Teams-specifikus funkciók;
- kézi VTT/DOCX/TXT import;
- opcionális tartalék DIMPRO hangrögzítés és átírás.

### Személyes mód

Megjelenik:

- DIMPRO mikrofonrögzítés;
- hang- vagy videófájl feltöltése;
- beszélőkre bontott átírás;
- Beszélő A/B/C címkék és valós név párosítás;
- beszélőcímkék összevonása;
- szervezeti hangprofilok;
- kézi résztvevőkezelés;
- kézi VTT/DOCX/TXT import;
- AI Dokumentumműhely.

Nem jelenik meg:

- Graph `onlineMeeting` azonosító;
- Entra szervezőazonosító;
- Teams jelenléti jelentés;
- Teams-stage beállítás;
- Teams-specifikus Graph figyelmeztetés.

A mód később módosítható. Mentés előtt a felület figyelmeztet, hogy az elérhető integrációs funkciók megváltoznak; a korábban rögzített adatok nem törlődnek.

## Saját mikrofonrögzítés

A személyes értekezlet átiratpaneljén a `Hangrögzítés indítása` gomb a böngésző MediaRecorder API-ját használja.

Felvétel közben látható:

- pulzáló piros rögzítési állapot;
- `Felvétel folyamatban` felirat;
- eltelt idő;
- `Elvetés`;
- `Leállítás és átírás`;
- az addigi időtartam alapján számított tájékoztató költségbecslés.

Az MVP nem készít szó közbeni élő feliratot. A diarizált átírás a felvétel leállítása után indul.

## Hang- és videófájl feltöltése

Támogatott fő formátumok:

- MP3;
- MP4;
- M4A;
- WAV;
- WEBM;
- OGG;
- FLAC;
- MOV;
- MKV;
- AVI;
- AAC.

A maximális fájlméret konfigurálható:

```env
MEETING_AUDIO_MAX_MB=500
```

A szerver a jogosultságot a nagy médiafájl beolvasása előtt ellenőrzi. A feltöltés Busboy-alapú streaming feldolgozással történik, ezért a teljes fájl nem kerül egyetlen memóriapufferbe.

A videóból az FFmpeg automatikusan kinyeri a hangot. A feldolgozási formátum:

- 16 kHz;
- mono;
- 64 kbit/s MP3;
- 900 másodperces, vagyis körülbelül 15 perces részek.

A részek időbélyegei globális értekezleti időbélyeggé állnak össze.

## Háttérworker

A médiafeldolgozás külön Node-folyamatban fut:

```text
scripts/process-meeting-transcription-job.cjs
```

A worker:

1. beolvassa a `job.json` fájlt;
2. FFmpeg segítségével normalizálja és darabolja a médiát;
3. meghívja a diarizált átírási API-t;
4. összeállítja a beszélőket és az időbélyeges sorokat;
5. rövid beszélőmintákat készít;
6. védett belső callback API-n menti vissza az eredményt;
7. alapértelmezetten törli a teljes forrásfájlt, normalizált hangot és darabokat.

Környezeti változók:

```env
MEETING_AUDIO_TRANSCRIPTION_MODEL=gpt-4o-transcribe-diarize
MEETING_TRANSCRIPTION_INTERNAL_URL=http://127.0.0.1:3000
MEETING_TRANSCRIPTION_WORKER_SECRET=<titkos érték>
```

A callback hitelesítése konstans idejű titkoskulcs-összehasonlítást használ. Csak a konkrét értekezlet és job könyvtárának `result.json` fájlja fogadható el.

## Beszélők kezelése

Az ismeretlen technikai beszélők `Beszélő A`, `Beszélő B`, `Beszélő C` formában jelennek meg.

A szervező:

- valós nevet adhat a beszélőhöz;
- a nevet egyszerre minden kapcsolódó átiratsorra alkalmazhatja;
- több technikai beszélőcímkét egy valós személybe összevonhat;
- rövid hangmintát hallgathat meg;
- soronként javíthatja a beszélőt, szöveget és megoszthatóságot;
- átiratsort törölhet.

## Tartós szervezeti hangprofil

Hangprofil csak külön hozzájárulással menthető. Kötelező szöveg:

> Az érintett személy hozzájárult, hogy rövid hangreferenciája későbbi DIMPRO beszélőazonosításhoz elmentésre kerüljön.

A profil tartalmazza:

- név;
- e-mail;
- szervezet;
- rövid referenciahang;
- hozzájárulás ideje és rögzítője;
- forrásértekezlet;
- létrehozás, módosítás és utolsó használat;
- használatszám;
- aktív/inaktív állapot.

A profil szervezeti szintű, nem projekthez kötött. A következő értekezlet résztvevőinek neve és e-mail-címe alapján felajánlható. Feldolgozásonként legfeljebb négy ismert profil adható át.

A profil:

- kikapcsolható;
- újraaktiválható;
- véglegesen törölhető;
- létrehozása, állapotmódosítása és törlése auditált.

Auditfájl:

```text
.dimprover/data/meeting-assistant/voice-profiles/audit.jsonl
```

A tartós profil külön könyvtárban marad, ezért a forrásértekezlet törlése nem törli. A profil végleges törlése a referenciahangot is eltávolítja.

## Költségbecslés és tényleges költség

A felület a média időtartama alapján indítás előtt tájékoztató Ft-becslést mutat.

Konfiguráció:

```env
MEETING_AUDIO_ESTIMATED_USD_PER_MINUTE=0.025
MEETING_AUDIO_INPUT_USD_PER_MILLION=2.5
MEETING_AUDIO_OUTPUT_USD_PER_MILLION=10
MEETING_AUDIO_USD_HUF_RATE=319
```

A becslés és a tényleges költség külön mező. Feldolgozás után a worker az API-válasz input- és output-tokenjeiből számítja ki és menti:

- `actualInputTokens`;
- `actualOutputTokens`;
- `actualCostUsd`;
- `actualCostHuf`.

Titkos kulcs vagy belső fájlútvonal nem kerül a kliensválaszba vagy exportba.

## Biztonság és adatvédelem

- mikrofon csak felhasználói gombnyomásra indul;
- a rögzítési állapot egyértelműen látható;
- médiafeltöltés és hangprofilkezelés csak szervezői jogosultsággal használható;
- teljes forrásfelvétel alapértelmezetten törlődik;
- referenciahang csak külön hozzájárulással marad meg;
- a worker callback külön titokkal védett;
- public export nem tartalmaz job ID-t, belső útvonalat, referenciahangot vagy hangprofilazonosítót;
- profil-létrehozás és -törlés auditált.

## Ellenőrzések

### Statikus és buildellenőrzés

- `npx tsc --noEmit`: sikeres;
- `npm run lint`: 0 hiba, 112 korábbi figyelmeztetés;
- production build: sikeres;
- standalone szerver és statikus csomag: ellenőrizve;
- PM2 folyamat: online.

### Média- és worker-ellenőrzés

- FFmpeg 7.0.2 static: sikeres;
- 901 másodperces forrás: 16 kHz/mono normalizálás sikeres;
- 900 másodperces darabolás: pontosan 2 rész;
- MP4 videóból hangkinyerés: sikeres;
- mock worker E2E: 3 beszélő, 3 sor, callback és automatikus fájltörlés sikeres.

### Valódi diarizálási API-teszt

Mesterséges, két beszélős magyar hangmintával:

- HTTP 200;
- 2 beszélő felismerve;
- ismert beszélőreferenciák név szerint felismerve;
- éles teljes munkafolyamatban 2 beszélő és 8 átiratsor;
- valós átnevezés, összevonás, sorszerkesztés és sortörlés sikeres;
- input token: 496;
- output token: 991;
- számított költség: 0,01115 USD, 3,55685 Ft.

### Hangprofil-életciklus

35/35 éles API-ellenőrzés sikeres, többek között:

- hozzájárulás nélküli profilmentés elutasítva;
- hozzájárulásos mentés sikeres;
- következő értekezletnél felajánlás sikeres;
- kikapcsolás és újraaktiválás sikeres;
- értekezlettörlés után profil megmaradt;
- végleges profiltörlés és audit sikeres.

### Böngészős UI

- Teams/személyes mód szétválasztása: 12/12 sikeres;
- személyes módban Graph-funkciók rejtve;
- Teams módban Graph-funkciók láthatók;
- kézi import mindkét módban elérhető;
- Teams módban saját rögzítés tartalékként látható;
- módváltási figyelmeztetés ellenőrizve;
- MediaRecorder mesterséges mikrofonforrással elindult;
- rögzítési állapot és időszámláló működött;
- elvetés után alapállapot visszaállt.

### Korábbi regressziók

10/10 releváns értekezleti tesztcsomag sikeres:

- nyomva tartásos törlés;
- kezdőoldali létrehozás;
- preview token;
- v0.1.5 teljes workflow;
- szerepkörök és Teams átirat;
- jelenléti ív és napirend;
- lezárás és archiválás;
- editor mód;
- projekt- és értekezlettörlés;
- Teams-kollaboráció.

## Üzemeltetési megjegyzés

A buildet nem szabad futó standalone PM2-folyamat mellett ugyanabba a `.next` könyvtárba írni, mert a futó szerver részben frissült manifesteket olvashat. Biztonságos sorrend:

1. kész forrás- és buildbackup;
2. alkalmazás leállítása vagy elkülönített buildkönyvtár használata;
3. production build;
4. standalone statikus/public fájlmásolás;
5. csomagellenőrzés;
6. PM2 indítás;
7. HTTP és API smoke ellenőrzés.

## Backupok

- forrásfájlok: `backups/meeting-mode-native-transcription-20260723_151023`;
- környezeti fájl: `backups/.env.local-before-meeting-transcription-20260723_151608`;
- korábbi production build: `backups/dimprover-next-before-meeting-native-20260723_154012.tar.gz`;
- korábbi átadási backup: `backups/meeting-native-transcription-20260723_140355`.

## Fejlesztési szint

A v0.1.13 saját hangrögzítési és diarizált átírási MVP production állapotban van.

Későbbi fejlesztési kör:

- valós idejű streamelt felirat;
- külön admin hangprofil-kezelő oldal;
- egységes nyomva tartásos hangprofil-törlés;
- felhasználói/projekt/havi AI-költségkeret;
- OpenAI szervezeti usage/cost API-val történő utólagos számlaegyeztetés;
- részletes feldolgozási adminmonitor és újraindítási lehetőség.
