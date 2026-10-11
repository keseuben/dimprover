# DIMPRO V0.9.44 – személyes licencek (USER-scope)

Dátum: 2026-10-11
Állapot: SOURCE CANDIDATE, PROD DENY. Nincs migráció, DEV/PROD telepítés, számlázás vagy licencaktiválás.

## Rendszerelv

A központi DIMPRO termékcsalád öt szintje: DIMPROONE, DIMPRO WORK, DIMPRO Projektkapu, DIMPRO BUILD, DIMPROVER. A DIMPRO Drive önállóan előfizethető, de közös fájlkezelő szolgáltatás, nem hatodik szint.

Az egyéni kereskedelmi licenc tulajdonosa a hiteles AUTH felhasználó stabil UUID-ja (auth_users.id), nem az e-mail-cím és nem egy fiktív projekt. A fizető lehet egyéni USER vagy vállalkozás (ORGANIZATION), de a terméklicenc tulajdonosi scope-ja USER marad. Egy projektmeghívás önmagában nem keletkeztet személyes fizetős Drive- vagy DIMPROONE-licencet.

## V0.9.44 elkészült források

- db/auth/migrations/019_auth_v056_user_product_licenses.sql – külön, még NEM alkalmazott USER-scope licenctábla, két termékkóddal: DRIVE és DIMPRO_ONE. Egy felhasználóhoz termékenként egy azonosító; auditált verziók, immutable tulajdonosi adatok és tiltott fizikai licenctörlés. Csak jóváhagyási adatokkal, kezdéssel és lejárattal lehet ACTIVE állapotot tárolni. Saját Drive-nál pozitív tervezett tárhelykvóta, DIMPROONE esetén 0 GiB külön kvóta. Nincs automatikus aktív licenc, felhasználói grant, SSO-kliens vagy áremelés.
- app/lib/license/userCommercialReadinessCore.ts – tiszta kereskedelmi állapotértékelés; hiányzó tábla, még nem indult licenc, lejárt rekord, felfüggesztett rekord és hibás jóváhagyás külön kezelve. Az ACTIVE_RECORD_ONLY nem a termék tényleges hozzáférési állapota.
- app/lib/license/userCommercialReadiness.ts – kizárólag hiteles AUTH UUID-ra és aktív, igazolt, bejelentkezhet felhasználóra szűrt, read-only lekérdezés. Payer, licenckód, email, audit és projektazonosító soha nem szerepel az ügyfélnek kiadott adatszerkezetben.
- GET /api/drive/license/self – önmagára korlátozott API, minden kérésnél AUTH munkamenettel, private/no-store válasszal. Nincs userId/email paraméter, admin művelet vagy POST.
- components/drive/PersonalCommercialReadinessCard.tsx – a meglévő Drive Licenc és előfizetés felületen külön személyes termék-kereskedelmi kártya. Önálló lekérdezés, nincs quota-változtatás vagy fizetés; a régi licenc- és tárhelyfunkciók hibája nélkül kezelhető.
- components/drive/DriveLicenseCenter.tsx – a fenti kártya megjelenítése a korábbi licencektől elkülönítve.
- components/drive/driveBuildInfo.ts – V0.9.44 forrásjelölt, nem a működő DEV build verziója.

## Biztonsági garanciák

1. Egy másik felhasználó kereskedelmi rekordja sem URL-paraméterrel, sem projekttagsággal nem kérdezhető le. A SELECT mindig a hitelesített auth.actor.userId értéket használja.
2. A runtime AUTH DB szerepkör csak SELECT jogot kap a USER-licenctáblához. Az audittábla nem olvasható; INSERT/UPDATE/DELETE tiltott.
3. A DB migráció nem készít új termékgrantot vagy fizetős előfizetést, és nem módosítja a jelenlegi AUTH roles/jogokat.
4. Egy személyes Drive csomag nem növeli a projekttárhelyet. Egy DIMPROONE előfizetés nem kap automatikusan külön Drive-assetet, fizikai másolatot vagy újabb Drive kvótát.
5. A személyes Drive forrásban meglévő 50 GiB-os alapkvóta változatlan. A kereskedelmi rekord javasolt kerete nem változtatja meg az effektív kvótát. Meglévő előfizetések grandfathered védelme kötelező.
6. A 019 migráció csak az elfogadott, de még nem telepített 018 topológiai katalógus után futtatható. Valódi AUTH adatbázison külön DBA review, biztonsági mentés és jóváhagyás szükséges.

## Tesztek

- dimpro-user-license-readiness-contract.mjs: státusz, lejárat, kvóta- és hozzáférési invariánsok, UUID-alapú lekérdezés és SQL-kontraktus.
- dimpro-user-license-route-guard.mjs: hiányzó munkamenet 401, önmagára korlátozott lekérdezés, másik user kérés figyelmen kívül hagyása, DB-hiba 503.
- dimpro-user-license-pglite.mjs: izolált 018+019 migráció, több felhasználó és külön fizető, audit, nem módosítható személyes licenctulajdonos, tiltott törlés, runtime SELECT-only és más felhasználó adatainak kizárása.
- Korábbi Projekt Drive, Projektkapu, árkatalógus, lifecycle és értesítési regressziós tesztek a teljes kiadás előtt újrafuttatandók.
- Teljes BUILD01 eredmény a kiadásjelölt lefordulása után rögzítendő.

## Következő fejlesztési kapuk

Elsőként USER licenckiadási és jóváhagyási workflow terv külön, magas jogosultságú AUTH operátorral, auditált fizetési ellenőrzéssel és idempotens művelettel. Ezután a szervezethez kötött DIMPRO WORK/DIMPROVER licencek, majd DIMPRO BUILD projektlicencek. A valós effektív entitlement/kvóta feloldás kizárólag külön jóváhagyott release és migráció után aktiválható.

PROD DENY. Semmi nem törölhető, nem felülírható vagy aktiválható automatikusan.

## BUILD01 ellenőrzött V0.9.44 build – 2026-10-11

- Build run: dimpro-user-v0944-d4af9328c-20261011-build01-b1.
- Forráscommit: d4af9328cdd0d1158bf9ead95e8d818613f2034e.
- BUILD01 Next.js teljes build: PASS, TypeScript PASS (2,8 perc), 104/104 statikus oldal, 274 standalone chunk.
- Build ID: Jau8C-UUYp4mtv5X-ffdS.
- Artifact SHA-256: e0cb150f278825d260d091f6dac95d22042353573cdaf767121035b75b2d62fd.
- Az artifact fájl tényleges ellenőrzőösszege, a BUILD gateway státusz és a metadata SHA egyezik.
- QA: V0.9.44 readiness szerződésteszt, self-only route guard, USER-scope izolált PostgreSQL teszt; a korábbi 14/14 Drive értesítési csoport; 13/13 Drive licencolvasás, 18/18 projektlicenc, 21/21 Projektkapu–Drive ACL, 15/15 admin release-gate, 30/30 csomagkatalógus, 28/28 ármunkalap, 33/33 lejárati preview, 25/25 topológia, 35/35 projektrekord-ellenőrzés, 11/11 projekt API-ACL, 12/12 PGlite termékkatalógus, 10/10 PGlite projekt-szeparáció, 18/18 PGlite árkatalógus PASS.
- Kód TypeScript és célzott ESLint PASS; új migráció csak izolált PGlite-ben futott.
- DEV foglaltság a build után: 118 GiB lemez, 116 GiB foglalt, ~1,4 GiB szabad (99%). Nincs DEV telepítés, PM2, DB vagy PROD változás.
- A SOURCE candidate verzió nem azonos a felhasználó böngészőjében jelenleg működő kiadással.
- PROD DENY. Nem történt új fiókaktiválás, fájltörlés vagy számlázás.

## Következő V0.9.45 irány

Központi AUTH USER-scope kereskedelmi licenc kiadási/ellenőrzési workflow, kezdetben kizárólag előnézeti és operátori jóváhagyási modellel. Egyszeri, auditált manuális kiadás; a központi személyazonosító, fizető, csomag, tarifa és dátum ellenőrzése. A valós számlázási bizonyíték, magas jogosultsági kör és a read-only/active entitlement elkülönítése kiadás előtt szükséges. A szervezeti licencek ezután következnek.
