# DIMPRO Drive V0.9.31 – Súgó-központ és teljes UI/UX működési audit

Dátum: 2026-10-09  
Környezet: DEV ONLY · PROD DENY  
Érintett munkaterek: Saját Drive + Projekt Drive

## 1. Cél

A V0.9.31 célja két párhuzamos feladat lezárása:

1. a DIMPRO Drive jelenlegi kezelőfelületének és működési útvonalainak átfogó ellenőrzése;
2. egy közös, kereshető, munkatér-érzékeny Súgó-központ létrehozása, amely a Drive tényleges jelenlegi kódműködését dokumentálja.

A vizsgálat nem marketing-leírásból készült: a komponensek, API-k, jogosultsági modell, ZIP/export motor, fájlnév-normalizáló, CsomagBOX, Tervellenőrzés és projekt-hozzáférési komponensek tényleges kódútvonalai alapján készült.

## 2. Új Súgó-központ

A Súgó egy közös Shell-szintű overlay, ezért ugyanaz a felület nyílik meg:

- a Drive fejléc `Súgó` gombjából;
- a bal oldali keskeny navigáció `?` ikonjából;
- a kinyíló Drive board `Súgó` menüpontjából;
- Saját Drive és Projekt munkatér esetén is.

A panel kereshető, `Esc` billentyűvel és háttérkattintással bezárható, mobil/szűk képernyőn reszponzív, sötét témában külön kontrasztszabályokat használ.

A Súgó jelenlegi adatregisztere 169 külön kezelőelem/művelet leírását, 14 fő témakört és 5 projekt-szerepkört tartalmaz.

## 3. Fő Súgó-témakörök

- Gyors kezdés
- Táblázati nézetek
- Saját Drive
- Projekt munkatér
- Jogosultságkezelés és szerepkörök
- Feltöltés és fájlnév-kezelés
- Letöltés és ZIP-csomagok
- Kedvencek
- CsomagBOX
- Tervellenőrzés és jóváhagyások
- Biztonság, karantén és törlés
- Fájlmegjelenítő és fullscreen
- Gombok és ikonok jegyzéke
- Gyakori kérdések / hibakeresés

A kereső gombnév, felületi hely, funkcióleírás és feltétel alapján keres.

## 4. Táblázati és munkanézetek

### Egyszerű nézet

Általános napi fájlkezelésre szolgál. A legfontosabb dokumentumadatokat és státuszokat jeleníti meg, kisebb oszlopszámmal.

### Mérnöki nézet

Műszaki dokumentumtárhoz készült. Tervszám, lépték, MIME, revízió, verzió, forrás és további mérnöki metaadatok közvetlenül láthatók.

### Tervellenőrzés

Csak Projekt Drive-ban használható. Jóváhagyási és életciklus-oszlopokra optimalizált, és automatikusan egy-paneles táblázatos munkanézetre vált.

### Commander / kétpaneles fájlkezelő

Két mappa tartalmát mutatja egymás mellett. Nyíllal vagy áthúzással fájlok mozgathatók a panelek között. A szülőmappa navigáció külön működik mindkét panelen.

### Fullscreen

Natív böngésző teljes képernyőt használ. A dokumentumadat-inspector jobb oldalon vagy alul jeleníthető meg. `Esc` először a nyitott részlet-/előnézet panelt zárja, és csak utána a fullscreent.

## 5. Saját Drive – auditált működés

Aktív és működő fő funkciók:

- mappafa, almappák és mappaátnevezés;
- mappa/fájl áthúzás;
- Egy kattintás → Részletek;
- Dupla kattintás → fájlmegjelenítő;
- beépített előnézet és külön ablak;
- Kedvencek szerveroldali tartós tárolással;
- személyes CsomagBOX;
- CsomagBOX belső mappák és ZIP-letöltés;
- személyes Lomtár és visszaállítás;
- Commander;
- vizuális összehasonlítás a rendelkezésre álló személyes dokumentumokkal;
- kapcsolt projektek kezelése;
- 50 GB alap személyes quota kijelzése;
- natív fullscreen;
- központi DIMPRO AUTH kijelentkezés.

A V0.9.31 audit során javított Saját Drive navigációs eltérések:

- a board `Kedvencek` menüpontja korábban tévesen inaktívnak volt jelölve; most aktív;
- a board `CsomagBOX` menüpontja korábban tévesen inaktívnak volt jelölve; most aktív;
- a személyes `CsomagBOX` navigációs cél most ténylegesen megnyitja a BOX-polcot;
- a keskeny bal sáv `Beérkező Drop` eleme Saját Drive-ban most helyesen inaktív, mert személyes Drop-nézet még nincs.

### Saját Drive jelenleg szándékosan inaktív funkciók

A felső közös eszközsor miatt a vezérlő látszik, de a személyes munkatér kódja jelenleg explicit tiltja:

- közvetlen `Feltöltés`;
- `Új verzió`;
- `Új revízió`;
- teljes személyes `Mappa ZIP`;
- `Formális dokumentumkiadás`;
- személyes `Beérkező Drop`.

Ezek a Súgóban `Hamarosan` állapotot kapnak, nem működő funkcióként jelennek meg.

## 6. Projekt Drive – auditált működés

Aktív/feltételes fő funkciók:

- többfájlos feltöltés a projekt object-storage pipeline-ba;
- új immutable belső verzió;
- új hivatalos revízió;
- fájlmegnyitás és beépített előnézet;
- Drive Desktop / Windows-megnyitás;
- egyedi fájlletöltés;
- projekt Mappa ZIP;
- Kedvencek;
- projekt CsomagBOX és BOX-életciklus;
- CsomagBOX előzmény és összehasonlítás;
- vizuális dokumentumösszehasonlítás;
- Tervellenőrzés és jóváhagyási szakaszok;
- dokumentum-metaadatok;
- QR-azonosító;
- biztonsági ellenőrzés és karantén;
- Megjegyzések;
- projekt-specifikus Listák;
- mappaátnevezés;
- mappaszintű ACL / Mappahozzáférés;
- második rétegű Mappavédelem;
- soft-delete Lomtár, visszaállítás és megfelelő jogosultsággal purge;
- formális dokumentumkiadás;
- projekt-hozzáférések és meghívások;
- natív fullscreen;
- központi DIMPRO AUTH kijelentkezés.

## 7. Jogosultságkezelés és szerepkörök

A központi Project Core öt szerepkört használ.

| Szerepkör | Kód | Lényeg |
| --- | --- | --- |
| Beruházási projektvezető | `OWNER` | Projektgazda, teljes projekt- és Drive-jogosultság. Védett szerepkör. |
| Projektvezető | `PROJECT_MANAGER` | Teljes operatív projektvezetői permission-készlet. |
| Közreműködő | `CONTRIBUTOR` | Napi projektmunka, dokumentumírás, kommunikáció és naplóírás; admin/törlés/kiadás nélkül. |
| Ellenőrző | `REVIEWER` | Dokumentumolvasás, komment, jóváhagyás, válasz, audit; feltöltési/szerkesztési jog nélkül. |
| Megtekintő | `VIEWER` | Olvasási jogosultság; nem ír, nem tölt fel és nem hagy jóvá. |

Az OWNER és PROJECT_MANAGER jelenleg azonos teljes permission-készletet kap, de az OWNER a projektgazda, ezért a normál szerepkörmódosítóval nem írható át.

A Projekt-hozzáférések panel kezel:

- aktív tagokat;
- függő meghívásokat;
- név + szervezet + e-mail alapú meghívást;
- 3 / 7 / 14 / 30 napos meghívó-élettartamot;
- PROJECT_MANAGER / CONTRIBUTOR / REVIEWER / VIEWER szerepkörváltást;
- saját projektmegjelenítési nevet;
- más nem-OWNER tag hozzáférésének megszüntetését.

A projekt-szerepkör az alap hozzáférés. A mappaszintű ACL ezt lefelé szűkítheti. Az olyan mappa, amelyhez a felhasználó nem jogosult, a Drive mappafában és fájllistában sem jelenik meg. A jelszavas/PIN-es Mappavédelem csak második védelmi réteg; nem kerülheti meg az identitásalapú ACL-t.

## 8. Feltöltés és fájlnév-normalizálás

Projektfeltöltéskor az eredeti fájlnév külön metaadatként megmarad. A rendszer biztonságos technikai nevet képez:

- Unicode/ékezet → ASCII-kompatibilis alak;
- tiltott karakterek normalizálása;
- Windows reserved nevek kezelése (`CON`, `PRN`, `AUX`, `NUL`, `COM1…`, `LPT1…`);
- stabil rövid hash;
- technikai fájlnév maximum 96 karakter;
- biztonságos mappanév maximum 60 karakter;
- ZIP/archív relatív útvonal célhossza maximum 180 karakter.

A projekt exportnév külön réteg, nem az immutable tárolt fájl átnevezése. A tipikus séma:

`Tervszám_RövidNév_Vxx_Rxx_ÁLLAPOT.kiterjesztés`

A dokumentumszintű RövidNév/export alias alapértelmezetten legfeljebb kb. 30 ASCII-safe karakter.

## 9. Letöltés és ZIP-csomagok

### Projekt Mappa ZIP

A kiválasztott mappa és teljes almappastruktúrája kerül a ZIP-be Windows-kompatibilis safe exportnevekkel. A pilot korlát 500 fájl és 2 GB.

A ZIP automatikusan tartalmaz:

- digitális dokumentációjegyzéket / manifestet;
- `DIMPRO_fajllista.txt` fájlt.

A jegyzék többek között rögzíti: csomagazonosító, projekt, projektkód, mappa, létrehozási idő, fájlszám, kihagyott tételek, eredeti fájlnév, méret, MIME és – ha rendelkezésre áll – SHA-256 hash.

### Saját Drive CsomagBOX ZIP

A ZIP automatikusan tartalmazza a `DIMPRO_Dokumentaciojegyzek.txt` fájlt. Ez rögzíti a csomagazonosítót, BOX-nevet, létrehozási időt, fájlszámot, kihagyásokat, eredeti fájlnevet, méretet, MIME-t és SHA-256 értéket.

Ha két exportfájl ugyanazt a safe nevet kapná, a ZIP `_2`, `_3` stb. utótaggal teszi egyedivé. A forrásfájl nem módosul.

## 10. Kedvencek

A sor eleji csillag kapcsolja a kedvencállapotot. A fájl helye és tartalma nem változik. Projekt és Saját Drive külön kedvenc-adatmodellt használ. Saját Drive-ban a kedvenc szerveroldali, USER-owned tartós rekord.

## 11. CsomagBOX

A CsomagBOX virtuális dokumentum-/verzióhivatkozásokat tárol. A forrásfájl nem másolódik és nem mozdul el. Emiatt ugyanaz a fájl több BOX-ban is szerepelhet.

Dokumentált vezérlők többek között:

- új BOX;
- BOX kinyitás/összecsukás;
- kijelölt fájl hozzáadása;
- belső mappa és almappa;
- elem eltávolítása;
- BOX-polc magasságállítása;
- ZIP letöltés;
- előzmények;
- életciklus-szűrés;
- összevetés.

Aktív BOX-hivatkozás a szigorú törlési szabály miatt blokkolhatja a forrásdokumentum törlését.

## 12. Tervellenőrzés és jóváhagyások

A Tervellenőrzés külön szakaszokat kezel:

- műszaki ellenőrzés;
- megrendelő;
- projektvezető;
- beruházási projektvezető;
- életciklus.

A felhasználó csak a jogosult szakaszt szerkesztheti. Az Időnapló auditálja a jóváhagyásokat és állapotváltásokat.

Gyors vizuális jelölés:

- Megrendelő: világos citromsárga;
- Projektvezető: jóváhagyó kék;
- Beruházási projektvezető: jóváhagyó zöld;
- Munkaközi: citromsárga;
- Aktuális: jóváhagyó zöld.

## 13. Fájlmegjelenítő

Auditált vezérlők:

- lapozás;
- kéz/pan;
- kicsinyítés/nagyítás;
- Ctrl + egérgörgő dokumentumzoom;
- szélességre illesztés;
- 90° forgatás;
- előnézeti URL frissítése;
- teljes képernyő;
- megnyitás új lapon.

A Ctrl + egérgörgő a megjelenítőn belül blokkolja a böngésző teljes oldalzoomját.

## 14. Összehasonlító

A Súgó külön dokumentálja a kevésbé gyakori vezérlőket is:

- Párhuzamos / Átfedés / Különbség;
- A/B réteg;
- automatikus igazítás;
- 2 és 3 pontos illesztés;
- pixelenkénti nudge nyilak;
- keretre/méretre igazítás;
- igazítás nullázása;
- automatikus jelöltek;
- heatmap;
- eltérési zónák;
- kézi referenciapár-csere;
- eltérési jegyzék;
- JSON / CSV export;
- eltérés archiválása;
- eltérés projektüggyé alakítása.

## 15. Jelenleg előkészített, de nem teljesen aktív általános funkciók

- Drive Kezdőlap;
- Legutóbbi külön nézet;
- Kiadások külön Drive nézet;
- teljes Drive Értesítések panel;
- általános toolbar `Megosztás`;
- AI Dokumentumvizsgáló;
- Tárhely bővítése előfizetéses checkout/billing bekötés.

Ezek a Súgóban `Hamarosan` állapotot kapnak.

## 16. Automatikus audit eredmény

`drive-v0931-help-ux-audit-contract.mjs`: **28/28 PASS**.

Regresszió:

- V0.9.30 review-workline: 8/8 PASS
- V0.9.29 visual density: 13/13 PASS
- V0.9.28 workspace/favorites/logout: 31/31 PASS
- V0.9.27 Typography V1: 23/23 PASS
- V0.9.26 profile/viewer/click arbitration: 24/24 PASS

A contract ellenőrzi többek között a Saját/Projekt Kedvenceket, CsomagBOX-ot, projektfeltöltést, verziót/revíziót, Mappa ZIP-et, natív fullscreent, központi logoutot, jogosultsági szerepköröket, ZIP mellékfájlokat, safe filename szabályokat és a Help bekötési pontjait.

Célzott ESLint: 0 error. A teljes repository lint továbbra is a korábban ismert baseline-t adja: **25 error / 106 warning**; ezek nem a V0.9.31 módosításaiban találhatók.

## 17. Audit korlátja

Ez az audit kód-, route-, permission-, contract- és build-szintű átfogó ellenőrzés. A destruktív, jogosultságot módosító vagy külső szolgáltatást érintő gombokat nem kattintja végig automatikusan éles felhasználói adatokon. Az aktiválás után a Súgó vizuális megjelenítését és a fő navigációs pontokat böngészőben is célszerű röviden ellenőrizni.
