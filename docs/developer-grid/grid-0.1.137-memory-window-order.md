# Grid 0.1.137 – friss és történeti átadóadatok

## Bizonyított hiba

A lezárt Drive 0.9.68 feladat 79 RAW snapshotjában a ChatGPT látható ablaka 6 üzenetről 2-re változott. Az új review üzenetek újra 1–2-es ordinal értéket kaptak. A korábbi rekonstrukció minden megfigyelt üzenetet e lokális sorszám alapján rendezett, így a november10-i 5–6-os üzeneteket választotta legutóbbi állapotnak. A strukturált HEAD/teszt/build mezők helyesek voltak, a szöveges összefoglaló mégis régi eredményt idézett.

## Javítás

Az új RAW rekord az aktuális megfigyelt ablak teljes messageOrder azonosítósorrendjét is tárolja. A rekonstrukció ehhez rendezi a visszaolvasott tartalmat és ellenőrzi a snapshot digestet. Hiányzó, ismétlődő, idegen vagy eltérő tartalmú sorrend elutasított. Az üres/érvénytelen bemeneti sorok kiszűrése után a normalizált ordinal folytonos. Nulla delta mellett is megőrződik a sorrend; azonos digestű régi rekord új, append-only sorrendmetaadattal frissülhet, történeti felülírás nélkül.

A régi formátumú rekonstruált transcriptből nem jelenítünk meg idézetet igazolt legutóbbi állapotként. A friss összefoglaló előbb az adott HEAD szerveres teszt- és build evidence-ét közli; az üzenetek kifejezetten idézetek, nem új engedélyek és nem szerveres tények. A Context/Handoff summaryVersion2 jelzi az új formátumot.

A régi context/handoff olvasása és az új task folytonossági summary-ja biztonságos, strukturált megjelenítést kap. A régi automatikus canonical átadók listázott summary-ja is a rögzített task/HEAD/teszt/build mezőkből készül; a manuális és új formátumú rekordok változatlanok. Az eredeti Markdown és sha256 megmarad. Új canonical automatikus átadók -memory2 végű determinisztikus azonosítót kapnak, így korábbi archívum nem íródik felül. A korábbi, letöltött történeti Markdown nem változik visszamenőleg.

## Ellenőrzés

- Futó memóriafunkciókat ellenőrző regresszió: lokális ordinal-visszaállás, pontos ablak, nulla delta, lenyomat, idegen task/session/worker/surface, érvénytelen sorrend.
- Tényleges privát fixture-persistence: RAW/Context/Handoff append, dedup, azonos digestű legacy upgrade.
- Legacy latest/status/continuation/canonical lista és integritás-ellenőrzött Markdown olvasás, történeti bájtok módosítása nélkül.
- Valódi, lezárt Drive-transcript readonly replay: PASS; aktuális HEAD teszt/build fixture a megőrzött szerveres bizonyítékból, élő RAW hash változatlan. Ez replay-próba, nem élő API-újraírás.
- A régi v033 forráskontraktus elavult TASK_MISMATCH markerét a tényleges TASK_REQUIRED szerződésre igazítottuk; a task/session/worker/conversation/surface elutasítását a futó kódon vizsgáló teszt külön ellenőrzi. A két memóriateszt a desktop munkakönyvtárból is fut.
- Teljes desktop check és TypeScript PASS. A memóriatesztek a Windows build check láncában is kötelezőek.

Windows/API éles próba külön igazolandó a kiadás után. A Drive 0.9.68 lezárt feladatát és üzleti adatait nem módosítjuk; PROD DENY.
