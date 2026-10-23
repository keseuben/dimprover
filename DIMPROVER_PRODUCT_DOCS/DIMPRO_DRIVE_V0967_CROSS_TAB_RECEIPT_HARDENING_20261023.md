# DIMPRO Drive V0.9.67 – többfüles személyes feltöltés biztonságos receipt-jegyzéke

**Dátum:** 2026-10-23 · **Scope:** DIMPRO Drive / Saját Drive / Transfer Center.
**Kiadási állapot:** SOURCE + QA PASS; BUILD01 NOT RUN; valós DEV S3/DB/browser E2E NO-GO; PROD DENY.

## 1. V0.9.66 probléma és V0.9.67 megoldás

A V0.9.66 bevezette a böngésző-újraindításon át használható, fiókhoz kötött,
maximum 500 rekordos, 7 napig megőrzött feltöltési ellenőrzési jegyzéket.
A helyi tárolás a requestId/sizeBytes/startedAt hármast tartalmazza,
nem fájltartalmat, fájlnevet vagy belépési tokent.

A V0.9.66 egyetlen, megosztott localStorage JSON listát írt át. Két egyszerre
nyitott böngészőfül ugyanazon felhasználó két független feltöltésekor
last-write-wins módon felülírhatta egymás jegyzékét, ami elveszett
ellenőrzési hivatkozásokat eredményezhetett.

V0.9.67: a V2 tárolóban **minden requestId saját localStorage kulcsot kap**:
`dimpro-drive-personal-upload-receipt-v2:<opaque-user-scope>:<requestId>`.
A feltöltés A bejegyzésének írása vagy törlése nem módosítja B bejegyzését.
Az 500-as limithez szükséges teljes felsorolás maximum 25 000
böngészőtárhely-kulcsot enged vizsgálni; ezen túl fail-closed.

A tényleges feltöltési végpont nem változott. A V0.9.65 szerveroldali,
hitelesített, tulajdonoshoz kötött GET /status/{requestId} továbbra is az
egyetlen jogosult visszaellenőrzés: CLEAN + tényleges S3 teljes SHA-256 + méret.
A localStorage önmagában sem sikert, sem jogosultságot nem bizonyít.

## 2. V1→V2 átállás

- A V0.9.66 V1 listát az új kód olvassa.
- A `prunePersonalReceipts` ellenőrzött V1 soronként hozza létre az egyedi
  V2 kulcsokat; a V1 lista csak az összes érvényes rekord sikeres és
  visszaolvasott V2 mentése után távolítható el.
- Ha a böngésző kvótája vagy tárolója hibát ad az átállás közben,
  a V1 jegyzék megmarad és a folytatás később újrapróbálható.
- Ha egy már létező V2 kulcs hibás vagy lejárt, a V1 érvényes példánya
  visszaállítható; az éppen javított V2 kulcsot nem szabad az általános
  sérült-rekord takarításban ismét törölni.
- Ha ugyanazon requestId-hoz érvényes V1 és V2 metaadat között méret- vagy
  kezdési-idő eltérés van, az átállás **fail-closed**; a V1 rekordot nem
  töröljük, és nem választunk csendben az ütköző adatok közül.

## 3. Kétfüles limit, megszakítás és tárolóhibák

- A V2 a már meglévő maximum 500 érvényes receipt azonosítót tartja meg
  fiókonként. A 501. rekord normál esetben nem menthető, ezért a hozzá
  tartozó új hálózati feltöltés sem indítható.
- Azonos requestId ismételt felvétele csak egyező mérettel és időponttal
  megengedett; eltérés esetén nincs felülírás.
- A 500-as limitnél egy második böngészőfül közbeiktatott írását teszteltük:
  az új kísérlet elutasításakor kizárólag a saját új kulcsa kerül
  visszavonásra. Korábbi vagy másik fülhöz tartozó rekord nem törlődik.
- A globális felhasználónkénti 500-as korlát helyi tárolóban
  **best-effort** konkurenciavédelem; browser storage nem tranzakciós DB.
  A végső szerveroldali ownership/kvóta/duplikáció védelmek maradnak az
  irányadók. Valódi multi-tab fizikai browser E2E továbbra is nyitott.
- Hibás V2 JSON vagy olyan sor, amely érzékeny többletmezőt tartalmaz,
  elkülönítetten érvénytelen; nem rejti el a többi érvényes receipt-et.
- A 7 napos retention, fiókonkénti anonim scope és no-auto-retry megmaradt.

## 4. Ellenőrzések

- `scripts/tests/dimpro-drive-v0967-cross-tab-receipt-contract.mjs`:
  megosztott Storage-t használó kétfüles írás/törlés, két külön scope,
  sérült rekord, V1→V2 migráció, félbemaradt migráció utáni folytatás,
  sérült V2 javítása V1 alapján, V1/V2 ütközés megőrzése,
  499→500 határnál másik fül közbeiktatott írása – **PASS**.
- `scripts/tests/dimpro-drive-v0966-personal-receipt-storage-contract.mjs`
  frissítve a V2 formátumra: 500 rekordos kapacitás és hibatesztek,
  privacy, újraindítás, TTL és helyi takarítás – **PASS**.
- Az örökölt V0.9.50–66 source contractok V0.9.67 kompatibilitási
  elvárásai frissítve, biztonsági szemantika változtatása nélkül.
- TypeScript és célzott ESLint: PASS.
- Git diff --check: PASS.
- Összesen **23/23 szerződéses/regressziós teszt PASS**, 0 FAIL.
- Az öt releváns PostgreSQL-migráció, USER ownership, kvóta, RLS és
  hibás alapmigráció rollback tesztje izolált PGlite-ben PASS.
- A kétfüles vizsgálat determinisztikus közös Storage-szimuláció,
  nem tényleges kétböngészős vagy hitelesített S3/DB teszt.

## 5. Kiadási STOP / BUILD01

- A korábbi V0.9.63 BUILD01 operáció indítását külső eszközbiztonsági
  tiltás blokkolta. A V0.9.63-hoz továbbra sincs result JSON.
- V0.9.67 BUILD01 **nem futott**, és a tiltás megkerülése tilos.
  Csak a jóváhagyott, hivatalos BUILD01 operátori/Central Core útvonal
  használható később. Source-only Git commit != build artefact.
- A független DEV/PROD S3 bucket és adatbázis-elkülönítési inventory
  továbbra is hiányzik; emiatt tilos valós bucket PUT vagy DB migráció.
- A publikus `drive.dev.dimpro.hu` továbbra is **V0.9.52**.
  `PERSONAL_MULTIPART_SERVER_RELEASED=false`; PROD DENY.

## 6. Következő V0.9.68 release-gate

1. Hivatalos BUILD01 külön engedélyezett operátori futtatása; runner
   biztonsági blokkolásának szabályos tisztázása.
2. Független, ellenőrzött S3/DEV DB/PROD szétválasztás és izolált
   tesztfelhasználói jogosultságok.
3. Hitelesített valós 1/17/100 MiB Next.js → ClamAV → S3 → DB E2E
   és sérült/már létező fájl visszaellenőrzés.
4. Két valódi browser-tab 500 darabos feltöltési sor, hálózatvesztés,
   újraindítás, 7 napos TTL, 50/100/500 fotós batch és rollback.
5. Csak auditált DEV pilottest után jóváhagyott publikus DEV aktiválás;
   PROD továbbra is DENY.

Nincs újraindítás, aktuális PM2/nginx módosítás, közös DB-migráció,
valós S3 PUT vagy szerver-takarítás ebben a fejlesztési körben.
