# DIMPRO PDF Tervnéző - fejlesztési sorrend és kódolási segédanyag

Dátum: 2026-07-14

Fejlesztési napló URL: https://license.dimpro.hu/admin/fejlesztesi-naplo

## Végleges döntés

A DIMPRO PDF Tervnéző külön modulkártya legyen a Fájlműhely Indítópultján, a **Mérnöki Műhely** főcsoport alatt. A PDF Műhely maradjon a **Dokumentum Műhely** alatt, általános PDF eszközként.

A PDF Tervnéző nem általános PDF-olvasó és nem a Szakági Mennyiségmérő kicsinyített másolata. Önálló mérnöki munkamodul: tervolvasás, tervellenőrzés, szakági HexPin jelölések, D tervpecsét, megjegyzéslista, .dimpro munkafájl, jelölt PDF export, későbbi RevCompare és terepi hibafelvételi kapcsolat.

## Új Indítópult főcsoportok

1. **Fájltér**: Commander, DIMPRO Drive, DokuBOX
2. **Projektkontroll**: Projektadatok, Tervjegyzék, Mappaőr
3. **Fájlrendezés**: Problémás fájlok, Fájlnév-rövidítő, ZIP/RAR csomag
4. **Dokumentum Műhely**: Képoptimalizáló/KépBOX, PDF Műhely, QR/Dokumentumazonosító
5. **Mérnöki Műhely**: PDF Tervnéző, Szakági Mennyiségmérő, Költségvetés Műhely, később RevCompare

## Fejlesztési sorrend

### v5.17 - Indítópult és modulkártya alapozás
- 5 főcsoportos elrendezés.
- Új Dokumentum Műhely és Mérnöki Műhely főcsoport.
- PDF Tervnéző kártya helyőrzővel.
- PDF Műhely marad dokumentumeszköz.
- Elvárt ZIP: `DIMPRO_Fajlmuhely_v5_17_PDF_Tervnezo_Inditopult.zip`.

### v5.18 - PDF megnyitási workflow
- Commander PDF dupla kattintáskor választó kártya.
- Első opció: DIMPRO PDF Tervnéző.
- Rendszer alapértelmezett PDF néző.
- Külső program választása.
- Géphez menthető preferencia.

### v5.19 - Külön teljes képernyős PDF Tervnéző ablak
- Nagy külön ablak.
- F11 teljes képernyő.
- F12 tiszta tervolvasó mód.
- Ctrl+Shift+M másik monitorra küldés fallbackkel.
- Ctrl+Shift+2 kétmonitoros vezérlőpanel előkészítés.
- Alsó tervlap tálca több megnyitott PDF-hez.

### v5.20 - .dimpro munkafájl és overlay adatmodell
- A szerkeszthető DIMPRO munkaállapot `.dimpro` fájlba mentődik.
- PDF hivatkozások, oldalak, overlay elemek, HexPin, D pecsét, megjegyzések, státuszok.
- A régi `.dimproviewer.json` csak kompatibilitási háttér sidecar maradhat.

### v5.21 - HexPin szakági jelölések és D tervpecsét
- DIMPROVER terepi hibafelvétel színlogika átvétele.
- Villamos címke V betűvel, átmeneti belső `electrical` kóddal.
- D pecsét vörös kerettel/betűvel, választható erős színekkel.
- Minimális rajzeszközök: nyíl, téglalap, kör, szöveg, toll, kitakarás, pipa, X.

### v5.22 - Exportok
- Ráégetett jelölt PDF.
- D pecsétes PDF.
- Jelölt PDF + megjegyzéslista oldal.
- Később Adobe-kompatibilis annotációs PDF külön körben.

### v5.23 - RevCompare MVP
- Egymás melletti mód.
- Egymásra helyezett opacity mód.
- Blink mód.
- Kézi X/Y igazítás, skála/forgatás finomhangolás.
- Automatikus különbségkiemelés előkészítése.

### v5.24 - Terepi hibafelvételi előkészítés
- PDF Tervnéző jelölései később terepi hibává alakíthatók.
- HJ/FHJ kompatibilis mezők.
- Fotókapcsolat, felelős, határidő, státusz.

## Fő kódolási fájlok

- `dimpro_fajlrendezo_gui.py` - Indítópult, Commander, PDF megnyitó választó, PDF Tervnéző ablak indítása.
- `document_viewer_engine.py` - közös nézőmotor, új `pdf_plan_review` profil.
- `dimpro_pdf_plan_viewer.py` - új teljes képernyős PDF Tervnéző ablak.
- `dimpro_pdf_review_model.py` - `.dimpro` adatmodell.
- `dimpro_pdf_review_export.py` - PDF export / megjegyzéslap / D pecsét ráégetés.
- `dimpro_pdf_revcompare.py` - későbbi RevCompare.

## Szakági HexPin döntések

- Építész: É / `architecture` / DIMPROVER meglévő zöldes szín.
- Gépész: G / `mechanical` / DIMPROVER meglévő türkiz szín.
- Villamos: V / `electrical` átmeneti belső kód / DIMPROVER meglévő arany-sárga szín.
- Technológia: T / `technology` / DIMPROVER meglévő kékesszürke szín.
- Statika: S / `structural` / új téglavörös-narancs.
- Közmű: K / `utility` / új kék.
- Belsőépítészet: B / `interior` / új púder-rózsaszín.
- Megrendelő/management: M / `management` / sötétszürke vagy prémium arany.

## D tervpecsét

- Alap: vörös keret + vörös betű.
- Tartalom: D vagy egyedi betű, dátum, státusz, opcionális név/szervezet, megjegyzés, később monogram/aláírás.
- Választható erős színek: vörös, kék, zöld, narancs, lila, fekete.
- Overlayként szerkeszthető, exportkor PDF-be ráégethető.

## Gyorsbillentyűk

- F11: teljes képernyő.
- F12: tiszta tervolvasó mód.
- Ctrl+Shift+M: másik monitorra küldés.
- Ctrl+Shift+2: kétmonitoros vezérlőpanel előkészítés.
- Ctrl+J: jobb oldali megjegyzéspanel.
- Ctrl+E: lebegő eszközpaletta.
- Ctrl+Tab / Ctrl+Shift+Tab: megnyitott tervlapok váltása.

## Kötelező munkafolyamat

1. VPS állapot ellenőrzése.
2. Legutóbbi stabil ZIP azonosítása.
3. Munkamappa létrehozása.
4. Backup készítése a módosítandó fájlokról és a teljes ZIP-ről.
5. Kódmódosítás kis lépésekben.
6. `python -m py_compile` érintett `.py` fájlokra.
7. Modulonkénti kézi/smoke teszt minimum 10 mintapéldával.
8. Új ZIP csomag létrehozása verziószámmal.
9. Változásnapló és fejlesztési napló frissítése.
10. Következő fejlesztési szint rögzítése.

## Kötelező tesztelés

Legalább 10 tesztpélda minden verzió után: Indítópult, kártyák, Commander PDF választó, DIMPRO megnyitás, külső megnyitás, teljes képernyő, monitor fallback, jobb panel, `.dimpro` mentés/betöltés, PDF export, D pecsét, Villamos HexPin.

## Új csevegő átadó

DIMPRO PDF Tervnéző fejlesztés folytatása.

Projekt: DIMPRO Fájlműhely / DIMPROVER VPS
Kiinduló verzió: `DIMPRO_Fajlmuhely_v5_16_Drive_Launcher_Login_Gate.zip`
Munkairány: külön PDF Tervnéző modulkártya, közös DocumentViewer Engine profilokkal.

Kötelező fejlesztési elv:
- A PDF Tervnéző külön modul legyen a Mérnöki Műhely főcsoportban.
- A PDF Műhely maradjon a Dokumentum Műhelyben általános PDF eszköznek.
- A PDF Tervnéző ne a Szakági Mennyiségmérő másolata legyen: raszter és mérőeszközök alapból OFF.
- Közös DocumentViewer Engine marad, de külön profil kell: `pdf_plan_review`.
- A szerkeszthető munkafájl `.dimpro` legyen.
- A PDF eredeti fájlja nem módosul, overlay külön adatként mentődik.
- Exportkor készülhet ráégetett PDF és PDF + megjegyzéslista oldal.

Kezdési sorrend:
1. VPS status ellenőrzés.
2. v5.16 ZIP kibontása külön munkamappába.
3. Backup készítése.
4. v5.17: Indítópult 5 főcsoport + PDF Tervnéző kártya.
5. `python -m py_compile`.
6. Legalább 10 teszt.
7. Új ZIP: `DIMPRO_Fajlmuhely_v5_17_PDF_Tervnezo_Inditopult.zip`.
8. Fejlesztési napló frissítése: https://license.dimpro.hu/admin/fejlesztesi-naplo
