# 176 — BENJADMIN Fejlesztői Konzol V1

Dátum: 2026-08-12  
Állapot: DEV első teljes napi használatú V1 blokk  
Kapcsolódó alapok: BENJADMIN B3 / B3.1 / B3.2

## Cél

A BENJADMIN háttérben működő Development Center, Control Plane és Partner Plane motorjaira épülő, napi használatú ember–AI fejlesztési együttműködési felület. A Konzol nem új párhuzamos fejlesztési engine: a meglévő task / worker / session / build / approval / audit adatokat jeleníti meg, és BENJADMIN vezetői utasításból szabályos DEV taskot tud létrehozni.

## Felület

Új útvonal: `/admin/dev-console`.

A fő BENJADMIN admin fejlécében külön Fejlesztői Konzol gomb nyitja meg a felületet külön, újrahasználható böngészőablakban. Popup blokkolás esetén normál route navigáció történik.

Desktop elrendezés:

- bal oldal: projekt- és feladatmunkatér;
- közép: közös fejlesztői beszélgetési idővonal;
- jobb oldal: élő worker / task / build / approval állapot;
- alsó külön sáv: Outmin-AI partner fejlesztési sík;
- legalsó BENJADMIN composer: címzett, feladatképzés, vezetői döntés, projekt, szöveges utasítás és küldés.

A beszélgetés vizuális szereposztása:

- Ármin-AI balra igazítva;
- Ben-AI középre igazítva;
- Jázmin-AI jobbra igazítva;
- BENJADMIN középen, `VEZETŐ` kiemeléssel;
- Outmin-AI a belső beszélgetéstől elkülönített partner sávban.

Minden emberi és AI-bejegyzés mellett a saját hexagon avatar jelenik meg.

## BENJADMIN alsó beviteli terület

A felhasználói igény alapján a BENJADMIN hexagon avatar a composer bal oldalán saját oszlopot kap. Az avatar blokk egyszerre nyúlik bele:

1. az AI-címzettek / beállítások felső sorába;
2. az alsó szövegbeviteli mező sorába.

Desktopon a látható avatar kb. 66–70 px, mobilon adaptívan kisebb. A blokk egyértelműen jelzi, hogy az alsó vezérlősáv a BENJADMIN emberi vezető beviteli területe.

## Élő frissítés

Az oldal nem töltődik újra másodpercenként.

- első betöltéskor snapshot;
- utána SSE stream;
- állapotváltozáskor csak az érintett React state / komponens frissül;
- 15 másodperces heartbeat;
- streamhiba esetén 2 másodperces fallback polling;
- exponenciális visszacsatlakozás;
- a kliensóra és eltelt idők helyben, másodpercenként frissülnek;
- a felhasználó korábbi üzenetre visszagörgetésekor az új események nem rántják vissza automatikusan az aljára.

## ChatGPT Parancstár

A Konzol felső sávjából nyitható teljes parancstár készült. Tartalmazza többek között:

- START read-only állapotfelmérés;
- DEV START;
- checkpoint folytatás;
- fejlesztési állapotkérés;
- biztonságos megállás;
- csak audit / read-only;
- DEV lezáró build / teszt / restart;
- dokumentációfrissítés;
- új csevegéshez komplett átadó;
- DIMPRO Drive, Drop, Projektkapu és BENJADMIN modul sablonok;
- release candidate audit;
- külön, veszélyjelzéssel és megerősítéssel védett PROD explicit műveleti sablon.

Minden parancs mellett másolás gomb található. Az aktuális munkamenetből dinamikus folytatási prompt készül branch / HEAD / build / worktree / projekt / kötelező segédanyag kontextussal. Titok nem kerül a promptba.

## Fejlesztési Tár

Új DEV fájltár készült fejlesztést segítő anyagokhoz:

- PDF;
- kép / logó;
- ZIP;
- szöveg / Markdown;
- JSON / CSV / kódjellegű fájlok.

Funkciók:

- drag & drop és fájlválasztás;
- modul, cím, verzió, leírás, címke, prioritás;
- `Kötelezően olvasandó fejlesztés előtt` jelölés;
- SHA-256 tárolás és visszaolvasáskor hash ellenőrzés;
- max. 20 fájl / feltöltés;
- max. 50 MB / fájl;
- tiltott végrehajtható kiterjesztések;
- ZIP automatikus futtatása / kibontása nincs;
- előnézet / letöltés csak admin authon keresztül;
- ChatGPT-átadó szöveg másolása;
- nem destruktív archiválás.

Jelenlegi backend: dedikált DEV local staging (`/srv/dimpro-dev/data/benjadmin-dev-resources`). A Drive motor elkészülésekor adapterrel DIMPRO Drive tárhelyre vihető; a kliens UI-t nem kell újraírni.

## Megjelenési módok

Három teljes mód működik és localStorage-ban megmarad:

- Világos;
- Sötét;
- Sunlight.

A Sunlight külön nagy környezeti fényre optimalizált, erősebb kontrasztú változat.

2026-08-12 esti vizuális visszajelzés alapján a teljes Konzol tipográfiája növelve lett. Kiemelten:

- chat főszöveg 13 px;
- composer szöveg 13 px;
- projekt- és élő munkapanelek kulcsszövegei 11–13 px;
- parancstár és drawer tartalmak nagyobb olvashatóságot kaptak.

A cél az egyensúly: nagy monitoron adatsűrű maradjon, laptopon ne legyen apró.

## PWA / telepítés

Külön manifest: `/benjadmin-console.webmanifest`.

- start URL: `/admin/dev-console`;
- `display: standalone`;
- Windows / tablet / telefon PWA alap;
- meglévő BENJADMIN PWA / push kontroll újrahasznosítva.

## Privacy cover

A Konzolból is működik a meglévő `Ctrl + Alt + Space` takaróképernyő. A Konzol saját eseményt küld az AdminThemeShellnek, ezért a biztonsági viselkedés egységes marad.

## API-k

Új DEV-only admin API-k:

- `GET /api/dev/console/context`
- `GET /api/dev/console/live`
- `GET|POST /api/dev/console/messages`
- `GET|POST|PATCH /api/dev/console/resources`
- `GET /api/dev/console/resources/[id]`
- `GET /api/dev/console/stream`

Minden route admin authot kér. A runtime context nem ad vissza service-role kulcsot, licenckulcsot, jelszót vagy private key-t.

## Avatar-minőség hardening

A jelenlegi repo avatar assetek 384×256 WebP-k. Elkészült a biztonságos nagyfelbontású csere/import pipeline:

`scripts/benjadmin-team-avatar-import.mjs`

Tulajdonságok:

- pontosan az öt BENJADMIN csapattagot várja;
- ZIP traversal és symlink tiltás;
- bejegyzés- és összméret-limit;
- PNG / JPG / WebP bemenet;
- minimum 800×500 px forrás;
- SHA-256 forrás- és kimeneti hash;
- 768×512, alpha-kompatibilis, 94-es WebP minőség;
- apply előtt dry-run;
- apply során backup és import manifest.

A végleges HQ csere csak akkor történjen, amikor az eredeti ZIP a DEV Fejlesztési Tárból vagy más biztonságos szerveroldali forrásból olvasható. Kitalált vagy felskálázott gyenge minőségű asset nem kerül véglegesítésre.

## Tárhely- és PROD-monitoring szabály

A Drive és Drop S3 kapacitást a rendszer csak tényleges, konfigurált kerettel mutatja. Jelenleg `DIMPRO_DRIVE_S3_QUOTA_BYTES` és `DIMPRO_DROP_S3_QUOTA_BYTES` nincs beállítva, ezért a Konzol / infrastruktúra UI nem talál ki keretet.

PRODUCTION / ÉLES erőforrás-collector telepítés nem történt. A PROD továbbra is read-only. Bármilyen PROD collector telepítése külön explicit jóváhagyást igényel.

## Acceptance

`node scripts/benjadmin-developer-resource-contract.mjs`

- 14/14 PASS.

`node scripts/benjadmin-developer-console-v1-acceptance.mjs`

- 36/36 PASS.

Ellenőrzött pontok többek között:

- 5 admin API unauth 401;
- valós B3 live adatok;
- SSE stream;
- külön ablakos admin indítás;
- Ármin / Ben / Jázmin / BENJADMIN pozicionálás;
- külön Outmin partner sáv;
- avatárok betöltése;
- BENJADMIN composer avatar két sort átfogó pozíciója;
- nagyobb tipográfia;
- másodperces frissítés reload nélkül;
- Világos / Sötét / Sunlight;
- ChatGPT Parancstár;
- Fejlesztési Tár;
- Ctrl+Alt+Space privacy;
- 1366×768 laptop;
- 768×1024 tablet;
- 390×844 mobil;
- teljes oldali vízszintes overflow nincs;
- PWA manifest standalone.

Build: `cCIfLNdbIDU0pNmmP2-iH`  
PM2 DEV: `dimpro-benjadmin-operator-ui-v2-dev` online.  
PROD: nem módosult.

## Következő fejlesztési lépések

1. Az eredeti 5 nagyfelbontású hexagon ZIP betöltése a Fejlesztési Tárba, dry-run, backup, HQ asset csere, browser acceptance.
2. A chat-kommunikáció mögé tényleges Ben-AI koordinációs adapter és worker execution workflow bekötése úgy, hogy a Konzolból kiadott természetes nyelvű utasítás teljes B3 task/session/worktree láncon induljon.
3. Approval-kártyák interaktív elfogadása / elutasítása.
4. Élő diff / módosított fájl / teszt / build részletek kinyitható blokkja.
5. PWA push döntési és blocker értesítések.
6. Fejlesztési Tár Drive adapter a közös DIMPRO Drive motor stabilizálása után.
