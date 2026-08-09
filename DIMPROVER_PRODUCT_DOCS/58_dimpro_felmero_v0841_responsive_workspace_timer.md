# DIMPRO Felmérő v0.8.4.1 – Responsive szakértői munkatér és munkaidőmérő

Dátum: 2026-07-30
Dev Center verzió: `version_e330e034-912`
Alapverzió: v0.8.4
Alap éles build: `_woQoQbPeuPesDJRHo7kl`
Forrásbackup: `backups/energy_v0841_responsive_workspace_timer_20260730_070702`

## 1. Fejlesztési cél

A v0.8.4.1 célja a Felmérő szakértői energetikai felületének átszervezése és a felméréshez kapcsolt munkaidőmérő kialakítása.

A fejlesztést a valós felületről készített asztali képek indokolták. A képek alapján a teljes energetikai szerkesztő, a részletes táblázatok és a WinWatt-átadási munkalap a körülbelül 300–370 px széles jobb oldali panelben jelent meg.

Ennek következménye volt:

- levágott számérték és felirat;
- több sorba törő, nehezen értelmezhető mértékegység;
- részben eltűnő gomb;
- egymásra torlódó belső fülek;
- túl hosszú függőleges görgetés;
- kihasználatlan központi rajzterület;
- asztali felületen is tabletesen szűk adatbevitel;
- WinWatt-táblák és mezőtérkép nehézkes kezelése.

A v0.8.4.1 nem változtatja meg az energetikai számításokat. A fejlesztés kizárólag:

- felületi architektúrát;
- responsive működést;
- nézetváltást;
- navigációt;
- vizuális elfogadási ellenőrzést;
- munkaidőmérést;
- `.dimpro` munkafájl-adatmodellt

érint.

## 2. Fő felületi elv

A jobb oldali panel többé nem teljes szakértői szerkesztő.

A végleges elv:

```text
Bal oldal   = felmérési lépések és munkafolyamat
Közép       = rajz, teljes szakértői adatlap vagy osztott nézet
Jobb oldal  = rövid navigációs és állapotboard
```

A részletes energetikai munkalapok a központi munkafelület teljes használható szélességét kapják.

## 3. Központi nézetek

Három nézet választható:

```text
Rajz
Adatok
Osztott
```

### 3.1 Rajz

A meglévő alaprajzi motor teljes munkaterületen jelenik meg.

Továbbra is elérhető:

- helyiségek;
- falszakaszok;
- nyílászárók;
- fotópontok;
- hibapontok;
- gépészeti pontok;
- tájolás;
- metszet;
- zoom és pan;
- tablet pinch-zoom.

### 3.2 Adatok

A teljes szakértői energetikai munkalap a központi területet használja.

Ide került:

- Beállítások;
- Geometria;
- Zónák;
- Nyílászárók;
- Zónaterhelés;
- U-érték;
- Szakértői táblák;
- WinWatt átadás;
- Állapot;
- Nyomvonal.

A Szakértői energetika lépés kiválasztásakor alapértelmezetten az Adatok nézet nyílik meg.

### 3.3 Osztott

Asztali képernyőn a rajz és az aktív energetikai adatlap egyszerre jelenik meg.

A két panel ugyanazt a projekt- és kiválasztási állapotot használja.

Nagy képernyőn az arány közelítőleg:

```text
Rajz: 52–55%
Adatok: 45–48%
```

Keskenyebb tableten az osztott nézet függőleges elrendezésre vált:

```text
Rajz felül
Adatlap alul
```

## 4. Jobb oldali energetikai board

A jobb panel energetikai módban csak rövid összesítést és navigációt tartalmaz.

Tartalma:

- kész/hiányos állapot;
- aktív szint;
- tíz energetikai munkalap navigációja;
- központi munkafelület megnyitása;
- Rajz / Adatok / Osztott gyorsváltó;
- lehűlő felület;
- kondicionált térfogat;
- nyílászáró darabszám és felület;
- méretezési fűtési teljesítmény;
- szakértői táblák száma;
- WinWatt blokkolt mezők száma;
- összesített javítandó tételszám.

A boardban nem jelenhet meg:

- részletes energetikai űrlap;
- szakértői adattábla;
- WinWatt mezőtérkép;
- hosszú próbajegyzőkönyv;
- többoszlopos műszaki szerkesztő.

## 5. Energetikai gyorskártyák

A központi munkafelület felső részén öt rövid kártya található:

```text
Geometria
Nyílászárók
Zónaterhelés
Szakértői táblák
WinWatt átadás
```

Minden kártya mutat:

- egy elsődleges eredményt;
- egy rövid kiegészítő értéket;
- figyelmeztető állapotot;
- közvetlen megnyitási lehetőséget.

Működés:

- asztali gépen natív hover-magyarázat és saját tooltip;
- tableten és mobilon koppintás;
- kattintás után a teljes központi munkalap nyílik meg.

A fontos információ nem kizárólag hoverben található.

## 6. Energetikai fülnavigáció

A központi adatmunkatér tíz füle konténerszélességhez igazodik.

Fő szabály:

```css
grid-template-columns: repeat(auto-fit, minmax(118px, 1fr));
```

Eredmény:

- nagy képernyőn egyenletes elosztás;
- keskenyebb munkaterületen több sor;
- legalább 40–44 px magas érintési cél;
- nincs egymást fedő felirat;
- nincs részben kattintható fül.

## 7. Normál asztali elrendezés

Más munkalapok megtartják a korábbi szélességeket.

Energetikai munkalapon a normál háromoszlopos elrendezés külön méreteket használ:

```text
Bal navigáció: 190 px
Központi munkaterület: rugalmas
Jobb board: 280 px
```

A korábbi energetikai méret:

```text
Bal navigáció: 250 px
Jobb panel: 350 px
```

A változtatás célja, hogy 1366 px széles laptopon is legalább körülbelül 800 px központi adatlap maradjon.

## 8. Teljes képernyős szakértői munkatér

A teljes képernyős módban is ugyanaz a három nézet működik.

### 8.1 Központi Adatok nézet

- külön felső fejléccel;
- saját görgetési tartománnyal;
- a felső fókuszsáv és alsó eszközdokk között;
- 60 px biztonsági oldaltérrel asztali gépen;
- 54–56 px oldaltérrel tableten és mobilon.

### 8.2 Központi Osztott nézet

Asztali gépen két hasáb:

```text
minmax(0, 1.08fr)
minmax(480px, 0.92fr)
```

1180 px alatt függőleges elrendezésre vált.

### 8.3 Jobb fókuszpanel

Energetikai lépésnél a fókuszpanel kizárólag a rövid boardot tartalmazza.

A részletes munkalap nem kerül vissza a keskeny panelbe.

## 9. Tablet működés

### 9.1 Fekvő tablet

Igazolt méret:

```text
Viewport: 1194 × 834 px
Központi adatlap: 936 px
```

Fő szabályok:

- teljes szélességű adatlap;
- használható fülméret;
- nincs teljes oldali vízszintes overflow;
- táblázatok saját paneljükben görgethetők.

### 9.2 Álló tablet

Igazolt méret:

```text
Viewport: 834 × 1194 px
Központi adatlap: 802 px
```

Fő szabályok:

- egyszerre önálló Rajz vagy Adatok nézet ajánlott;
- minimum 40 px magas energetikai fülek;
- a munkalap nem szorul jobb oldali sávba;
- az aktív kiválasztás megmarad nézetváltáskor.

### 9.3 Mobil

Igazolt méret:

```text
Viewport: 390 × 844 px
Központi adatlap: 358 px
```

A WinWatt mezőtérkép saját panelen belül vízszintesen görgethető. A teljes oldal nem lóg ki.

## 10. Igazolt munkaterület-szélességek

Candidate vizuális teszt:

```text
1920 × 1080 asztali:       1242 px
1366 × 768 laptop:          808 px
1194 × 834 tablet fekvő:    936 px
834 × 1194 tablet álló:     802 px
390 × 844 mobil:            358 px
```

Normál osztott nézet 1920 px-en:

```text
Rajzpanel: 643,6 px
Adatpanel: 582,3 px
```

Teljes képernyős osztott nézet 1920 px-en:

```text
Rajzpanel: 966,6 px
Adatpanel: 823,4 px
```

## 11. Munkaidőmérő célja

A stopper az adott felmérésen végzett munkát méri.

Nem indul el automatikusan az oldal megnyitásakor.

A felhasználó indítja:

```text
Munka indítása
```

Állapotok:

```text
Nem fut
Fut
Szüneteltetve
Lezárt munkamenet
```

## 12. Munkaidőmérő felület

A stopper elérhető:

- normál Felmérő-fejlécben;
- teljes képernyős fókuszfejlécben.

Összesítő kártyák:

```text
Aktuális munkamenet
Mai munkaidő
Felmérés összes ideje
```

Műveletek:

- indítás;
- szünet;
- folytatás;
- lezárás;
- operátor megadása;
- eszköz megadása;
- kézi perckorrekció;
- megjegyzés;
- legutóbbi munkamenetek megtekintése.

## 13. Munkaidőmérő adatmodell

Új projektadat:

```text
workTimerWorkspace
```

Séma:

```text
schemaVersion: 1
```

Fő mezők:

```text
status
activeSessionId
sessions
updatedAt
```

Munkamenet:

```text
id
startedAt
endedAt
status
note
operatorName
deviceLabel
manualAdjustmentSeconds
segments
updatedAt
```

Munkaszakasz:

```text
id
stepId
startedAt
endedAt
```

## 14. Munkalaponkénti idő

Futó stopper mellett a munkalapváltás automatikusan:

1. lezárja az előző munkaszakaszt;
2. új szakaszt indít az új munkalaphoz;
3. megőrzi az összes nettó időt.

Például:

```text
Ingatlan: 00:10:00
Alaprajz: 00:05:00
Energetika: 00:10:00
Kézi korrekció: 00:02:00
Felmérés összesen: 00:27:00
```

## 15. Stopper perzisztencia

A stopper a felmérés draftállapotában tárolódik.

Ezért:

- oldalfrissítés után folytatódik;
- aktív munkamenet nem vész el;
- szüneteltetett állapot megmarad;
- lezárt munkamenet a projektadat része marad;
- `.dimpro` export tartalmazza.

## 16. Migráció

Régi projekt megnyitásakor automatikusan létrejön:

```text
workTimerWorkspace.schemaVersion = 1
workTimerWorkspace.status = "idle"
workTimerWorkspace.sessions = []
```

A régi projekt nem blokkolódik, és nem indul el automatikusan a stopper.

## 17. Munkafájl séma

Új `.dimpro` séma:

```text
dimpro.property-survey.v0.8.4.1
```

Az energetikai számítási és WinWatt-sémák változatlanok:

```text
dimpro.winwatt-compatible.v0.8.4
dimpro.winwatt-transfer.v0.8.4
dimpro.winwatt-trial-package.v0.8.4
dimpro.winwatt-trial-feedback.v0.8.4
dimpro.winwatt-field-map.v0.8.3
dimpro.energy-renovation-comparison.v0.8.2
dimpro.energy-renewable-sizing.v0.8.0
```

## 18. Vizuális elfogadási feltételek

A v0.8.4.1 új tesztszabályai:

- kritikus gomb teljes bounding boxa legyen a viewporton belül;
- központi adatlapnak legyen rögzített minimum használható szélessége;
- jobb board ne tartalmazzon részletes szakértői komponenst;
- tíz energetikai navigációs gomb legyen olvasható;
- minimum 40 px magas érintési cél;
- Rajz / Adatok / Osztott kapcsoló legyen elérhető;
- osztott nézet mindkét panelje legyen használható;
- mobil táblázat csak saját panelen belül görgessen;
- teljes oldal ne legyen vízszintesen túlcsorduló;
- stopper összesítői legyenek olvashatók;
- oldalfrissítés után a stopper állapota maradjon meg;
- konzol- és oldalhiba nem megengedett.

## 19. Vizuális referencia-képernyőképek

Candidate teszt során készült:

```text
1920x1080_split.png
1366x768_data.png
1194x834_data.png
834x1194_data.png
390x844_transfer.png
1920x1080_focus_split.png
```

Ezek a vizuális release-ellenőrzés belső referenciafájljai.

## 20. Automatizált tesztek

### 20.1 Stopper domain

```text
43/43
```

Ellenőrzött:

- üres munkatér;
- migráció;
- indítás;
- duplikált indítás blokkolása;
- munkalapváltás;
- szünet;
- folytatás;
- kézi korrekció;
- napi és felmérési összeg;
- lezárás;
- időformázás.

### 20.2 Teljes domain- és integrációs készlet

```text
Stopper:                        43/43
WinWatt próbanapló:             45/45
Szakértői átadás:               78/78
WinWatt mezőtérkép:             21/21
Változat-összehasonlítás:       38/38
Megújuló/villamos:              44/44
Felújítási workflow:            39/39
Javaslatmotor:                  18/18
Zónaterhelés:                   36/36
Nyílászárók és hőhidak:         43/43
Zónák:                          25/25
Rétegrendi U-motor:             28/28
Összesen:                      458/458
```

### 20.3 Vizuális és stopper E2E

```text
15/15
```

### 20.4 v0.8.4 regresszió

```text
35/35
```

### 20.5 Történeti energetikai regresszió

Sikeres.

### 20.6 Alap Felmérő-regresszió

Sikeres:

- PDF;
- DXF;
- WinWatt;
- `.dimpro`;
- rajzlap;
- metszet;
- fotók;
- responsive működés.

### 20.7 Tablet

```text
Álló 834 × 1194: sikeres
Fekvő 1194 × 834: sikeres
Pinch-zoom: 2,15
Oldalelmozdulás: 0
```

### 20.8 Assetaudit

```text
Candidate: 15/15
```

## 21. Érintett fő fájlok

```text
components/property-survey/PropertySurveyPage.tsx
components/property-survey/propertySurveyWorkspaceTypes.ts
components/property-survey/propertySurveyWorkTimer.ts
components/property-survey/PropertySurveyWorkTimer.tsx
components/property-survey/energy/PropertySurveyEnergyWorkspace.tsx
components/property-survey/energy/EnergyWorkspaceSummaryBoard.tsx
components/viewers/SurveyFloorPlanEngine.tsx
scripts/test-property-survey-work-timer-v0841.cjs
scripts/test-property-survey-responsive-workspace-v0841.cjs
scripts/test-property-survey-energy-v080.cjs
scripts/test-property-survey-energy-v075.cjs
scripts/test-property-survey-v061.cjs
```

## 22. Ismert korlátozások

- a stopper jelenleg felmérésenként tárolódik;
- több felmérés projektösszesített ideje még nem jelenik meg közös riportban;
- automatikus inaktivitásérzékelés még nincs;
- óradíj- és számlázási kapcsolat még nincs;
- szerveres többfelhasználós munkaidő-adatbázis még nincs;
- a helyi MVP-ben az aktív munkamenet a felmérés draftállapotában tárolódik;
- a vizuális teszt bounding box és screenshot alapú, nem automatikus képpixel-differencia;
- a fejlesztés nem módosítja a havi vagy éves energetikai számítási motort.

## 23. Következő lehetséges fejlesztések

Külön fejlesztési körben:

- projektösszesített munkaidő;
- felhasználónkénti időkimutatás;
- napi/heti/havi riport;
- inaktivitási figyelmeztetés;
- kézi munkamenet-szerkesztés;
- óradíj és munkadíj-előkészítés;
- szerveroldali perzisztencia;
- vizuális screenshot-differencia referencia-alapú ellenőrzéssel.

A következő energetikai fejlesztés továbbra is csak tényleges WinWatt-asztali próba után indokolt.

## 24. Élesítés

```text
Éles oldal: https://dimpro.hu/ingatlanfelmero
Aktív build: -SsugSS1etgbA6J_2f5hu
PM2 process: dimprover
PM2 PID: 2317258
Rollback: .next_before_energy_v0841_20260730_082322
Forrásbackup: backups/energy_v0841_responsive_workspace_timer_20260730_070702
Dev Center: version_e330e034-912
```

Éles ellenőrzések:

- HTTP 200;
- vizuális és stopper E2E: 15/15;
- v0.8.4 teljes felhasználói regresszió: 35/35;
- történeti energetikai E2E: 42/42;
- domain- és integrációs tesztek: 458/458;
- alap Felmérő-, PDF-, DXF-, WinWatt- és `.dimpro` regresszió: sikeres;
- rajzlap- és PDF-regresszió: sikeres;
- PDF: 11 oldal;
- `.dimpro`: `dimpro.property-survey.v0.8.4.1`;
- tablet álló és fekvő érintésteszt: sikeres;
- pinch-zoom: 2,15;
- érintés közbeni oldalelmozdulás: 0;
- éles assetaudit: 15/15;
- böngészőkonzol-hiba: 0;
- oldalhiba: 0;
- friss PM2 naplónövekmény: 0 hibabájt;
- nginx konfiguráció: hibamentes;
- hat éles vizuális referencia-képernyőkép archiválva a forrásbackupban.

A függőségi audit és a külön kezelt npm-függőségi figyelmeztetések nem részei ennek a kiadásnak.
