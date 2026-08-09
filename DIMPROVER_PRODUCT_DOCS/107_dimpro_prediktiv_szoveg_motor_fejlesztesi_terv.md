# DIMPRO Prediktív szöveg motor – fejlesztési terv

**Állapot:** tervezett közös platformmotor  
**Rögzítés dátuma:** 2026. augusztus 6.  
**Célrendszerek:** DIMPRO, DIMPROVER, DIMPROVER AI, Projektkapu és kapcsolódó szerkesztőfelületek

## 1. Cél

A Prediktív szöveg motor saját DIMPRO-szintű szövegjavaslati engine legyen. Gépelés közben a felhasználó munkakörnyezetéhez, aktuális projektjéhez és az adott modulhoz illő szavakat, mondatrészeket, teljes mondatokat és kitölthető sablonokat ajánljon fel.

A motor ne kizárólag a telefon vagy számítógép billentyűzetének általános predikciójára épüljön. Ismerje a DIMPRO szakmai nyelvét, a szervezet saját megfogalmazásait, a projekt résztvevőit, helyszíneit, dokumentumait, feladatait és a felhasználó gyakran használt fordulatait.

## 2. Alapelv

A fejlesztési sorrend:

1. DIMPRO szakmai szövegadatbázis;
2. gyors, szabályalapú keresés és rangsorolás;
3. szervezeti, projekt- és személyes tanulás;
4. opcionális AI-kiegészítés.

Az első működő verzióhoz nem szükséges generatív AI. A gyorsaságot, kiszámíthatóságot és alacsony üzemeltetési költséget PostgreSQL-alapú keresés és használati statisztika biztosítsa.

## 3. Javaslati szintek

### 3.1. Szójavaslat

Példa: `kivit...`

- kivitelező;
- kivitelezési;
- kivitelezői.

### 3.2. Mondatrész-javaslat

Példa: `A kivitelező feladata...`

- A kivitelező feladata a munkaterület megtisztítása.
- A kivitelező feladata a hiányosságok megszüntetése.

### 3.3. Teljes mondat

Példa: `A tervező küld...`

- A tervező küldje meg a javított tervdokumentációt.
- A tervező küldje meg a hiányzó műszaki adatokat.

### 3.4. Kitölthető sablon

Példa:

`A kivitelező a feltárt hibát legkésőbb {{hatarido}} napjáig javítsa ki.`

A rendszer a beszúrás után a változó mezőkre léptesse a felhasználót, vagy ajánljon projektadatot, felelőst és dátumot.

## 4. Többszintű szövegadatbázis

A szövegforrások négy szinten működjenek:

1. **DIMPRO központi szótár** – általános építőipari, projektvezetési, dokumentációs és adminisztratív kifejezések;
2. **Szervezeti szótár** – a vállalkozás saját sablonjai, szóhasználata, rövidítései és kötelező mondatai;
3. **Projekt szótár** – projektnevek, helyszínek, épületek, szakágak, résztvevők, vállalkozók, dokumentumok és gyakori feladatok;
4. **Személyes szótár** – a felhasználó által mentett vagy gyakran kiválasztott mondatok.

A találatoknál mindig érvényesüljön a jogosultság. Más szervezet, projekt vagy felhasználó személyes szövege nem jelenhet meg.

## 5. Elsődleges felhasználási helyek

Az első integrációs sorrend:

1. értekezleti és kooperációs jegyzőkönyv;
2. hibajegyzék és hibajegy;
3. terepi állapotrögzítés;
4. projektfeladatok és határidők;
5. napi jelentés és e-napló;
6. e-mail- és értesítésszerkesztő;
7. projektvezetői összefoglaló;
8. később minden közös DIMPRO szövegszerkesztő mező.

A motort közös engine-ként kell megépíteni, nem modulonként külön logikával.

## 6. MVP funkciók

Az első működő verzió tartalmazza:

- központi szakmai mondat- és kifejezésadatbázis;
- projektnevek, résztvevők, cégek és helyszínek javaslata;
- modulonként eltérő szövegkészlet;
- gépelés közben legfeljebb öt rangsorolt találat;
- beszúrás kattintással, érintéssel, Enter vagy Tab billentyűvel;
- billentyűzetes fel/le navigáció és Escape bezárás;
- `Mentés saját sablonként` funkció;
- `Ne ajánlja többet` funkció;
- használati gyakoriság és legutóbbi használat szerinti tanulás;
- helyes több-bérlős jogosultságkezelés;
- gyors válaszidő és üres találat esetén zavartalan normál gépelés;
- mobil-, tablet- és desktop-kompatibilis javaslatpanel.

## 7. Javasolt adatmodell

Alaptábla:

```sql
CREATE TABLE predictive_text_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,
  project_id UUID,
  owner_user_id UUID,
  module_key VARCHAR(100),
  category VARCHAR(100) NOT NULL,
  profession VARCHAR(100),
  suggestion_type VARCHAR(30) NOT NULL DEFAULT 'sentence',
  title VARCHAR(255) NOT NULL,
  text_content TEXT NOT NULL,
  normalized_content TEXT NOT NULL,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  placeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
  usage_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 0,
  source_level VARCHAR(30) NOT NULL,
  is_global BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

Kiegészítő táblák javasoltak:

- `predictive_text_usage_events` – kiválasztás, elutasítás, módosítás és beszúrás utáni használat;
- `predictive_text_hidden_suggestions` – felhasználói `Ne ajánlja többet` beállítások;
- `predictive_text_user_preferences` – személyes predikciós beállítások;
- `predictive_text_dictionary_terms` – rövid szavak, nevek és szakmai kifejezések;
- `predictive_text_import_batches` – adminisztrátori tömeges import és audit.

PostgreSQL-kiegészítések:

- `pg_trgm` hasonlósági kereséshez;
- teljes szöveges keresés magyar konfigurációval vagy saját normalizálással;
- trigram és GIN indexek;
- szervezet-, projekt-, modul- és aktívállapot-indexek.

## 8. API-javaslat

### 8.1. Találatok lekérése

`GET /api/predictive-text/suggestions`

Paraméterek:

- `q` – aktuális szó vagy mondatrész;
- `moduleKey` – aktuális DIMPRO modul;
- `projectId` – kiválasztott projekt;
- `fieldKey` – konkrét mezőtípus;
- `limit` – legfeljebb 5 az MVP-ben.

### 8.2. Használati esemény

`POST /api/predictive-text/usage`

Eseménytípusok:

- `shown`;
- `selected`;
- `dismissed`;
- `hidden`;
- `saved_as_personal`;
- `edited_after_insert`.

### 8.3. Saját sablon mentése

`POST /api/predictive-text/templates`

### 8.4. Adminisztráció

- sablonok létrehozása és szerkesztése;
- CSV/Excel import;
- duplikációellenőrzés;
- aktív/inaktív állapot;
- szervezeti és modulhatókör;
- használati statisztika.

## 9. Rangsorolási logika

Az MVP pontszáma több tényezőből álljon:

- pontos szó- vagy mondatkezdet-egyezés;
- kulcsszóegyezés;
- trigram-hasonlóság;
- aktuális modul egyezése;
- aktuális mező egyezése;
- projektazonosság;
- szervezeti prioritás;
- személyes használati gyakoriság;
- legutóbbi használat;
- adminisztrátori prioritás;
- korábban elrejtett találat kizárása.

Ajánlott prioritási sorrend:

1. személyes + aktuális projekt + aktuális modul;
2. projekt + aktuális modul;
3. szervezeti + aktuális modul;
4. központi DIMPRO + aktuális modul;
5. általános központi találatok.

A rangsor képlete verziózott és tesztelhető legyen, hogy később mérési adatok alapján módosítható maradjon.

## 10. Felhasználói felület

A javaslatpanel:

- közvetlenül a beviteli mező alatt vagy fölött jelenjen meg a rendelkezésre álló hely szerint;
- ne takarja el a gépelt szöveget;
- mutassa a találat forrását finoman: `Projekt`, `Szervezeti`, `Saját`, `DIMPRO`;
- a teljes mondat mellett emelje ki a gépelt egyező részt;
- mobilon érintésbarát sorokat használjon;
- hosszú mondat esetén két-három soros előnézetet adjon;
- tartalmazzon gyors `+ Saját sablon` és `Ne ajánlja` műveletet;
- a predikció kikapcsolható legyen felhasználónként és mezőnként;
- a böngésző vagy mobil billentyűzet saját helyesírás-ellenőrzése továbbra is működhessen.

## 11. Adatvédelem és biztonság

Kötelező elvek:

- szervezeti és projektadatok tenant-szintű elválasztása;
- kizárólag a felhasználó által elérhető projektekből származó javaslat;
- érzékeny mezőkben predikció alapból tiltva;
- jelszó, PIN, token, személyes azonosító, pénzügyi titok és más védett adat nem kerülhet tanulási eseménybe;
- naplózott adminisztrátori import és módosítás;
- törölhető személyes előzmények;
- adatmegőrzési idő és anonimizálható használati statisztika;
- API rate limit és lekérdezéshossz-korlát;
- szerveroldali jogosultságellenőrzés minden kérésnél.

## 12. Opcionális AI-réteg

Az AI csak későbbi kiegészítés legyen. Lehetséges funkciók:

- teljes mondat megfogalmazása az aktuális projektadatból;
- szakmaibb vagy közérthetőbb átírás;
- helyesírás és nyelvhelyesség javítása;
- korábbi jegyzőkönyvi pontok alapján új javaslat;
- hiányzó felelős, határidő vagy döntés jelzése;
- többnyelvű javaslat.

Az AI-hívás csak gombnyomásra vagy külön engedélyezett módban fusson. A hagyományos prediktív motor AI nélkül is teljes értékűen működjön.

## 13. Fejlesztési ütemezés

### 0. szakasz – részletes specifikáció

- első pilotmodul kiválasztása;
- mezőtípusok és jogosultsági szabályok rögzítése;
- adatmodell és API-szerződés véglegesítése;
- rangsorolási képlet;
- UI-prototípus;
- elfogadási tesztek.

### 1. szakasz – közös engine és adatbázis

- PostgreSQL-séma és migráció;
- repository és service layer;
- kereső- és rangsorolómotor;
- jogosultságkezelés;
- admin seed adatbázis;
- automatikus tesztek.

### 2. szakasz – első modul-integráció

Javasolt pilot: jegyzőkönyv vagy hibajegyzék.

- közös React komponens/hook;
- billentyűzetes és érintéses kezelés;
- saját sablon mentése;
- használati események;
- legalább 10 valós szakmai mintafolyamat.

### 3. szakasz – projekt- és személyes tanulás

- projektnevek és résztvevők automatikus indexelése;
- személyes rangsor;
- elrejtett javaslatok;
- statisztika és adminfelület.

### 4. szakasz – több modul és opcionális AI

- közös szerkesztőkomponensekbe integrálás;
- modulonkénti szövegcsomagok;
- import/export;
- AI feature flagek és költségkorlátok.

## 14. MVP elfogadási feltételek

Az MVP akkor tekinthető késznek, ha:

- legalább 500 szakmailag ellenőrzött központi kifejezés vagy mondat kezelhető;
- a megfelelő jogosultságú találatok 300 ms-on belül megjelennek tipikus terhelésen;
- egyszerre legfeljebb öt releváns javaslat látható;
- egérrel, érintéssel, Enterrel és Tabbal beszúrható a találat;
- a javaslatpanel nem okoz mobil vagy desktop túlcsordulást;
- a projekt- és szervezethatárok automatikus tesztekkel igazoltak;
- a `Mentés saját sablonként` és `Ne ajánlja többet` működik;
- a használati események nem tárolnak érzékeny beviteli tartalmat;
- a pilotmodul legalább tíz valós DIMPRO munkafolyamatán sikeresen tesztelt;
- teljes dokumentáció, rollback és adatbázis-migrációs leírás készül.

## 15. Folytatási pont új csevegéshez

Új fejlesztési körben elsőként ezt a dokumentumot kell beolvasni:

`/root/dimprover/DIMPROVER_PRODUCT_DOCS/107_dimpro_prediktiv_szoveg_motor_fejlesztesi_terv.md`

A kódolás előtt az alábbi döntéseket kell véglegesíteni:

1. melyik modul legyen az első pilot;
2. mely mezőkben legyen alapból aktív;
3. milyen szakmai mondatcsomaggal induljon;
4. hogyan súlyozzuk a központi, szervezeti, projekt- és személyes találatokat;
5. milyen felhasználói szerepkör szerkesztheti a közös szótárakat;
6. milyen adatmegőrzési szabály vonatkozzon a használati eseményekre.

A jelenlegi terv elegendő a fejlesztés későbbi biztonságos folytatásához. Közvetlen kódolás előtt azonban a 0. szakasz döntéseit külön, rövid specifikációs körben véglegesíteni kell.
