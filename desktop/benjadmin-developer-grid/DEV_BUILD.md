# BENJADMIN Developer Grid v0.1.2 DEV build

Első Windows desktop preview. A ChatGrid v0.3.x forrását fallback/reference alapként használja, de külön package/appId/userData/EXE identitással fut, ezért nem írja felül a ChatGridet.

A `v0.1.2` stabilizációs kör fő eltérései:
- `electron-builder` dependency/security hardening;
- a native delta működés dokumentációjának konzisztenssé tétele;
- a befagyasztott v0.1.1 Windows acceptance visszajelzéseinek fogadása és célzott javítása.

A v0.1.1-ben elkészült alapok továbbra is érvényesek:
- fix 01 ÁrminAI / 02 OutminAI / 03 BenjáminAI / 04 JázminAI elrendezés;
- középre dokkolt BENJADMIN Fejlesztői Vezérlőpult;
- 05 DevminAI külön központi ChatGPT ablak;
- Developer Grid saját Windows telepítési és konfigurációs tér;
- DEV ONLY · PROD DENY.

## Állapotfüggő worker-fejléc

A régi ChatGrid tapasztalata alapján a Developer Grid worker fejléc nem mutat állandó lezáró gombsort. A szabály:

- 1/6 ELEMZÉS: task / kontextus / checkpoint irány
- 2/6 FEJLESZTÉS: task / checkpoint / `MUNKA ÁTADÁSA`
- 3/6 TESZTELÉS: task / tesztek / checkpoint
- 4/6 ELLENŐRZÉS: task / review / checkpoint
- 5/6 BUILD / KIADÁS: build / runtime / checkpoint
- 6/6 LEZÁRÁS: V2 mentés / MD letöltés / új átadó / lezárás

Aktív vagy helyreállítandó handoff mindig látható marad fail-closed okból. A stage érték egyetlen authoritative cella-adatból származik, ezért ugyanaz a `2/6 · FEJLESZTÉS` nem jelenhet meg kétszer a jobb oldali vezérlősávban.

## Native Developer Grid realtime

A desktop elsődleges élő állapotforrása már a Developer Grid saját `DELTA_EVENT` / `DELTA_STATE` API-ja:

- bootstrap: `/api/dev/grid/foundation`, `/api/dev/grid/state`, `/api/dev/grid/events`;
- folytatás: revision-alapú state delta és cursoros event delta;
- `BACKFILL` esemény nem írhatja felül az élő worker állapotot;
- a régi ChatGrid full snapshot endpoint legfeljebb egyszeri kompatibilitási bootstrapként használható, ha az új DEV runtime még nem teszi elérhetővé a Grid API-t;
- periodikus legacy full-snapshot polling nincs.
