# BENJADMIN csapatképernyő v1.2 – fejlesztői monitoring elrendezés

Dátum: 2026-08-11

## Vizuális irány

A csapatképernyő nem játékos/gamer dashboard irányba megy tovább, hanem visszafogott, mérnöki-fejlesztői vezérlőközpontként.

Fő szabályok:

- sötét navy munkafelület;
- visszafogott cyan állapotjelzés;
- kevesebb glow és árnyék;
- kisebb sarokkerekítés;
- adatok és működési állapot előrébb valók a dekorációnál.

## BENJADMIN CSAPAT kártyák

A személyi kártya vizuális területének közel fele a hexagon csapatemblémáé.

Desktop:

- Benjadmin és Ben-AI: a kártya bal kb. 44%-a kép;
- Ármin-AI, Jázmin-AI és Outmin-AI: a kártya felső kb. 46%-a kép;
- a fennmaradó rész a szerepkör, feladatok, állapot és élő task/session adatok területe.

Az embléma körül nincs külön kártyaháttér, keret vagy crop. A kép `object-fit: contain` módban olvad a BENJADMIN munkafelületbe.

## Bal oldali infrastruktúra oszlop

A pillanatnyi állapotokhoz a sávdiagram/progress-bar a leggyorsabban olvasható forma, ezért az összes infrastruktúra-kártya ezt a mintát használja.

Egységes kártyák:

1. BENJADMIN DEV VPS
2. PRODUCTION / ÉLES VPS
3. DB VPS
4. DIMPRO Drive tárhely
5. DIMPRO Drop tárhely

DEV / ÉLES / DB:

- memóriahasználat százalék + byte adatok;
- lemezhasználat százalék + teljes/foglalt/szabad méret;
- load / szolgáltatás / elérhetőség / válaszidő kiegészítő adatok.

Drive / Drop S3:

- élő S3 elérhetőség;
- aktuális foglaltság objektumlistázás alapján;
- objektumszám;
- teljes DIMPRO tárhelykeret;
- szabad keret;
- foglaltsági százalék és sávdiagram, ha a teljes keret konfigurálva van.

A Hetzner S3 API nem ad fix bucket-kapacitás mezőt. Emiatt a teljes keretet nem szabad kitalálni. A BENJADMIN a következő opcionális, nem titkos konfigurációt támogatja:

- `DIMPRO_DRIVE_S3_QUOTA_BYTES`
- `DIMPRO_DROP_S3_QUOTA_BYTES`

Ha a valós szerződéses/belső keret bekerül ezekbe, a teljes méret, foglalt, szabad és százalék automatikusan megjelenik. Addig az élő foglaltság látható, a teljes keret pedig `nincs beállítva` állapotú.

A Drop S3 foglaltságmérés is lapozott lett: legfeljebb 10 000 objektumig összesít, ugyanúgy mint a Drive oldal.

## Jobb oldali működési oszlop

Trend ellenőrzéshez a vonaldiagram a megfelelő forma, ezért a jobb oszlop három elsődleges trendet mutat:

1. `Rendszerterhelési trend`
   - CPU;
   - memória;
   - lemez;
   - kizárólag valós B3.1 monitoring mintából.

2. `Elérési válaszidő`
   - ÉLES VPS HTTPS;
   - DB VPS PostgreSQL/TCP;
   - 30 másodperces mintavétel a megnyitott munkamenet alatt;
   - maximum 12 friss minta.

3. `Fejlesztési aktivitás`
   - task mozgás;
   - fejlesztési munkamenetek;
   - utolsó 7 nap.

A sorrend szándékos: először infrastruktúra egészség, utána válaszidő, végül fejlesztési aktivitás.

## Biztonság

- PROD módosítás nem történt;
- PROD adatok csak read-only forrásból;
- DB ellenőrzés read-only;
- S3 státuszhoz meglévő, szerveroldali credential használat, credential nem kerül a kliensre;
- a quota mezők nem titkok.

## Következő lépés

A B3.1 Control VPS collector később perzisztens idősorba gyűjti a DEV / PROD / DB / S3 állapotmintákat. Ekkor a jelenlegi munkamenet-alapú válaszidődiagram több órás / 24 órás / 7 napos trenddé bővíthető.

## DEV ellenőrzési eredmény

Aktív DEV build:

`so1Ke6lUw2WWFIL1Pxkjf`

Acceptance és regresszió:

- BENJADMIN csapatképernyő v1.2: **29/29 PASS**;
- Operator UI regresszió: **30/30 PASS**;
- B3.2 P5 regresszió: **53/53 PASS**;
- `npx tsc --noEmit`: PASS;
- `npm run lint`: 0 hiba / 108 korábbról meglévő warning;
- `git diff --check`: PASS;
- DEV PM2: online.

A vizsgálat külön ellenőrzi, hogy:

- az öt infrastruktúra-cél azonos kártyamintát használ;
- az ÉLES és DB VPS memória- és lemezterhelése grafikusan is látszik;
- a Drive és Drop S3 aktuális foglaltsága és teljes keret mezője megjelenik;
- a jobb oldali három fő trendgrafikon megmarad;
- az öt csapattag képi területe közel a személyi kártya felét foglalja el;
- desktop, tablet és mobil nézeten nincs teljes oldali vízszintes túlcsordulás.

PROD módosítás: **nem történt**.
