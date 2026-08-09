# DIMPRO Értekezleti Asszisztens – AI-tervezet automatikus visszatöltése v0.1.15

Dátum: 2026-07-24

## Kiinduló probléma

Az AI Dokumentumműhelyben elkészült értekezleti összefoglaló bekerült az `aiResults` előzménylistába, de nem minden esetben került külön mentésre az `aiMinutesDraft` mezőbe. Emiatt oldalfrissítés vagy későbbi megnyitás után a szerkeszthető dokumentumtervezet üresnek látszott, miközben a korábbi AI-eredmény a szerveren továbbra is megmaradt.

A jelenség különösen lezárt vagy közzétett értekezleteknél volt fontos, mert ezek munkatere helyesen csak újranyitás után módosítható.

## Megoldás

A dokumentumműhely betöltésekor a rendszer az alábbi sorrendet használja:

1. Ha az `aiMinutesDraft` nem üres, a mentett tervezet töltődik be.
2. Ha a mentett tervezet üres, a rendszer megkeresi a legutóbbi sikeres, nem üres `draft_minutes` AI-eredményt.
3. A legutóbbi eredmény szövege automatikusan megjelenik a szerkeszthető dokumentumban és a dokumentumelőnézetben.
4. A visszatöltött tartalom közvetlenül exportálható DOCX és PDF formátumban.
5. Ha nincs mentett tervezet és megfelelő AI-előzmény sem, az editor üres marad.

## Kiválasztási szabály

Csak az az AI-eredmény használható visszatöltésre, amely:

- `action === "draft_minutes"`;
- nem `error` állapotú;
- nem üres szöveget tartalmaz;
- időpont szerint a legutóbbi megfelelő eredmény.

A mentett tervezet mindig elsőbbséget élvez az AI-előzménnyel szemben.

## Felületi jelzés

AI-előzményből történő helyreállításkor a felület külön sárga tájékoztató sávot jelenít meg:

- jelzi, hogy a mentett tervezet üres volt;
- megjeleníti a helyreállított AI-eredmény időpontját;
- jelzi, hogy a tartalom megtekinthető és exportálható;
- lezárt értekezletnél figyelmeztet, hogy a munkatérbe történő mentéshez előbb újra kell nyitni az értekezletet.

A jobb oldali exportpanel szövege is jelzi, ha éppen AI-előzményből helyreállított összefoglaló kerül a fájlba.

## Tervezetállapotok

A kliens az alábbi belső állapotokat különbözteti meg:

- `saved` – szerverre mentett tervezet;
- `history` – AI-előzményből automatikusan visszatöltött tervezet;
- `edited` – kézzel módosított vagy friss AI-javaslatból átemelt, még nem mentett tervezet;
- `empty` – nincs megjeleníthető tervezet.

Kézi módosítás után a tervezet `edited` állapotba kerül. Sikeres mentés után `saved` állapotú lesz.

## Lezárt értekezletek

A helyreállítás nem írja át az értekezlet adatfájlját és nem nyitja újra a lezárt értekezletet. A korábbi AI-eredmény csak megjelenítéshez és exporthoz töltődik vissza.

Ez megőrzi a lezárási és auditlogikát:

- közzétett vagy archivált munkatér nem módosul automatikusan;
- az AI-előzmény változatlan marad;
- az export elkészíthető újranyitás nélkül;
- tényleges mentéshez továbbra is szabályos újranyitás szükséges.

## Valós próbaértekezlet ellenőrzése

Értekezletazonosító:

```text
fefw-1784824847953-1784824883221-f36pm
```

Kiinduló állapot:

- munkatér státusza: `published`;
- `aiMinutesDraft`: 0 karakter;
- legutóbbi sikeres `draft_minutes` AI-eredmény: 3435 karakter;
- AI-eredmény időpontja: `2026-07-23T16:56:24.135Z`.

Böngészős ellenőrzés:

- a dokumentumműhely megnyílt;
- a textarea pontosan a 3435 karakteres AI-előzményt tartalmazta;
- a helyreállítási figyelmeztetés megjelent;
- az exportpanel helyreállított tartalmat jelző szövege megjelent;
- a DOCX gomb aktív volt;
- a PDF gomb aktív volt.

Exportellenőrzés:

- DOCX méret: 10 921 bájt;
- PDF méret: 72 789 bájt;
- PDF oldalszám: 3;
- mindkét dokumentumban megtalálható volt a helyreállított AI-tervezet egyedi tartalmi mondata.

## Érintett fájl

```text
components/meeting-assistant/MeetingAiDocumentStudio.tsx
```

## Ellenőrzések

- `npx tsc --noEmit`: sikeres;
- célzott ESLint: sikeres;
- production build: sikeres;
- PM2 újraindítás: sikeres;
- valós lezárt értekezlet böngészős tesztje: sikeres;
- valós tervezet DOCX/PDF exporttesztje: sikeres.

## Backup

```text
backups/meeting-ai-draft-fallback-20260724_053320
```

## Fejlesztési állapot

A korábban elkészített, de külön tervezetként el nem mentett AI-összefoglalók automatikus helyreállítása és exportja production állapotban elkészült.
