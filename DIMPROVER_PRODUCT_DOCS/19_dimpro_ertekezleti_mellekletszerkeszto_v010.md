# DIMPRO Értekezleti Mellékletszerkesztő v0.1.0

## Állapot

Első működő, szerveren kipróbálható változat.

## Fejlesztési döntés

Az Értekezleti Asszisztenshez külön felületi modul készült, de nem nulláról. A szerkesztési logika a DIMPROVER terepi képszerkesztőjének bevált canvas-alapú megoldását adaptálja értekezleti és Teams-munkafolyamathoz.

A meglévő szerkesztőből átvett alapelvek:

- HTML canvas rajzfelület;
- toll, nyíl, téglalap, kör és szöveg;
- kijelölés és mozgatás;
- nagyítás, kicsinyítés és pan;
- visszavonás és újra;
- eredeti kép változatlan megőrzése;
- külön szerkesztett kimenet.

## Felhasználói működés

Az Értekezleti Asszisztens `Képek és mellékletek` részében:

1. kép vagy PDF feltölthető;
2. a fájl mellett megjelenik a `Megnyitás és szerkesztés` gomb;
3. a szerkesztő teljes képernyős felületen nyílik meg;
4. PDF esetén lapozható az eredeti dokumentum;
5. kiválasztható a szerkesztendő PDF-oldal;
6. a kép vagy PDF-oldal megvágható;
7. rajzi jelölések helyezhetők el;
8. rövid cím, leírás és napirendi kapcsolat adható meg;
9. beállítható a `Kerüljön bele az AI-összefoglalóba` kapcsoló;
10. mentéskor új, külön melléklet jön létre.

## Képernyőrészlet

Szervezői vagy jegyzőkönyv-szerkesztői módban külön gomb indítja a képernyő vagy alkalmazásablak rögzítését.

A böngésző vagy Teams-kliens minden alkalommal felhasználói engedélyt kér. A kiválasztott képernyőről egy pillanatkép készül, amely azonnal megnyílik a mellékletszerkesztőben.

A funkció nem készít háttérben vagy engedély nélkül képernyőképet.

## MVP rajzi eszközök

- kijelölés;
- jelölés mozgatása;
- kép mozgatása;
- téglalap alapú kivágás;
- szabadkézi toll;
- nyíl;
- szaggatott téglalap;
- szaggatott kör/ellipszis;
- szövegdoboz;
- sorszámozott jelölőpont;
- tíz jelölőszín;
- négy vonalvastagság;
- kiválasztott elem törlése;
- minden jelölés törlése;
- visszavonás és újra;
- teljes képhez igazítás;
- 12–400% zoom.

## PDF-kezelés

A PDF feldolgozás a meglévő `pdfjs-dist` és `/public/pdf.worker.min.mjs` megoldásra épül.

- többoldalas PDF lapozható;
- a kiválasztott oldal maximum körülbelül 2200 képpontos munkaképpé renderelődik;
- a PDF változatlanul megmarad;
- a mentett kimenet JPG-kép;
- a melléklet metaadata tartalmazza az eredeti PDF kapcsolatát és az oldalszámot.

## Mentési modell

Minden szerkesztett melléklethez létrejön:

1. renderelt JPG-fájl;
2. szerkeszthető rajzi adatokat tartalmazó JSON-oldalkocsi;
3. MeetingAttachment metaadat;
4. auditnapló-bejegyzés.

Új attachment mezők:

- `title`;
- `description`;
- `includeInAi`;
- `sourceType`;
- `parentAttachmentId`;
- `sourcePage`;
- `editedBy`;
- `editedAt`;
- `editorVersion`;
- `markupStoredName`.

Támogatott forrástípusok:

- `upload`;
- `screen_capture`;
- `pdf_crop`;
- `image_edit`.

## Jogosultság

Szerkesztést végezhet:

- `organizer`;
- aktív, érvényes tokennel rendelkező `editor`.

A résztvevő az első változatban feltölthet mellékletet, de a rajzi szerkesztő használatához szerkesztési jogosultság szükséges.

Lezárt vagy archivált értekezlet melléklete csak az értekezlet újranyitása után szerkeszthető.

## AI-kapcsolat

Az AI-bemeneti mellékletlista most már csak azokat a mellékleteket tartalmazza, amelyeknél az `includeInAi` kapcsoló aktív.

Az AI-kontekstusba kerül:

- fájlnév;
- rövid cím;
- leírás;
- feltöltő;
- forrástípus;
- PDF-oldalszám;
- jóváhagyási állapot.

A tényleges képi AI-értelmezés későbbi külön fejlesztési kör. A jelenlegi AI a felhasználó által megadott képcímre és leírásra támaszkodik.

## API

Új végpont:

`POST /api/meeting-assistant/attachments/edited`

A végpont multipart kérést fogad, hitelesíti a meetinget és a szerepkört, elmenti a renderelt képet és a rajzi JSON-t, majd új mellékletet kapcsol az értekezlethez.

Biztonsági korlátok:

- kizárólag képkimenet fogadható;
- maximum 30 MB szerkesztett képenként;
- maximum 2 000 000 karakter rajzi JSON;
- meetinghez kötött tokenellenőrzés;
- editor grant és lejárat ellenőrzése;
- eredeti melléklet ellenőrzése;
- lezárt workspace tiltása.

## Érintett fő fájlok

- `components/meeting-assistant/MeetingAttachmentEditor.tsx`
- `components/meeting-assistant/MeetingAssistantPanel.tsx`
- `app/api/meeting-assistant/attachments/edited/route.ts`
- `app/api/meeting-assistant/workspace/route.ts`
- `app/lib/meeting-assistant/types.ts`
- `app/lib/meeting-assistant/store.ts`

## Kipróbálási sorrend

1. Nyisd meg az Értekezleti Kísérőt szervezői módban.
2. Nyisd ki a `Képek és mellékletek` fejezetet.
3. Tölts fel egy JPG/PNG képet.
4. Kattints a `Megnyitás és szerkesztés` gombra.
5. Helyezz el nyilat, szöveget és sorszámozott jelölőt.
6. Adj meg címet és leírást.
7. Kapcsold be az AI-összefoglaló jelölést.
8. Mentsd az asszisztensbe.
9. Ellenőrizd, hogy az eredeti és a szerkesztett kép külön kártyán látható.
10. Ismételd meg többoldalas PDF-fel és képernyőrészlettel.

## Későbbi fejlesztések

- valódi Teams dialog/task module nagyablakos indítás;
- HEIC/TIFF bemenet automatikus konverziója;
- kiemelő eszköz külön áttetszőséggel;
- homályosítás és kitakarás;
- HIBA/JAVÍTANDÓ/ELLENŐRIZVE pecsétek;
- méretvonal és méretarányos mérés;
- meglévő JSON-oldalkocsi újbóli megnyitása és továbbszerkesztése;
- képi AI-elemzés;
- jegyzőkönyvi képhivatkozások automatikus számozása;
- DokuBOX és DIMPRO Drive közös mellékletmotor.
