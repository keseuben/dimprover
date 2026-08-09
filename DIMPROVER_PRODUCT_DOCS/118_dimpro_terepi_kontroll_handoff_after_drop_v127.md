# DIMPRO Terepi Kontroll – következő csevegés átadás

Dátum: 2026-08-08  
Állapot: PLANNED  
Fejlesztési Központ: `version_3f17e05a-4d2`

## Főmodul

**DIMPRO Terepi Kontroll**

Tervezett almodulok:

1. **Bejárás**
2. **Hibák**
3. **Állapotrögzítés**
4. **Fotódokumentáció**

A modul legyen külön főmodul. Nem szabad a DIMPRO Sendet vagy a Gyors KépSendet túlterhelni a professzionális terepi dokumentációs funkciókkal.

## Beszéd és AI

A Terepi Kontrollban a Gyors KépSend egyszerű device-diktálásával szemben professzionális **szerveres beszéd→szöveg motor** szükséges.

Tervezett működés:

- hangfelvétel a telefon mikrofonjával;
- látható visszaszámláló és állapotgép;
- online esetben szerveres átírás;
- offline esetben a hang ideiglenesen tartós helyi tárba / offline queue-ba kerül;
- kapcsolat visszatérésekor automatikus feltöltés és szerveres átírás;
- sikeres átirat után az ideiglenes helyi és szerveres hang automatikus törlése;
- csak a szöveg marad meg alapértelmezetten.

A szerveres beszédfelismerés fizetős/licencelt funkció legyen, például percalapú kerettel.

Az AI két külön funkció legyen:

- **AI – Szöveg rendezése**: helyesírás, mondatszerkezet, érthetőség javítása, a műszaki tartalom megváltoztatása nélkül;
- **AI – Műszaki megfogalmazás**: rövid, jegyzőkönyvszerű, építőipari szakmai megfogalmazási javaslat.

Mindkettő külön fizetős/licencjogosultságot és használati keretet kaphat.

Az eredeti átirat, AI-javaslat és végleges felhasználói szöveg külön kezelendő.

## Képes terepi dokumentáció

A fotókhoz szükséges:

- képenkénti megjegyzés;
- hangos megjegyzés;
- szakág választása;
- hibatípus / státusz / felelős / határidő;
- szakágankénti hibajelölők;
- szabadkézi rajzolás;
- alakzatok: nyíl, vonal, téglalap, kör, felhő stb.;
- képjelölő/annotációs réteg;
- eredeti és jelölt kép együttes kezelése.

## AI összefoglaló

Sok kép és megjegyzés alapján a rendszer készíthessen:

- bejárási összefoglalót;
- szakágankénti hibajegyzéket;
- nyitott feladatlistát;
- kiemelt kockázatokat;
- vezetői / projektvezetői rövid összefoglalót.

Az AI nem írhatja felül automatikusan az eredeti terepi adatokat.

## Projekt és dokumentumkapcsolat

A felhasználó előre megadhasson és elmenthessen dokumentumfejléc-adatokat:

- projekt neve;
- projektkód;
- megrendelő;
- kivitelező / tervező / szerepkörök;
- helyszín;
- dátum;
- dokumentumtípus;
- egyéb fejlécmezők.

Új dokumentumnál ezekből projekt választható.

Később Projektkapu-integráció:

- Projektkapu-kóddal / központi jogosultsággal a nagy projektek listázhatók;
- kiválasztott projekthez automatikus dokumentumsorszám adható;
- elkészült dokumentum automatikusan a projekt **Drive / Beérkező Drop** céljához kerülhet;
- közös projektazonosítók használata, párhuzamos adattár nélkül.

## Dokumentumgenerálás

A végső terepi dokumentum legalább két formában készül:

- PDF;
- **szerkeszthető dokumentum** a későbbi fejlécezés, finomítás és továbbdolgozás miatt.

A képek, jelölések, megjegyzések és AI-val elfogadott végleges szövegek strukturáltan kerüljenek a dokumentumba.

## Licencelési irány

Külön jogosultságok indokoltak:

- szerveres beszéd→szöveg;
- havi/periódusos beszédperc-keret;
- felvételenkénti maximális idő;
- AI Szöveg rendezése;
- AI Műszaki megfogalmazás;
- AI összefoglaló;
- képjelölő / fejlett terepi eszközök szükség szerint csomagszinten.

## Kapcsolat a Gyors KépSenddel

A Gyors KépSend marad egyszerű:

- gyors fotófeltöltés;
- max. 60 mp device/browser diktálás;
- kézi megjegyzés;
- csoportok;
- küldés.

Nem kerül bele szerveres Speech Engine, AI szövegrendezés, műszaki AI vagy teljes képannotációs rendszer. Ezek a Terepi Kontroll feladatai.

## Következő fejlesztési kör

Az új csevegésben először a Terepi Kontroll részletes funkcionális és adatmodell-specifikációját kell elkészíteni, majd MVP fejlesztési sorrendet meghatározni. Első MVP-javaslat: projektválasztás → Bejárás → fotó + hang + megjegyzés → egyszerű képjelölés → hibakategória → összesítő lista → PDF + szerkeszthető export.
