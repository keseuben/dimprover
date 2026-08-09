# DIMPRO TelepŐr – komplex architektúra és kódolási terv

Dátum: 2026-07-22
Állapot: önálló alkalmazás alapja létrehozva, HTTPS működik
Kezdeti cím: https://telepor.dimpro.hu

## 1. Termékcél

A DIMPRO TelepŐr többcéges, többágazatos és többtelephelyes műszaki állapotfelügyeleti, energiafigyelő, riasztási és később üzemeltetési alkalmazás.

Első célrendszer: NAGISZ Zrt.

Első üzleti és szakmai fókusz:
- Sertés ágazat
- Baromfi ágazat
- Szarvasmarha ágazat
- később további ágazatok és üzemek
- ágazatonként több telephely
- telephelyenként több épület, helyiség, elosztó, technológiai rendszer, mérő és műszaki eszköz

A TelepŐr első verziója csak megfigyel, értékel, naplóz és értesít. Nem vezérli a telepi folyamatokat, nem kapcsol megszakítót, nem indít aggregátort és nem ír vissza PLC-be vagy más automatikaeszközbe.

## 2. Külön alkalmazás és későbbi leválaszthatóság

A TelepŐr nem az app.dimpro.hu egyik útvonala, hanem külön alkalmazás:

- saját kódbázis: `/root/telepor`
- saját Next.js alkalmazás
- saját PM2 folyamat: `dimpro-telepor`
- saját belső port: `3012`
- saját Nginx konfiguráció
- saját HTTPS tanúsítvány
- saját környezeti változók
- saját naplók
- később saját adatbázis

Kezdetben ugyanazon VPS-en fut, mint a DIMPRO rendszer, de nem függhet közvetlenül a DIMPROVER alkalmazás belső fájljaitól vagy adatbázistábláitól.

Későbbi külön szerverre költözés:
1. a `/root/telepor` alkalmazás átmásolható az új szerverre;
2. az adatbázis külön migrálható;
3. a DNS rekord az új szerver IP-jére állítható;
4. a `telepor.dimpro.hu` cím megtartható;
5. később külön márkadomain is rámutathat ugyanarra az alkalmazásra.

## 3. Jelenlegi elkészült infrastruktúra

- DNS: `telepor.dimpro.hu` → `213.160.68.24`
- HTTPS: Let's Encrypt tanúsítvány
- tanúsítvány lejárata: 2026-10-20
- automatikus megújítás: Certbot ütemezett feladat
- Nginx reverse proxy: `telepor.dimpro.hu` → `127.0.0.1:3012`
- PM2 folyamat: `dimpro-telepor`
- health endpoint: `https://telepor.dimpro.hu/api/health`
- külön Next.js 16.2.6 / React 19 alkalmazás
- világos és sötét felület
- NAGISZ-specifikus ágazati és telephelyi demó dashboard

## 4. Szervezeti hierarchia

```text
Organization
└── Sector / Ágazat
    └── Site / Telephely
        └── Facility / Létesítmény vagy épület
            └── System / Műszaki rendszer
                └── Device / Eszköz
                    └── MeasurementPoint / Mérési pont
```

NAGISZ példa:

```text
NAGISZ Zrt.
├── Sertés ágazat
│   ├── Sertéstelep A
│   ├── Sertéstelep B
│   └── Sertéstelep C
├── Baromfi ágazat
│   ├── Baromfitelep A
│   ├── Baromfitelep B
│   └── Keltető
└── Szarvasmarha ágazat
    ├── Tehenészeti telep A
    └── Tehenészeti telep B
```

A rendszer már az első adatmodellben támogasson:
- korlátlan ágazatszámot;
- cégenként legalább 100 telephelyet;
- telephelyenként több száz eszközt;
- telephelyenként több ezer mérési pontot;
- több céget ugyanazon TelepŐr rendszerben.

## 5. Fő alkalmazásmodulok

### 5.1 Áttekintés
- összes telephely állapota;
- aktív és kritikus riasztások;
- offline telephelyek és adatgyűjtők;
- napi fogyasztás;
- napi napelemes termelés;
- aktív aggregátorok;
- UPS állapotok;
- ágazati összesítés;
- utolsó adatfrissítés;
- gyors telephelykeresés.

### 5.2 Ágazatok
- ágazati dashboard;
- telepszám;
- riasztási és energiaösszesítő;
- ágazati jogosultságok;
- ágazatok közötti összehasonlítás.

### 5.3 Telepek
- telephelylista;
- térképes és táblázatos nézet;
- állapot, riasztás, energia, kapcsolat;
- telepen belüli épület- és rendszerstruktúra;
- telepi kapcsolattartók;
- telepi adatgyűjtő állapota.

### 5.4 Riasztások
- kritikus, figyelmeztető, információs és kapcsolati események;
- nyugtázás;
- felelős kijelölése;
- eszkaláció;
- eseménytörténet;
- megjegyzés és intézkedés;
- lezárás;
- e-mail, SMS, rendszerüzenet és később push.

### 5.5 Energia
- pillanatnyi teljesítmény;
- fogyasztás időszakonként;
- feszültség, áram, frekvencia, teljesítménytényező, ha mérhető;
- telepek összehasonlítása;
- fogyasztási csúcsok;
- alap- és csúcsterhelés;
- export és riport.

### 5.6 Napelem
- pillanatnyi termelés;
- napi, heti és havi termelés;
- inverterállapot;
- fogyasztás–termelés összevetés;
- váratlan termeléscsökkenés;
- telepek közötti összehasonlítás.

### 5.7 Vészüzem
- hálózati állapot;
- fázisfigyelő és gyűjtősín állapot;
- UPS üzemállapot;
- UPS terhelés és akkumulátorállapot;
- aggregátor készenlét és üzem;
- aggregátor üzemóra;
- automatikus átkapcsolás állapota;
- kapcsolódó eseménynapló.

### 5.8 Üzemeltetés
Későbbi teljes modul:
- villany-, víz-, gáz-, hő- és egyéb óraállások;
- üzemóra-adatok;
- mérőórák nyilvántartása;
- eszköznyilvántartás;
- karbantartási tervek;
- karbantartási napló;
- ütemezett ellenőrzések;
- hibajegyek;
- munkalapok;
- felülvizsgálatok;
- alkatrészcserék;
- dokumentumok;
- költségek;
- felelősök és határidők.

### 5.9 Riportok
- napi telepi riport;
- heti műszaki összefoglaló;
- havi vezetői riport;
- energiafogyasztási riport;
- napelemes termelési riport;
- aggregátor és UPS riport;
- riasztási riport;
- telephely-összehasonlítás;
- PDF, Excel és CSV export;
- automatikus e-mailes kiküldés.

### 5.10 Beállítások
- cégek, ágazatok és telepek;
- felhasználók és jogosultságok;
- adatforrások;
- mérési pontok;
- riasztási szabályok;
- értesítési csoportok;
- riportütemezés;
- adatmegőrzés;
- integrációk.

## 6. Adatmodellek

### 6.1 Szervezet
- Organization
- Sector
- Site
- Facility
- TechnicalSystem
- Asset
- Device
- MeasurementPoint

### 6.2 Telemetria
- TelemetrySample
- TelemetryBatch
- TelemetryAggregate5m
- TelemetryAggregate1h
- TelemetryAggregate1d
- DeviceHeartbeat
- CollectorHeartbeat
- ConnectionState

### 6.3 Riasztás
- AlarmRule
- Alarm
- AlarmOccurrence
- AlarmStateChange
- AlarmAcknowledgement
- AlarmComment
- AlarmRecipient
- EscalationRule
- NotificationDelivery

### 6.4 Üzemeltetés
- Meter
- MeterReading
- MaintenancePlan
- MaintenanceTask
- MaintenanceLog
- InspectionPlan
- InspectionResult
- WorkOrder
- AssetLifecycleEvent
- DocumentAttachment

### 6.5 Jogosultság
- User
- Role
- Membership
- OrganizationPermission
- SectorPermission
- SitePermission
- NotificationPreference

### 6.6 Riport
- ReportTemplate
- ReportRun
- ReportSchedule
- ReportDelivery

## 7. Milyen adatok szükségesek a telephelyektől?

Az IP-címek önmagukban nem elegendők. Minden telephelyre külön műszaki adatlapot kell készíteni.

### 7.1 Eszközadatok
- gyártó;
- pontos típus;
- funkció;
- sorozatszám;
- firmware;
- telepítési hely;
- hálózati cím;
- kommunikációs protokoll;
- jelenlegi kezelőfelület neve;
- karbantartó vagy rendszerintegrátor neve.

### 7.2 Hálózati adatok
- helyi IP-cím;
- alhálózati maszk;
- átjáró;
- DNS;
- VLAN;
- DHCP vagy statikus IP;
- tűzfalszabályok;
- switch és port;
- telephelyi internetkapcsolat;
- VPN megléte;
- elérhető helyi szerver vagy ipari PC.

### 7.3 Kommunikációs dokumentáció
Lehetséges protokollok:
- Modbus TCP;
- Modbus RTU / RS-485;
- OPC UA;
- MQTT;
- SNMP;
- BACnet;
- REST API;
- gyártói adatbázis;
- fájl- vagy CSV-export.

Modbus esetén kötelező:
- register map;
- Unit ID / Slave ID;
- TCP port, jellemzően 502, de ezt ellenőrizni kell;
- regisztertípus;
- adatméret;
- byte order és word order;
- skálázási tényező;
- mértékegység;
- hibakódok jelentése;
- lekérdezési gyakorisági korlát.

## 8. A megadott IP-adatok jelentése

Példa:

```text
IP:   10.0.20.222
MASK: 255.255.255.0
GW:   10.0.20.1
DNS:  10.0.20.1
```

Jelentés:
- `10.0.20.222`: az eszköz helyi, privát IP-címe;
- `255.255.255.0`: az eszköz a `10.0.20.0/24` helyi hálózaton van;
- `10.0.20.1`: jellemzően a helyi router vagy tűzfal;
- DNS-ként is a helyi átjáró szerepel.

Ez az eszköz közvetlenül az internetről nem érhető el. A TelepŐr központi szervere nem próbálhat közvetlen portnyitással csatlakozni hozzá.

Szükséges további információ:
- pontosan melyik eszközé az IP;
- milyen szolgáltatás fut rajta;
- melyik portot használja;
- milyen protokollt használ;
- szükséges-e hitelesítés;
- van-e regisztertábla vagy API-dokumentáció;
- a jelenlegi helyi SCADA vagy HMI ki tudja-e adni az adatokat.

Fontos: a MOXA MGate MB3180 kommunikációs átjáró, nem önmagában fogyasztásmérő. A mögötte lévő mérő vagy PLC adatait alakítja át Modbus RTU/ASCII és Modbus TCP között.

## 9. Szükséges telephelyi Edge adatgyűjtő

### 9.1 Miért kell?

A telepi eszközök belső IP-címen működnek. A központi szerver helyett a telephelyen működő Edge Collector olvassa őket, majd titkosított kimenő kapcsolatban továbbítja az adatokat a TelepŐr szervernek.

### 9.2 Javasolt hardver

Pilothoz:
- fanless mini-PC vagy ipari gateway;
- Intel N100/N97 vagy hasonló teljesítményű processzor;
- 8 GB RAM ajánlott;
- 128 GB SSD ajánlott;
- legalább 1 Ethernet, OT/IT leválasztáshoz inkább 2 Ethernet;
- Linux operációs rendszer;
- automatikus újraindítás;
- watchdog;
- legalább 7 napos helyi puffer;
- kis UPS ajánlott.

Ipari környezethez:
- DIN-sínes vagy ipari kivitel;
- -20 és +60 °C közötti üzemi tartomány, ha szükséges;
- ipari SSD;
- két hálózati interfész;
- soros RS-485 interfész, ha közvetlenül kell csatlakozni;
- tápellátási és túlfeszültség-védelmi megfelelőség.

### 9.3 Edge Agent feladatai
- Modbus TCP/RTU, OPC UA, MQTT vagy egyéb adatolvasás;
- adatpontok egységesítése;
- timestamp és minőségjelzés;
- helyi puffer internetkimaradáskor;
- utólagos szinkronizálás;
- heartbeat;
- titkosított feltöltés;
- konfiguráció verziózása;
- naplózás;
- csak olvasó működés.

## 10. IP- és hálózati stratégia

### 10.1 Központi TelepŐr szerver

Jelenleg:
- nyilvános IPv4: `213.160.68.24`;
- DNS: `telepor.dimpro.hu`;
- HTTPS port: 443;
- belső alkalmazásport: 3012.

### 10.2 Telephely

Nem szükséges minden telephelyhez nyilvános vagy fix külső IP, amennyiben az Edge Collector kimenő kapcsolatot indít.

Ajánlott szabályok:
- Edge Collector fix belső IP vagy DHCP reservation;
- kimenő HTTPS 443 engedélyezése;
- opcionálisan MQTT TLS 8883;
- közvetlen porttovábbítás tilos a PLC/MOXA/mérő irányába;
- OT VLAN használata;
- tűzfalon csak szükséges célok és portok;
- VPN csak indokolt adminisztrációhoz;
- az adatgyűjtő ne legyen általános felhasználói számítógép.

### 10.3 Javasolt adatfeltöltési végpontok

Pilot:
- `https://telepor.dimpro.hu/api/telemetry/ingest`

Később nagyobb rendszerhez:
- `mqtts://ingest.telepor.dimpro.hu:8883`

Hitelesítés:
- minden Edge Collector külön azonosító;
- telephelyenként külön kliens-tanúsítvány vagy API-kulcs;
- kulcsrotáció;
- sequence number;
- timestamp ellenőrzés;
- rate limiting;
- auditnapló.

## 11. Központi szerverigény

### 11.1 Jelenlegi VPS

A jelenlegi szerver alkalmas:
- UI fejlesztésre;
- demóra;
- 1–3 telepes pilotra;
- alacsony gyakoriságú telemetria tesztelésére.

Jelenlegi korlátok:
- kb. 3,8 GB RAM;
- kb. 17 GB szabad tárhely;
- magas lemezhasználat;
- a DIMPRO többi alkalmazása is ezen fut.

Ez hosszú távú, 30–50 telepes nyers idősoros adatgyűjtésre nem javasolt.

### 11.2 Pilot szerverjavaslat

Külön TelepŐr pilot szerverhez:
- 4 vCPU;
- 8 GB RAM;
- 160–250 GB NVMe SSD;
- Ubuntu LTS;
- napi mentés;
- külön PostgreSQL vagy menedzselt adatbázis;
- 1 Gbit/s hálózat;
- statikus publikus IPv4;
- automatikus monitoring.

### 11.3 Éles 30–50 telephelyes rendszer

Ajánlott kezdeti felépítés:

Alkalmazásszerver:
- 4–8 vCPU;
- 16 GB RAM;
- 100–160 GB NVMe;
- statikus IPv4;
- Nginx + Next.js API + háttérfolyamatok.

Adatbázis-szerver:
- 8 vCPU;
- 32 GB RAM;
- 500 GB–1 TB NVMe;
- PostgreSQL + TimescaleDB;
- napi teljes mentés;
- folyamatos tranzakciós mentés;
- elkülönített hozzáférés.

Opcionális komponensek:
- Redis;
- MQTT broker;
- objektumtár;
- másodlagos backup tárhely;
- monitoring szerver.

A pontos méretezés függ:
- telephelyek számától;
- mérési pontok számától;
- mintavételi gyakoriságtól;
- adatmegőrzéstől;
- grafikonok részletességétől;
- egyidejű felhasználóktól.

## 12. Adatbázis-technológia

Javaslat:
- PostgreSQL a törzsadatokhoz;
- TimescaleDB az idősoros telemetriához;
- Redis az aktuális állapot és riasztási cache céljára;
- S3-kompatibilis objektumtár riportokhoz és mellékletekhez.

Adatmegőrzési javaslat:
- 5–10 másodperces nyers adat: 30–90 nap;
- 1–5 perces aggregátum: 1–2 év;
- órás és napi aggregátum: hosszú távon;
- riasztások, nyugtázások és audit: több év;
- automatikus tömörítés és archiválás.

## 13. Riasztási motor

Riasztástípusok:
- küszöbérték túllépése;
- állapotváltozás;
- fázishiba;
- hálózatkimaradás;
- UPS belépés;
- aggregátor indulás vagy hiba;
- alacsony akkukapacitás;
- inverterhiba;
- tartós kommunikációs hiba;
- adatkimaradás;
- szokatlan fogyasztási csúcs;
- telephelyi kapcsolatvesztés.

Kötelező funkciók:
- hiszterézis;
- késleltetés;
- duplikációszűrés;
- nyugtázás;
- eszkaláció;
- karbantartási ablak;
- csendesítés időkorláttal;
- helyreállási esemény;
- teljes napló.

## 14. Felhasználói szerepkörök

- DIMPRO rendszergazda;
- NAGISZ vállalati admin;
- központi üzemeltetési vezető;
- ágazatvezető;
- telepvezető;
- kameraszoba vagy ügyelet;
- karbantartó;
- vezetői megtekintő;
- külső szervizpartner;
- riportolvasó.

Jogosultsági szintek:
- szervezet;
- ágazat;
- telephely;
- műszaki rendszer;
- funkció;
- riasztási súlyosság.

## 15. Biztonsági alapelvek

- az MVP minden ipari kapcsolatban csak olvasó;
- OT eszköz közvetlen internetes elérése tilos;
- egyedi Edge Collector hitelesítés;
- titkosított adatátvitel;
- minimális jogosultság;
- kétfaktoros adminbelépés;
- auditnapló;
- adatminőség-jelzés;
- rate limiting;
- kulcsrotáció;
- biztonsági mentés;
- fejlesztői, teszt és éles környezet szétválasztása;
- távoli vezérlés csak külön jövőbeli biztonsági projektben.

## 16. Fejlesztési szakaszok

### 0. szakasz – elkészült alap
- külön alkalmazás;
- külön domain;
- HTTPS;
- PM2;
- health endpoint;
- világos és sötét mód;
- NAGISZ demó dashboard.

### 1. szakasz – szervezeti és telephelyi törzs
- adatbázis létrehozása;
- szervezet, ágazat, telep, létesítmény és eszköz;
- felhasználók és jogosultságok;
- adminfelület;
- telephelyimport Excelből.

### 2. szakasz – Edge Collector pilot
- telephelyi műszaki felmérés;
- egy kiválasztott telep;
- eszközlista;
- regisztertábla;
- Edge hardver telepítése;
- Modbus TCP adatolvasás;
- heartbeat;
- ingest API;
- offline puffer.

### 3. szakasz – telemetria és diagramok
- idősoros adatbázis;
- élő állapot;
- fogyasztás;
- napelem;
- UPS és aggregátor;
- telephely-összehasonlítás;
- időtávválasztás;
- adatminőség.

### 4. szakasz – riasztási központ
- szabálymotor;
- rendszerüzenetek;
- e-mail;
- SMS;
- nyugtázás;
- eszkaláció;
- audit.

### 5. szakasz – riportok
- napi, heti és havi riport;
- eseményriport;
- PDF;
- Excel;
- automatikus kiküldés.

### 6. szakasz – üzemeltetés
- óraállások;
- eszközök;
- karbantartás;
- munkalap;
- ellenőrzés;
- dokumentumok;
- költségek.

### 7. szakasz – mobil és külső piac
- PWA;
- Android alkalmazás;
- push értesítés;
- többcéges onboarding;
- csomagok és számlázás;
- white-label;
- külön szerverre migrálás.

## 17. Következő kézi adatbekérés a NAGISZ informatikától és automatizálási szakemberektől

Minden kiválasztott pilot telepre kérendő:
1. hálózati topológia;
2. eszközlista;
3. IP-lista;
4. pontos eszköztípusok;
5. jelenlegi SCADA/HMI rendszer neve;
6. képernyőképek a jelenlegi felületről;
7. Modbus/OPC/API dokumentáció;
8. regisztertáblák;
9. jelenlegi SMS- és e-mail-riasztások listája;
10. riasztási címzettek és eszkaláció;
11. telephelyi internet és tűzfal adatai;
12. rendelkezésre álló szerver vagy ipari PC;
13. villamos és automatizálási kapcsolattartó;
14. írásos engedély az adatkiolvasási teszthez.

## 18. MVP elfogadási feltételek

- a TelepŐr önállóan elérhető HTTPS-en;
- nem függ az app.dimpro.hu alkalmazástól;
- NAGISZ ágazatokat és telepeket kezel;
- világos és sötét mód működik;
- egy pilot telepről valós adat érkezik;
- kapcsolatvesztés felismerhető;
- legalább egy fogyasztási és egy termelési diagram működik;
- legalább öt riasztási szabály működik;
- rendszerüzenet és e-mail működik;
- eseménynapló auditálható;
- napi PDF-riport készíthető;
- nincs távoli vezérlés.

## 19. Végső architektúra-elv

A TelepŐr központi webes és mobilos megtekintő, elemző, riasztó és üzemeltetési rendszer. A telepi automatika továbbra is helyben, internet nélkül is működőképes marad. A TelepŐr kiesése nem akadályozhatja a szellőztetést, a vészenergia-ellátást, az aggregátor automatikus indítását vagy bármely állatvédelmi és technológiai biztonsági funkciót.
