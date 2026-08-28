# BENJADMIN Developer Grid v0.1.4 DEV build

Első Windows desktop preview. A ChatGrid v0.3.x forrását fallback/reference alapként használja, de külön package/appId/userData/EXE identitással fut, ezért nem írja felül a ChatGridet.

A `v0.1.2` stabilizációs kör fő eltérései:
- `electron-builder` dependency/security hardening;
- Windows DEV EXE: a kódaláírás ki van kapcsolva, de a `resedit` erőforrás-szerkesztés aktív marad, így a DIMPRO ikon és Windows verziómeta bekerül;
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

## v0.1.3 release/runtime hardening

- immutable release worktree esetén a source worktree / branch / repository elvárás explicit DEV runtime env-ből scope-olható, miközben a tényleges Git provenance ellenőrzés továbbra is fail-closed;
- a candidate smoke zárósora a tényleges foundation verzióból készül, ezért nem maradhat benne régi verziófelirat;
- a v0.1.2 befagyasztott release-tag és artifactok változatlanok maradnak.

## v0.1.4 Release Artifact Engine

A kiadási sorrend a Windows EXE és a DEV ZIP elkészítése után:

```bash
scripts/developer-grid/release-artifacts.sh --stage --verify-public
```

A wrapper a központi `release` exclusive lockot használja. A release engine fail-closed ellenőrzi a Git HEAD/branch/worktree/repository azonosságot, a Next.js `BUILD_ID` + `.dimpro-release.json` egyezést, az EXE/ZIP meglétét, a DEV ZIP tiltott tartalmát, az immutable artifact tárat, majd opcionálisan a publikus DEV staging teljes visszatöltési hashét. PROD staging nem engedélyezett.
