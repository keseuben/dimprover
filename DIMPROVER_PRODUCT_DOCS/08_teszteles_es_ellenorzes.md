# 08 Tesztelés és ellenőrzés

## Alap ellenőrzések

Minden fejlesztési kör után legalább:

```bash
npx tsc --noEmit
```

Jelentősebb változás után:

```bash
npm run lint
npm run build
```

## Futási állapot

A VPS-en ellenőrizendő:

```bash
pm2 list
free -h
```

## 2026-07-12 – DIMPRO Fájlműhely v4.89 – Költségvetés Műhely MVP ellenőrzés

Elvégzett ellenőrzések:
- `python3 -m py_compile dimpro_budget_workshop_module.py dimpro_fajlrendezo_gui.py`: sikeres;
- `logs/test_v489_budget_workshop.py`: 10 számítási mintapélda sikeres;
- CSV fallback smoke export sikeres;
- GUI integrációs jelölők ellenőrzése sikeres: import, build call, új tab, gyorsgomb, menübejegyzés, súgóbejegyzés.

Fontos környezeti megjegyzés:
A VPS Python környezetében az `openpyxl` modul nem volt telepítve, ezért szerveren az Excel írás helyett a CSV fallback lett ellenőrizve. A Fájlműhely csomag `requirements.txt` fájlja továbbra is tartalmazza az `openpyxl>=3.1.0` függőséget, ezért Windowsos használatnál a teljes Excel exporthoz a requirements telepítése szükséges.

Nem elvégzett ellenőrzés:
A szerveren kijelző nélküli környezet miatt valós Tkinter GUI kattintásos teszt nem futott. A Windowsos kézi indításkor ellenőrizendő: Költségvetés Műhely fül megnyitása, új tétel felvétele, szerkesztés, másolás, JSON mentés és Excel export.

## 2026-07-12 – DIMPRO Fájlműhely v4.90 ellenőrzés

Elvégzett ellenőrzések:
- `python3 -m py_compile dimpro_fajlrendezo_gui.py dimpro_budget_workshop_module.py`: sikeres;
- `logs/test_v490_budget_workshop.py`: 10 számítási eset, Tkinter panelindítás, mentett költségvetések lista, HTML fallback export: sikeres;
- `logs/test_v490_full_app_smoke.py`: teljes App Xvfb indítás, főablakcím ellenőrzés, Költségvetés Műhely tab választás: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

Környezeti megjegyzés:
A VPS Python környezetében a ReportLab nincs telepítve, ezért a PDF export szerveren HTML fallback módban lett ellenőrizve. A Windowsos teljes PDF exporthoz a `requirements.txt` szerinti `reportlab>=4.0.0` telepítése szükséges.

## 2026-07-12 – DIMPRO Fájlműhely v4.91 ellenőrzés

Elvégzett ellenőrzések:
- VPS ReportLab import: sikeres, `reportlab 5.0.0`;
- vendor ReportLab import: sikeres, a modul a `D491/vendor/reportlab/__init__.py` útvonalról töltődött be;
- Költségvetés Műhely valós PDF export: sikeres;
- `logs/test_v491_reportlab_vendor.py`: sikeres;
- v4.90 regressziós költségvetési teszt v4.91 kóddal: sikeres, `pdf_available=True`;
- teljes App Xvfb smoke: sikeres, főablakcím és Költségvetés Műhely tab ellenőrizve;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

Megjegyzés:
A beépített ReportLab jelenleg a ZIP csomagban lévő `vendor/` mappára épül. A felhasználónak nem kell külön ReportLab telepítés, de a programmappa szerkezetét egyben kell tartani.

## 2026-07-12 – DIMPRO Fájlműhely v4.92 ellenőrzés

Elvégzett ellenőrzések:
- `dimpro_fajlrendezo_gui.py`, `dimpro_budget_workshop_module.py`, `check_build_environment.py` Python syntax check: sikeres;
- v4.92 teljes App Xvfb smoke: sikeres;
- vendor ReportLab import és valós PDF export: sikeres;
- Windows build kit fájlok megléte: sikeres;
- offline Windows wheelhouse letöltés: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

Fontos korlát:
A tényleges Windows `.exe` buildet Linux VPS-en nem lehet lezárni. Ehhez Windows 10/11 64-bit környezet, Windows VPS vagy Windows CI runner szükséges. A v4.92 csomag erre készíti elő a projektet.

## 2026-07-12 – DIMPRO Fájlműhely v4.93 ellenőrzés

Elvégzett ellenőrzések:
- Python syntax check: sikeres;
- tételsor mozgatás teszt: sikeres;
- ügyfél HTML export belső adatok elrejtésével: sikeres;
- belső HTML export belső adatok megjelenítésével: sikeres;
- ügyfél és belső PDF export: sikeres;
- teljes App Xvfb smoke: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

## 2026-07-12 – DIMPRO Fájlműhely v4.94 ellenőrzés

Elvégzett ellenőrzések:
- Python syntax check: sikeres;
- saját tételtár mentés: sikeres;
- azonos tételkód alapján saját tétel frissítés duplikálás nélkül: sikeres;
- saját tételtár keresés: sikeres;
- saját tétel beszúrása költségvetésbe: sikeres;
- HTML/PDF export regresszió: sikeres;
- teljes App Xvfb smoke: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

## 2026-07-12 – DIMPRO Fájlműhely v4.95 ellenőrzés

Elvégzett ellenőrzések:
- Python syntax check: sikeres;
- saját tételtár import: sikeres;
- azonos tételkód import frissítése duplikálás nélkül: sikeres;
- munkanem szűrő: sikeres;
- keresés + munkanem szűrés: sikeres;
- tömeges saját tételtárba mentés logika: sikeres;
- saját tételből beszúrás regresszió: sikeres;
- PDF export regresszió: sikeres;
- teljes App Xvfb smoke: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

## 2026-07-12 – DIMPRO Fájlműhely v4.96 ellenőrzés

Elvégzett ellenőrzések:
- Python syntax check: sikeres;
- saját tétel szerkesztési metódus megléte: sikeres;
- munkanem összesítő számítás: sikeres;
- jobb oldali összesítő szöveg frissítés: sikeres;
- HTML export munkanem összesítővel: sikeres;
- PDF export munkanem összesítővel: sikeres;
- teljes App Xvfb smoke: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

## 2026-07-12 – DIMPRO Fájlműhely v4.97 ellenőrzés

Elvégzett ellenőrzések:
- Python syntax check: sikeres;
- saját tételtár CSV export: sikeres;
- saját tételtár CSV import: sikeres;
- azonos tételkód CSV import frissítése duplikálás nélkül: sikeres;
- saját tételtár JSON export kompatibilitás: sikeres;
- PDF export regresszió: sikeres;
- teljes App Xvfb smoke: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.

Környezeti megjegyzés:
A VPS tesztkörnyezetben az OpenPyXL nem volt importálható a futtatott csomagból, ezért az XLSX útvonal CSV fallbackként lett ellenőrizve. A Windows BuildKit wheelhouse tartalmazza az `openpyxl-3.1.5` csomagot.

## 2026-07-12 – DIMPRO Fájlműhely v4.98 ellenőrzés

Elvégzett ellenőrzések:
- Python syntax check: sikeres;
- ajánlatmeta JSON mentés/megnyitás: sikeres;
- HTML ügyfél fedőlap: sikeres;
- ügyfél export belső adatok elrejtésével: sikeres;
- belső export belső adatok megjelenítésével: sikeres;
- PDF ajánlatfejléc: sikeres;
- teljes App Xvfb smoke: sikeres;
- release API fejléc ellenőrzés: `application/zip`, helyes fájlnév, SHA256 fejléc: sikeres.


## 2026-07-12 – Értesítési Központ MVP tesztlista

Minimum funkcionális tesztek:
1. `/api/notifications` érvényes session vagy Drive token nélkül nem ad vissza adatot.
2. Érvényes web session mellett a notification lista betölt.
3. `/api/notifications/unread-count` valós olvasatlan számot ad vissza.
4. `/notifications` oldal megjelenik, szűrőfülekkel és részletező panellel.
5. Olvasottnak jelölés után `readAt` kitöltődik és csökken az olvasatlan szám.
6. Archiválás után a felhasználó listájából eltűnik az értesítés.
7. Projekt ID szűrés csak a kiválasztott projekt eseményeit mutatja.
8. A jobb oldali board NotificationBell komponense nem statikus értéket, hanem API választ mutat.
9. Drive upload lezárásakor `FILE_UPLOADED` értesítés jön létre.
10. Desktop tokennel ugyanazok az értesítések lekérhetők és ugyanaz a `readAt` logika használható.
