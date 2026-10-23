# DIMPRO Drive V0.9.61 – személyes 100 MiB feltöltési biztonsági elővizsgálat

Dátum: 2026-10-23 · Állapot: SOURCE + valós ClamAV próba, a teljes böngészős feltöltés még NEM aktív.
Környezet: fejlesztői MCP környezet, DEV-only, PROD DENY.

## Cél

A V0.9.55 szerinti legfeljebb 500 fájlos kijelölés és a V0.9.56 szerinti
100 MiB/fájl personal stream upload felkészítése a valódi DEV pilotra.
A személyes feltöltési feature-flag továbbra is OFF az aktív runtime-ban.

## 1. Valós ClamAV scanner teszt – PASS

A fejlesztői környezetben elérhető, már futó lokális ClamAV Unix socketre
a meglévő `app/lib/drop/worker/clamdInstream.ts` közös vírusvizsgáló motort hívtuk.
A teszt nem indított új scan szolgáltatást, nem töltött fel fájlt S3-ba,
nem hozott létre adatbázis-bejegyzést és nem módosított ügyféladatot.

- `getClamdHealth()`: PONG, motorverzió `1.5.3`, vírusadatbázis-verzió `28162` – PASS a teszt idején.
- Szintetikus, nem fertőzött **1 MiB** adatfolyam: CLEAN, teljes méret + SHA-256 PASS.
- Szintetikus, nem fertőzött **17 MiB** adatfolyam: CLEAN, teljes méret + SHA-256 PASS.
- Szintetikus, nem fertőzött **100 MiB** adatfolyam: CLEAN, teljes méret + SHA-256 PASS.
- Szabványos, **ártalmatlan EICAR antivírus-próbajel** csak memóriából az INSTREAM protokollon: INFECTED és elutasítás PASS. Nem készítettünk EICAR fájlt.
- A konfigurációs ellenőrzéskor a tényleges clamd daemon:
  `StreamMaxLength=110M`, `MaxFileSize=110M`, `MaxScanSize=120M`.
- A `drive.dev.dimpro.hu` Nginx vhostban: `client_max_body_size 120m`, `proxy_read_timeout 120s`.
- **Határ:** ez a scanner-motor 100 MiB-os működését bizonyítja, NEM a teljes hitelesített böngésző → Nginx → Next.js → S3 → DB upload E2E-t és nem a 100 MiB-os kérések átvitelidejét lassú hálózaton.

Reprodukció csak jogosult DEV környezetben:
```bash
DIMPRO_PRODUCTION_ACCESS=DENY DIMPRO_CLAMD_PROBE_DEV=true node scripts/tests/dimpro-drive-v0961-clamd-instream-probe.mjs
```

## 2. Nagy fájlszám miatti kvótakijelzés javítása

A korábbi `getPersonalDriveStorageQuota()` egyetlen, lapozatlan
`dimpro_content_refs` lekérdezésre épült. PostgREST lekérdezési max
(gyakran 1000 sor) felett ez alulbecsülhette a személyes tárhelyhasználatot,
főleg több 500 képes feltöltés után. A feltöltést lezáró DB RPC kvótaszámítása
eddig is szerveroldali, atomikus volt, de a kliens előellenőrzése pontatlan lehetett.

A V0.9.61 javítás:

- Új `app/lib/content-core/personalQuotaPaging.ts`: UUID-id alapú
  monoton cursor/keyset lapozás, 500 ref/lap; minden hivatkozás `ACTIVE`
  és `REMOVED` állapotából.
- A tartalomobjektumokat egyedi azonosító alapján csak egyszer számolja,
  legfeljebb 100 ID-t kér le objektumadatonként, a
  `dimpro_content_objects.status=ACTIVE` szűrővel.
- Hibás sorrend, hiányzó/kétes rekord, túlcsordult byteösszeg, hibás batch
  vagy indokolatlanul sok referencia esetén hiba, **nem csendes alulszámolás**.
- Legfeljebb 100 000 ref automatikus összesítése (efelett fail-closed,
  külön SQL aggregáló RPC/hardening szükséges).
- Új `scripts/tests/dimpro-drive-v0961-personal-quota-paging-contract.mjs`:
  **2505 hivatkozás / 1253 egyedi objektum** több lapból és 13 objektum-batchből,
  méret összegzése, deduplikáció, hiba- és limitpróbák PASS.
- A V0.9.59 v011 quota-summary RPC gyors, egy SQL snapshotból számoló
  megoldása továbbra is a későbbi, auditált 5 GiB-os release mögött van;
  a jelenlegi, 100 MiB-os pilothoz a paged összesítés külön DB-migráció nélkül
  használható.
- A read-only előellenőrzés önmagában nem atomikus pillanatkép: a DB RPC
  marad az utolsó, kötelező kvótadöntés.

## 3. QA és kiadási kapuk

- TypeScript `npx tsc --noEmit`: PASS.
- Célzott ESLint: PASS.
- V0.9.61 quota paging contract: PASS.
- V0.9.50–59 15 további regressziós/contract teszt: PASS.
- V0.9.60 PGlite migráció (5 SQL), owner/ACL, RLS, idempotens kvóta
  és rollback teszt újrafuttatás: PASS.
- `git diff --check`: PASS.
- Fenti ClamAV próbák valós scannerrel: PASS.

### Még fennálló blokkolók

1. A személyes 100 MiB-os feltöltés bekapcsolása nincs végrehajtva;
   `DIMPRO_DRIVE_PERSONAL_UPLOAD_ENABLED` az aktív DEV runtime-on OFF.
2. Nincs hitelesített S3-upload, Content Core ref, quota, szkennelt/karantén és
   böngészős 50/100/500 darabos batch E2E.
3. Az 100 MiB-os stream HTTP teljesítésénél a Nginx buffering és 120s proxy
   timeout hatását többféle hálózati környezetben ki kell próbálni.
4. A hosszabb idejű vagy bizonytalanul megszakadt kérés S3-object/DB-referencia
   helyreállítását, orphan takarítását külön retention és visszaállítási
   kapu alatt kell végezni – semmilyen automatikus törlés nem lett aktiválva.
5. Az 5 GiB multipart funkció külön `PERSONAL_MULTIPART_SERVER_RELEASED=false`
   kódszintű retesz alatt marad; a 100 MiB ClamAV próba ehhez nem elegendő.

**Következő cél:** V0.9.62 külön engedélyezett izolált runtime + valós S3/DB
személyes próbafeltöltés, majd a webes DEV 500-fájlos pilotteszt. Kiadási
döntés előtt szükséges az S3 / DEV-PROD adatforrás-szeparáció és a rollback
ellenőrzése. A public runtime változatlan.
