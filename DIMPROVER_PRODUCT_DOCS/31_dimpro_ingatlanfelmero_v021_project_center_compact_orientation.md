# DIMPRO Ingatlanfelmérő v0.2.1 – Projektközpont, üres alaprajz és kompakt tájolás

Dátum: 2026-07-27

## Kiadás

- Modul: **DIMPRO Ingatlanfelmérő**
- Verzió: **v0.2.1**
- Route: `/ingatlanfelmero`
- Nyilvános elérés: `https://dimpro.hu/ingatlanfelmero`
- Aktív production build: `OzcvgQYBEfURuz9EXeCMT`

## Fejlesztési cél

A v0.2.1 három használhatósági problémát old meg:

1. a tájolási vezérlő túl sok függőleges helyet foglalt a rajztérből;
2. nem volt külön projekt- és felmérésindítási folyamat;
3. üres alaprajz esetén nem volt egyértelmű és ténylegesen használható kezdőművelet.

## Projektközpont

Az Ingatlanfelmérő új projektközponttal indul.

Funkciók:

- új projekt létrehozása;
- projektkód, helyszín, megrendelő és megjegyzés;
- projektek listázása;
- projektenként több külön ingatlanfelmérés;
- meglévő felmérés folytatása;
- felmérések utolsó módosítási ideje;
- projektből a munkatérbe és vissza történő navigáció.

Hierarchia:

```text
Projekt
└── Ingatlanfelmérés
    ├── energetikai felmérés
    ├── felújítási felmérés
    ├── műszaki állapotfelmérés
    └── gyors alaprajz
```

A webes MVP jelenleg böngészőoldali localStorage-ban tárolja a projekt- és felmérésrekordokat. Az adatmodell külön `projectId` és `surveyId` azonosítóval készült, így később szerveres DIMPRO projekttörzsre vezethető át.

## Új felmérés indítása

A projekt megnyitása után az `Új ingatlanfelmérés` gombbal készíthető új rekord.

Választható felmérési módok:

- Energetikai felmérés;
- Felújítási felmérés;
- Műszaki állapotfelmérés;
- Gyors alaprajz.

Alaprajzi indulási módok:

- **Üres alaprajz** – működő kézi rajzolás;
- **Mintafelmérés** – működő, hét helyiséges minta;
- **LiDAR / RoomPlan** – előkészítve, még nem aktív;
- **PDF vagy kép import** – előkészítve, még nem aktív.

A nem elkészült integrációk letiltott, egyértelműen `Előkészítve` állapotú kártyák; a felület nem jelez valótlan kész funkciót.

## Üres alaprajz és első helyiség

Az üres felmérés tiszta alaprajzzal indul. A rendszer nem jelenít meg mintafalakat, ajtóíveket, hőhatárt vagy méretvonalat addig, amíg nincs helyiség.

Kezdési folyamat:

1. `Első helyiség rajzolása` vagy `Helyiség rajzolása`;
2. érintéssel vagy egérrel téglalap kihúzása az alaprajzon;
3. új helyiség automatikus létrehozása;
4. automatikus sorszám és név, például `01 Új helyiség`;
5. kezdeti alapterület becslése a rajzi méretből;
6. jobb oldali panelen név, funkció, pontos alapterület, belmagasság és fűtött állapot módosítása.

Alternatív gyorsműveletként a `Gyors helyiség` gomb alapméretű helyiséget hoz létre.

A helyiségrajzolás a közös `SurveyFloorPlanEngine` része, ezért később más DIMPRO/DIMPROVER felületeken is használható.

## Kompakt tájolási vezérlő

A korábbi háromkártyás, magas tájolási blokk helyett egy kompakt eszközsáv készült.

Alapállapotban látható:

- a lap felső oldalának iránya és azimutja;
- 8 gyors égtájgomb: É, ÉK, K, DK, D, DNy, Ny, ÉNy;
- a felső, jobb, alsó és bal oldal WinWatt-tájolása;
- `Részletes tájolás` lenyitható gomb.

Lenyitva jelenik meg:

- az 1°-os finomhangoló csúszka;
- az aktuális északi szög;
- rövid WinWatt magyarázat.

Mért desktop eredmény:

- teljes alaprajzi motor: 700 px magas;
- kompakt tájolási sáv: 55 px;
- rajztér: 538 px;
- részletes panel lenyitásakor az alapsáv magassága változatlan marad, a részletes panel lebegő rétegként nyílik meg.

## Korábbi adatok migrációja

A v0.2 és korábbi egyfelméréses localStorage adatai automatikusan migrálódnak:

- új projekt neve: `Korábbi helyi felmérés`;
- a korábbi felmérés neve, helyiségei és energetikai adatai megmaradnak;
- a korábbi HJ hibajegyek megmaradnak;
- a felmérés az új projekt–felmérés hierarchiában folytatható.

## Tárolási modell

Új localStorage kulcs:

```text
dimpro-property-survey-workspace-v1
```

A workspace tartalma:

- projektek;
- felmérések;
- aktív projekt és felmérés;
- felmérésenként külön draft;
- felmérésenként külön hibajegyek;
- létrehozási és módosítási időpontok.

A korábbi localStorage kulcsok kompatibilitási tükörként ideiglenesen továbbra is frissülnek.

JSON export séma:

```text
dimpro.property-survey.v0.2.1
```

Az export már tartalmazza a projekt- és felmérésmetaadatokat is.

## Érintett fájlok

Új fájlok:

- `components/property-survey/PropertySurveyProjectCenter.tsx`
- `components/property-survey/propertySurveyWorkspaceTypes.ts`

Módosított fájlok:

- `components/property-survey/PropertySurveyPage.tsx`
- `components/viewers/SurveyFloorPlanEngine.tsx`

## Biztonsági mentés

```text
backups/ingatlanfelmero_v021_project_compact_20260727_100926
```

Production rollback:

```text
/root/dimprover/.next_before_ingatlan_v021_20260727_103226
```

## Teszteredmények

- TypeScript: sikeres;
- érintett fájlok ESLint: 0 hiba, 0 figyelmeztetés;
- candidate production build: sikeres, exit code 0;
- 123 standalone statikus chunk ellenőrizve;
- candidate asset audit: 12/12 sikeres;
- éles főoldali asset audit: 13/13 sikeres;
- éles Ingatlanfelmérő asset audit: 12/12 sikeres;
- új projekt létrehozása: sikeres;
- új üres felmérés létrehozása: sikeres;
- első helyiség húzással történő rajzolása: sikeres;
- automatikus helyiségnév és alapterület: sikeres;
- második mintafelmérés ugyanazon projektben: sikeres;
- első felmérés visszanyitása és adatmegőrzése: sikeres;
- korábbi felmérés és HJ hibajegy migrációja: sikeres;
- tájolási gyorsgomb és WinWatt oldalak regressziója: sikeres;
- HJ-002 hibapont-regresszió: sikeres;
- desktop, tablet és mobil: nincs vízszintes overflow;
- JavaScript- és hálózati hiba: nincs;
- PM2 `dimprover`: online;
- `app.dimpro.hu/ingatlanfelmero`: helyesen a login oldalra irányít.

## Ismert korlátok

- a projekt- és felmérésadatok még helyi böngészőtárban vannak, nem központi adatbázisban;
- külön böngésző vagy másik eszköz jelenleg nem látja automatikusan ugyanazokat a felméréseket;
- nincs még projektjogosultság és többfelhasználós szinkron;
- a kézi alaprajz jelenleg téglalap alakú helyiségekből épül;
- nincs még falszakasz-fogópont, L alakú helyiség, falvastagság és közös falillesztés;
- LiDAR/RoomPlan és PDF/kép import még előkészített állapotú;
- a szerveres DIMPRO projekttörzzsel való összevonás következő fejlesztési kör.

## Következő fejlesztési javaslat

1. Szerveres projekt-, felmérés-, szint-, helyiség- és hibajegy-adatmodell.
2. Bejelentkezett felhasználóhoz és szervezeti jogosultsághoz kötött projektlista.
3. Több szint és több épület kezelése projekten belül.
4. Falrajzolás, csomópontok, közös falillesztés és nem téglalap alakú helyiségek.
5. Bluetooth-lézer mérések fogadása az aktív falszakaszhoz.
6. PDF/kép import, kalibrálás és átrajzolás.
7. iPad RoomPlan/LiDAR natív bridge.
8. Hibafotók és általános felmérési fotók DIMPRO Drive tárhelyre mentése.
