# BENJADMIN Developer Grid v0.1.1 DEV build

Első Windows desktop preview. A ChatGrid v0.3.x forrását fallback/reference alapként használja, de külön package/appId/userData/EXE identitással fut, ezért nem írja felül a ChatGridet.

A `v0.1.1` fő eltérései:
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

