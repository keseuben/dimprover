# DIMPRO Felmérő v0.8.4.3 – PDF tervlap alapú felmérés MVP

Dátum: 2026-07-30  
Projekt: DIMPRO / DIMPROVER  
Éles felület: `https://dimpro.hu/ingatlanfelmero`  
Dev Center verzió: `version_763fd571-b2a`

## 1. Fejlesztési cél

A v0.8.4.3 külön, a WinWatt v0.8.5 próbakörtől független fejlesztési ág. Célja, hogy új építésű vagy dokumentációból feldolgozható ingatlan energetikai geometriai előkészítése PDF tervdokumentáció alapján, helyszíni felmérés nélkül is megkezdhető legyen.

A központi WinWatt-mezőtérkép, a WinWatt JSON-, Excel-, ZIP- és visszamérési logika nem módosult. A v0.8.5 verziószám továbbra is a valós WinWatt-próbaadatokra épülő fejlesztéshez van fenntartva.

## 2. Biztonsági és architekturális alapelvek

- A meglévő közös PDF-/DocumentViewer motor került továbbfejlesztésre.
- Nem készült második PDF-megjelenítő motor.
- A meglévő `PdfPlanViewer` és az új Felmérő munkatér ugyanazt a `pdfDocumentEngine` modult használja.
- A PDF eredeti tartalma nem módosul.
- A kivágás, forgatás, finom szögkorrekció, átlátszóság, elhelyezés és lépték külön munkatér-paraméterként tárolódik.
- A DIMPRO geometria külön overlay-rétegen készül.
- A koordináták normalizált, oldalfüggetlen formában mentődnek.
- Az automatikus felismerés kizárólag külön parancsra indul.
- A felismerési eredmény először minden esetben jóváhagyandó javaslat.
- A tényleges DIMPRO helyiségmodell csak felhasználói elfogadás után jön létre.
- Minden javaslat rendelkezik adatforrással, biztonsági szinttel, kontúr- és jóváhagyási állapottal.

## 3. Új projektmódok

A felmérés indításakor három forrásmód választható:

1. Helyszíni felmérés.
2. Tervdokumentáció alapú felmérés.
3. Megvalósulási dokumentáció alapú felmérés.

A második és harmadik mód automatikusan a PDF tervlap előkészítő munkatérrel indul. A meglévő helyszíni munkafolyamat változatlanul elérhető.

## 4. PDF tervdokumentációs adatmodell

Új verziózott domainmodell:

- `dimpro.property-survey.plan-document.v1`
- felmérési forrásmód;
- PDF-dokumentumazonosító és fájlujjlenyomat;
- többoldalas dokumentum;
- oldal–szint kapcsolat;
- tervtípus és tervverzió;
- normalizált kivágási tartomány;
- 0° / 90° / 180° / 270° forgatás;
- finom szögkorrekció;
- eltolás és méretezés;
- háttérátlátszóság és zárolás;
- oldalankénti északi irány;
- oldalankénti léptékkalibráció;
- PDF-típus: vektoros, raszteres vagy vegyes;
- felismerési javaslatok és jóváhagyási állapotok;
- több tervverzió egymás mellett, korábbi modell törlése nélkül.

A `.dimpro` munkafájl sémája:

- `dimpro.property-survey.v0.8.4.3`

A régi projektek automatikusan üres, érvényes tervdokumentációs workspace-t kapnak; a meglévő helyiségek, rétegrendek, zónák és energetikai adatok változatlanok maradnak.

## 5. PDF tervlap előkészítése

Elkészült:

- PDF feltöltés;
- többoldalas oldalválasztó;
- tervtípus: alaprajz, metszet, homlokzat, helyszínrajz, egyéb;
- tervverzió: engedélyezési, kiviteli, módosított kiviteli, megvalósulási, egyéb;
- egy oldalon belüli tervrész kézi kivágása;
- margó és tervpecsét kizárása kivágással;
- 90° / 180° / 270° forgatás;
- ±10° finom szögkorrekció;
- tervlap eltolása és méretezése;
- szint hozzárendelése;
- északi irány megadása;
- háttér átlátszósága;
- zárolt vagy ideiglenesen mozgatható PDF-háttér;
- teljes oldal és alaphelyzet visszaállítása.

## 6. Kétpontos léptékkalibráció

A kalibráció oldalanként és tervrészletenként külön tárolódik.

Első mérés:

1. két pont kijelölése a PDF-en;
2. valós távolság megadása méterben;
3. képpont/méter arány számítása.

Ellenőrző mérés:

1. második két pont kijelölése;
2. második ismert távolság megadása;
3. számított távolságeltérés;
4. százalékos hiba;
5. elfogadható vagy javítandó státusz.

Alapértelmezett elfogadási tolerancia: 2%.

Mentett adatok:

- PDF- és oldalazonosító;
- kivágási tartomány;
- forgatás és elhelyezés;
- első és második pontpár;
- valós távolságok;
- képponttávolságok;
- képpont/méter arány;
- eltérés és százalékos hiba;
- szint, északi irány és tervverzió.

## 7. Kézi helyiségpoligon

A PDF fölött kézzel, pontonként rajzolható helyiségpoligon.

- legalább három pont szükséges;
- az utolsó pont visszavonható;
- a poligon lezárható;
- kalibrált tervnél geometriai terület számítható;
- megadható helyiségnév, funkció, fűtöttség és belmagasság;
- adatforrás: `manualDrawing`;
- jóváhagyás után a meglévő DIMPRO helyiségmotor poligonalapú geometriája jön létre;
- a jóváhagyott poligon mozgatható és a projekttel együtt mentődik.

## 8. Vektoros PDF felismerési motor

A vektoros PDF MVP a PDF.js operátorlistájából dolgozik.

Elkészült:

- vektoros, raszteres és vegyes PDF-típus meghatározása;
- `constructPath` útvonalak kinyerése;
- transzformációs mátrixok követése;
- egyenes, köbös és kvadratikus görbeszakaszok feldolgozása;
- rövid kapcsolódó vonalszakaszok összefűzése;
- zárt közvetlen kontúrok felismerése;
- gráfalapú, összefűzött zárt kontúrok képzése;
- nyitott útvonalak számlálása;
- párhuzamos falvonalpárok keresése;
- PDF-szövegréteg és helyiségfeliratok kinyerése;
- alapterület-feliratok felismerése;
- helyiségnév, területfelirat és zárt vektorkontúr térbeli párosítása;
- kalibrált geometriai terület és terven szereplő terület összevetése;
- m²- és százalékos eltérés;
- biztonsági pontszám és státusz;
- címkeközpontú közelítő poligon csak akkor, ha biztos zárt kontúr nem párosítható.

A felület külön megjeleníti:

- vektorútvonalak;
- vonalszakaszok;
- zárt kontúrok;
- összefűzött kontúrok;
- párhuzamos falvonalpárok;
- nyitott útvonalak;
- raszterképek;
- szövegelemek számát.

## 9. Felismerési és jóváhagyási overlay

Külön parancs:

- `ALAPRAJZ FELISMERÉSE`

Választható módok:

1. csak helyiségek;
2. helyiségek és falak;
3. helyiségek, falak és nyílászárók;
4. teljes energetikai geometria előkészítése.

A v0.8.4.3-ban a helyiségkontúr-felismerés és a falvonal-diagnosztika használható. A nyílászárók és a teljes energetikai geometria választói előkészített munkamódok; ezek teljes automatikus tartalma későbbi fejlesztési szint.

Színkódok:

- zöld: nagy biztonság;
- sárga: ellenőrzendő;
- piros: nyitott vagy hibás geometria;
- kék: felhasználó által módosított;
- szürke: figyelmen kívül hagyott.

Minden javaslat mutatja:

- helyiségnév;
- számított terület;
- tervfelirat szerinti terület;
- m²- és százalékos eltérés;
- biztonsági pontszám;
- adatforrás;
- kontúr zártsága;
- fűtöttség;
- jóváhagyási állapot.

Elkészült gyorsműveletek:

- név és funkció javítása;
- belmagasság módosítása;
- fűtöttség módosítása;
- elfogadás;
- figyelmen kívül hagyás és visszaállítás;
- kézi újrarajzolás külön poligonként.

A poligonpont-mozgatás, két helyiség összevonása, kettévágása, falszakasz egyedi bezárása/törlése és felirat kézi áthelyezése a következő szerkesztési kör feladata.

## 10. Központi felületi integráció

A meglévő `Rajz / Adatok / Osztott` munkatér-logika került felhasználásra.

- Rajz: PDF-háttér, DIMPRO overlay, rajzeszközök és felismerési színek.
- Adatok: dokumentumok, oldalak, kalibráció, felismerés, hibák, források és jóváhagyási lista.
- Osztott: tervlap és adatpanel egymás mellett.
- Tablet álló nézet: Rajz vagy Adatok, egyszerre egy munkatér.
- Tablet fekvő nézet: osztott mód is használható.
- A kritikus kezelőelemek minimum 44 px körüli érintési célt kaptak.

## 11. Adatforrások

A domainmodell az alábbi kötelező forrásokat kezeli:

- `manualDrawing`
- `vectorPdfRecognition`
- `rasterPdfRecognition`
- `ocrRecognition`
- `planLabel`
- `userCorrected`
- `imported`

A v0.8.4.3 aktívan a kézi rajzolást, a vektoros felismerést, a tervfeliratot és a felhasználói javítást használja. A raszteres és OCR-források elő vannak készítve, de automatikus OCR-geometria ebben a kiadásban nincs.

## 12. Tesztelés

Domain- és integrációs tesztek:

- történeti energetikai és Felmérő domain tesztek: 475/475;
- új tervdokumentációs domain teszt: 9/9;
- összesen: 484/484.

Új PDF tervlap E2E:

- 13/13;
- tíz eltérő referencia-PDF;
- kilenc vektoros és egy raszteres;
- háromoldalas referencia;
- projektmód-választás;
- többoldalas PDF;
- tervtípus és tervverzió;
- kivágás;
- kétpontos kalibráció és ellenőrzés;
- vektorútvonal-, vonalszakasz-, kontúr- és párhuzamosfal-elemzés;
- javaslati overlay;
- jóváhagyás és DIMPRO poligon;
- mentés és újranyitás;
- régi projekt migráció;
- konzol- és oldalhiba: 0.

Referenciaalaprajzok:

- a három felhasználói referencia mintájára felépített lakóépület-profilt is tartalmazó tesztkészlet;
- további eltérő kompakt, L alakú, széles, keskeny, udvaros, osztott szárnyú és garázsszárnyas alaprajzok;
- külön raszteres PDF a kötelező OCR nélküli fallback ellenőrzéséhez.

Történeti E2E:

- v0.8.0 energetikai workflow: 40/40;
- v0.7.5 történeti energetikai workflow: 42/42;
- responsive központi munkatér: 15/15;
- alap Felmérő-, PDF- és DXF-regresszió: sikeres;
- tablet álló és fekvő nézet: sikeres;
- candidate assetaudit: 15/15;
- konzolhiba: 0;
- oldalhiba: 0.

Candidate screenshot-regresszió:

- 1920×1080;
- 1366×768;
- 1194×834;
- 834×1194.

Candidate build:

- `KeR6behksZLIq-0meUh08`

## 13. Backup és rollback

Forrásbackupok:

- `backups/property_survey_v0843_pdf_plan_mvp_20260730_101737`
- `backups/property_survey_v0843_vector_geometry_20260730_111700`

Az atomikus élesítés külön teljes `.next` rollbackponttal megtörtént.

- éles build: `KeR6behksZLIq-0meUh08`;
- rollback: `.next_before_property_survey_v0843_20260730_114528`;
- éles HTTP: 200;
- éles PDF tervlap E2E: 13/13;
- éles történeti energetikai E2E: 40/40 és 42/42;
- éles responsive regresszió: 15/15;
- éles tablet álló és fekvő teszt: sikeres;
- éles assetaudit: 15/15;
- konzol- és oldalhiba: 0.

## 14. Ismert korlátok és következő szint

A v0.8.4.3 használható kézi alapot és ellenőrzött vektoros helyiségjavaslatot biztosít, de nem állítja, hogy minden építészeti PDF teljesen automatikusan feldolgozható.

Korlátok:

- a raszteres és szkennelt PDF automatikus OCR-geometriája későbbi fejlesztés;
- összetett, megszakított, többszörösen egymásra rajzolt vagy dekorációval terhelt vektorútvonalak kézi ellenőrzést igényelnek;
- a nyílászárók teljes automatikus felismerése még nincs kész;
- a falrétegek, homlokzati szerkezetek, födémek és teljes energetikai határoló geometria automatikus előállítása még nincs kész;
- a helyiségösszevonás, kettévágás és csomóponti poligonszerkesztés következő kör;
- az automatikus eredmény minden esetben javaslat, nem végleges szakmai adat.

Javasolt következő külön fejlesztési verzió:

- `v0.8.4.4 – PDF tervlap szerkesztési és geometriajavító eszközök`;
- majd raszteres/OCR felismerési szint;
- a `v0.8.5` továbbra is kizárólag a valós WinWatt-próbához marad fenntartva.
