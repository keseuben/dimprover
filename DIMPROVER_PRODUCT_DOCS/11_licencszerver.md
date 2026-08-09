# 11 Licencszerver

## Cél

A DIMPRO kisebb appok és helyi EXE programok licencelése külön licenc aldomain alatt fusson:

- `https://license.dimpro.hu`

A jelenlegi kompatibilitási endpointok továbbra is megmaradnak:

- `https://dimprover.hu/api/license/public-key`
- `https://dimprover.hu/api/license/activate`
- `https://dimprover.hu/api/license/check`

## API végpontok

A végleges klienskonfiguráció a következő útvonalakat használja:

- `GET /api/license/public-key`
- `POST /api/license/activate`
- `POST /api/license/check`

## HAGE-INVEST MVP licenc

- `licenseKey`: `DIMPRO-HAGE-INVEST-MVP-2026`
- `companyId`: `hage-invest`
- `companyName`: `HAGE-INVEST Kft.`
- `appId`: `hage-invest-munkafelulet`
- `enabledModules`: `hage_workspace`, `tasks`, `vacations`
- alap érvényesség: 6 hónap
- offline türelmi idő: 7 nap

## Publikus kulcs

A jelenlegi Ed25519 publikus kulcs:

```txt
MCowBQYDK2VwAyEAwZQHtjGbhGvEyp1CT3hI9pfVFnMbM2eHaFIplCX5XCA=
```

A privát kulcs nem kerülhet frontendbe, publikus repóba vagy letölthető fájlba.

## Token kompatibilitás

A HAGE-INVEST helyi EXE kliens a jelenlegi tokenformátumhoz igazodik:

```txt
base64url(payload).base64url(ed25519_signature)
```

A szerver a token aláírásánál jelenleg a `base64url(payload)` tokenrészt írja alá. Ezt nem szabad megváltoztatni kompatibilitási okból.

## Naplózás és rate limit

Az aktiválás és ellenőrzés alap audit naplózást kapott:

- időpont
- művelet
- IP-cím
- maszkolt licenckulcs
- gépazonosító hash
- appId
- appVersion
- válasz státusz
- hibaazonosító, ha van

Napló helye:

```txt
.dimprover/data/license-audit.log
```

Alap rate limit:

- aktiválás: 20 kérés / perc / IP
- ellenőrzés: 120 kérés / perc / IP

## Admin felület későbbi irány

Később előkészítendő belső admin útvonal:

- `https://license.dimpro.hu/admin`

Tervezett funkciók:

- licencek listázása
- új licenc létrehozása
- lejárati dátum módosítása
- licenc tiltása / aktiválása
- gépazonosítók megtekintése
- max gépszám kezelése
- moduljogosultságok kezelése
- státusz módosítás: `active`, `expired`, `blocked`, `trial`, `pending`

## Nginx / SSL állapot

A `license.dimpro.hu` DNS rekord a VPS IP-címére mutat. A Next.js licenc API alkalmazásoldali része működik, de a külön Nginx server block és a Certbot SSL telepítése ebből a távoli eszközhívásból biztonsági szűrő miatt nem volt végrehajtható.

SSH-n futtatandó lépésként külön Nginx server blockot kell létrehozni `license.dimpro.hu` domainhez, amely a `127.0.0.1:3000` Next.js alkalmazásra proxyz, majd Certbot / Let's Encrypt tanúsítványt kell kérni és HTTP-ről HTTPS-re irányítást beállítani.

## 2026-07-02 – Licenckezelő admin MVP elkészült

Az MVP admin felület elérhető:

- `https://license.dimpro.hu/admin`

Elkészült funkciók:

- licencek listázása
- új licenc létrehozása
- licenckulcs módosítása
- cégazonosító és cégnév módosítása
- státusz módosítása: `active`, `expired`, `blocked`, `trial`, `pending`
- kezdő dátum és lejárati dátum módosítása
- max gépszám módosítása
- moduljogosultságok módosítása
- aktivált gépek megtekintése
- gép tiltása / aktiválása
- gép törlése, azaz géphely felszabadítása

Új fájlok:

- `app/admin/page.tsx`
- `app/api/license/admin/route.ts`
- `app/lib/license/admin-auth.ts`
- `app/lib/license/admin-service.ts`

Admin kulcs helye a szerveren:

```txt
/root/dimprover/.dimprover/license/admin-key.txt
```

Az admin API a `x-dimpro-license-admin-key` fejléc alapján ellenőrzi a jogosultságot. A kulcs nem kerül frontendbe vagy publikus fájlba.

## 2026-07-02 – Admin e-mail allowlist és próbálkozásnapló

A licencadmin belépésnél csak az engedélyezett admin e-mail cím kérhet OTP kódot.

Jelenlegi engedélyezett cím:

```txt
keseruben90@gmail.com
```

Minden admin kódkérés naplózható az új végponton keresztül:

```txt
POST /api/license/admin-login-attempt
```

Napló helye:

```txt
/root/dimprover/.dimprover/data/license-admin-login-attempts.log
```

A naplózott adatok:

- időpont
- megadott e-mail cím
- engedélyezett / nem engedélyezett állapot
- művelet
- IP-cím
- user-agent

Ha nem engedélyezett e-mail címet adnak meg, az OTP nem kerül kiküldésre, de a próbálkozás naplózódik.

## 2026-07-02 - Licencadmin dashboard bovites

- licenc archivalas archived statusszal
- licenc eltavolitasa a kapcsolodo gepaktivalasokkal egyutt
- uj licenc urlap magyar mezokkel
- uj licenc letrehozasanal moduljogosultsag checkboxok
- lejarati ido gyorsgombok: 1 honap, 6 honap, 1 ev
- sikeres admin kulcs ellenorzes utan a belepo blokk osszecsukodik
- sikeres dashboard betoltes utan automatikus gorgetes a dashboard szekciohoz

Az archived statusz szerveroldalon nem engedelyez aktiv klienshasznalatot.

## 2026-07-03 - Licencadmin teljes UI bovites

- Moduljogosultsag checkboxos magyar admin felulet.
- Teljes magyar mezonevek es statuszcimkek.
- Lejarati ido es hatralevo nap kijelzes.
- Gep inaktivitas kijelzes az utolso online ellenorzes alapjan.
- Admin megjegyzes mezo licencenkent.
- Kereses es statusz szures.
- Archivalt / torles / geptorles megerosito ablakok.
- Elofizetes-elokeszito mezok: csomag, ciklus, fizetesi statusz, Stripe azonosito mezok, fordulonap.
- Audit naplo megjelenites admin feluleten.
- Ugyfeloldali licencportal: /customer es /api/license/customer.

## 2026-07-04 - Gépazonosítás metaadatok

- A licencadmin gépazonosítási táblája bővült szerkeszthető géphez tartozó mezőkkel: felhasználó neve, szervezeti egység, megjegyzés.
- A gép metaadatok a licenc store eszköz rekordjaiban tárolódnak: userName, organizationUnit, note.
- Új admin művelet: updateDeviceMeta.
- A customer licencportálon a fő licenckártya alatt megjelenik az aktivált gépek táblázata: sorszám, név, gépazonosító, alkalmazás, aktiválva, megjegyzés.

## 2026-07-18 – HAGE AI Gateway és névre szóló AI-jogosultság

A HAGE-INVEST Munkatér AI-funkciói DEV 163-tól nem használnak kliensoldali vagy helyi OpenAI API-kulcsot. A helyi HAGE Node szerver az aktív DIMPRO licencmunkamenet aláírt tokenjével a központi DIMPRO AI Gateway végpontot hívja:

- `POST /api/hage-ai/status`
- `POST /api/hage-ai/estimate`
- `POST /api/hage-ai/run`
- `POST /api/hage-ai/usage`

Minden AI-futtatásnál ellenőrzendő:

- az aláírt licenctoken hitelessége és lejárata;
- az éles licenc aktuális `active` vagy `trial` állapota;
- az `ai_assistant` modul licencszintű engedélye;
- az aktív gépazonosító;
- a felhasználó névre szóló AI-jogosultsága;
- az engedélyezett munkatér és AI-funkció;
- a napi, havi és forintban megadott egyéni és céges keret.

A HAGE-INVEST licencben `Keserű Benjámin` AI-hozzáférése aktív a Saját munkatérhez és a HAGE-INVEST munkatérhez. A költség- és tokennapló központilag a DIMPRO szerveren készül.

A licenc- és AI-adatfájlok tartós, buildtől független gyökérmappája:

```txt
DIMPRO_LICENSE_DATA_ROOT=/root/dimprover/.dimprover
```

Ez megakadályozza, hogy a Next.js standalone build külön vagy üres licencadatbázist hozzon létre. Az API-kulcs továbbra is kizárólag szerveroldali környezeti változóban tárolható.

## 2026-07-21 – Licencaktiválási és változásértesítő e-mailek

A licencrendszer automatikus e-mail értesítésekkel bővült.

### Új gépaktiválás

Sikeres, valóban új gépaktiváláskor két külön levél készül:

- belső DIMPRO rendszerüzenet a konfigurált több admin címzett részére;
- visszaigazoló e-mail a licencnél megadott kapcsolattartó részére.

A levelek feladója a `system@dimpro.hu` rendszerprofil, megjelenő neve `DIMPRO rendszerüzenet`. A válaszcím külön konfigurálható, alapértéke `info@dimpro.hu`.

Az aktiválási rendszerüzenet tartalma:

- cég és kapcsolattartó;
- maszkolt licenckulcs;
- alkalmazás és alkalmazásverzió;
- gépazonosító és aktiválási időpont;
- licenc állapota;
- licenc kezdete és lejárata;
- fordulónap / aktuális előfizetési időszak vége;
- számlázási ciklus;
- jelenlegi aktív gépszám és maximális gépszám;
- moduljogosultságok;
- aktiválási IP-cím, ha rendelkezésre áll.

Az aktiválási levél csak új gép felvételekor megy ki. A rendszeres `/api/license/check` ellenőrzés és egy már aktivált gép ismételt `/activate` hívása nem küld új levelet.

### Licenc- és gépadatok változása

A kapcsolattartó automatikus e-mailt kap az alábbi admin műveleteknél:

- új licenc létrehozása;
- licencadatok módosítása;
- licenc archiválása;
- licenc törlése;
- aktivált gép eltávolítása;
- gép metaadatainak módosítása;
- gép aktív / tiltott státuszának módosítása.

A változásértesítő felsorolja a módosított mezőket, és mindig megjeleníti a licenc aktuális állapotát, kezdését, lejáratát, fordulónapját, számlázási ciklusát, aktív/maximális gépszámát és moduljogosultságait. A licenc törléséről a törlés előtti utolsó adatok alapján készül értesítés.

Az admin felület a művelet után visszajelzi, hogy a kapcsolattartói e-mail sikeresen kiment-e. Az SMTP-hiba nem vonja vissza a már elmentett licencmódosítást, de a hiba megjelenik az admin felületen és külön e-mail naplóba kerül.

### Beállítás és naplózás

Az e-mail admin oldalon külön kezelhető:

- `licenseActivationRecipients`: több belső DIMPRO címzett;
- `licenseReplyTo`: kezelt válaszcím.

Jelenlegi alapbeállítás:

- rendszerüzenet címzettjei: `admin@dimpro.hu`, `info@dimpro.hu`;
- válaszcím: `info@dimpro.hu`.

Naplófájlok:

```txt
.dimprover/mail/license-activation-email-history.jsonl
.dimprover/mail/license-change-email-history.jsonl
```

## 2026-07-21 – Több kapcsolattartó és bővíthető értesítési címzettlista

A licencrekord kapcsolattartói kezelése kibővült:

- 1. kapcsolattartó;
- 2. opcionális kapcsolattartó;
- tetszőleges számú további értesítési kapcsolattartó táblázatos formában.

A további kapcsolattartó mezői:

- név;
- szerepkör / vezetői minőség;
- e-mail cím;
- telefonszám;
- `Kapjon e-mailt` kapcsoló.

Az aktiválási, licencváltozási és kézzel indított licenckulcs-levelek minden érvényes és engedélyezett kapcsolattartói címre külön e-mailként mennek ki. A címzettek nem látják egymást a levél címzettmezőjében. Az azonos e-mail címeket a rendszer kis- és nagybetűtől függetlenül automatikusan deduplikálja.

Minden ügyfél- és adminlicenclevélben külön `Kapcsolattartók` blokk jelenik meg, amely felsorolja:

- a kapcsolattartó nevét;
- szerepkörét;
- e-mail címét;
- telefonszámát.

A kapcsolattartók a `license.dimpro.hu/customer` ügyfélportálon is megjelennek. A további címzettlista opcionális; a meglévő licencek módosítás nélkül tovább működnek.

## 2026-07-21 – Licenchosszabbítás és automatikus lejárati értesítők

### Licenchosszabbítás

A licenc megújításakor alapértelmezetten nem készül új licenckulcs. A meglévő licencrekord, licenckulcs, gépaktiválások, kapcsolattartók és moduljogosultságok megmaradnak.

Az adminfelület gyorshosszabbítási szabálya:

- aktív, még le nem járt licencnél az új időtartam a jelenlegi lejárati dátumtól számítódik;
- már lejárt licencnél az új időtartam a hosszabbítás napjától számítódik;
- lejárt státuszú licenc gyorshosszabbításakor a státusz `active` értékre vált;
- a lejárati dátum és a fordulónap ugyanarra az új dátumra áll;
- a mentés után külön `DIMPRO licenc meghosszabbítva` visszaigazoló e-mail megy ki;
- a visszaigazolás jelzi, hogy a kulcs és a meglévő gépaktiválások változatlanul használhatók.

### Automatikus lejárati értesítések

A napi ellenőrzés Europe/Budapest időzónában 08:00-kor fut.

Értesítési fokozatok:

- 30 nappal a lejárat előtt;
- 7 nappal a lejárat előtt;
- 1 nappal a lejárat előtt;
- a lejárat napján, illetve kimaradt futás esetén az első következő ellenőrzéskor.

A rendszer mindig csak az aktuális fokozatot küldi ki. Nem küld egyszerre több korábban kihagyott emlékeztetőt.

Címzettek:

- elsődleges kapcsolattartó;
- másodlagos kapcsolattartó;
- minden további, `Kapjon e-mailt` beállítású kapcsolattartó;
- a licencaktiválási beállításoknál megadott admin címzettek.

Minden címzett külön levelet kap, a címzettek nem látják egymást. Az azonos e-mail címeket a rendszer globálisan deduplikálja, ezért egy admin címként is szereplő kapcsolattartó nem kap két levelet.

### Deduplikálás és új ciklus

A sikeres kézbesítés naplókulcsa:

```text
licenseId + expiresAt + reminderStage + recipientEmail
```

Ez biztosítja, hogy:

- ugyanaz a fokozat ugyanarra a címre csak egyszer menjen ki;
- részleges SMTP-hibánál csak a sikertelen címzettek legyenek újrapróbálva;
- a lejárati dátum módosításakor automatikusan új értesítési ciklus induljon;
- ne kelljen kézzel törölni a régi értesítési állapotokat.

Naplófájlok:

```text
.dimprover/mail/license-expiry-reminder-history.jsonl
.dimprover/mail/license-expiry-reminder-runs.jsonl
.dimprover/mail/license-expiry-reminder-cron.log
.dimprover/mail/license-expiry-reminder-last-response.json
```

### API és cron

Védett API:

```text
GET  /api/license/expiry-reminders
POST /api/license/expiry-reminders
```

POST példa előnézethez, tényleges küldés nélkül:

```json
{
  "source": "manual",
  "dryRun": true
}
```

Cron futtató:

```text
scripts/run-license-expiry-reminders.sh
```

Ajánlott időzítés:

```cron
CRON_TZ=Europe/Budapest
0 8 * * * /bin/bash /root/dimprover/scripts/run-license-expiry-reminders.sh
```

Az admin licenc-dashboardon külön `Előnézet küldés nélkül` és `Értesítések futtatása` gomb érhető el.
