# DIMPRO Drive V0.9.42 – csomagváltás, lejárat és adatmegőrzés

Dátum: 2026-10-11
Állapot: SOURCE CANDIDATE, NEM telepített, nem éles előfizetési szabály, nem adatbázismigráció, PROD DENY.

## 1. Alapelvek

A V0.9.41 korábbi nettó árai és tagszámai csak üzleti tervezetek, nem aktív tarifák. A V0.9.42 tiszta, read-only elővizsgálati modellt készít; nincs valódi licence- vagy fájlmódosítás.

- Licenc, Project Core projekt ACL és mappaszintű jogosultság külön rétegek. A kereskedelmi licenc soha nem helyettesíti az identitásalapú jogosultságot.
- A tárhely, a szerkesztők és a csak olvasó meghívottak korlátját külön kell ellenőrizni. Nagyobb tárhely nem jelent több szerkesztőt.
- Downgrade esetén az aktívan használt és a feltöltésekhez lefoglalt bájtokat együtt vizsgáljuk. Túlcsordulásnál a váltás csak rendezés után készíthető elő. Soha nincs automatikus törlés vagy régi verziók kiürítése.
- A túl magas taglétszámot figyelmeztetjük, automatikusan semmilyen szerepkört nem veszünk vissza.
- A 14 napos türelmi idő és a későbbi read-only, adatmegőrző időszak csak javaslat, még nem jóváhagyott szerződéses feltétel. A teljes dokumentumkészlet megőrzése az elsődleges biztonsági alap.
- A Projektkapu nem kap külön Drive-tárhely kvótát; közös fájlok dupla számlázása nem megengedett.
- Saját Drive személyhez rendelt licencmodell külön auth-user alapú entitlementot igényel, a projektalapú auth_project_product_licenses tábla erre önmagában nem alkalmas. Fiktív projektet nem szabad létrehozni.

## 2. Kész forrás

- app/lib/license/subscriptionPreviewPolicy.ts: side effect nélküli, típusos elővizsgálat. A bemenet: licencállapot, expiry, céltermék/scope, célkvóta, foglalt+reserved bájt, aktív szerkesztők és olvasók. Az eredmény ajánlott állapot, rendezési blokkolók, hiányértékek és indoklások.
- Kemény invariáns: preserveAssets true, effectiveQuotaChanged false, effectiveAccessChanged false, appliesPrice false. Nincs AUTH DB lekérdezés, számlázás, e-mail, ACL változás vagy fájltörlés.
- components/license/SubscriptionImpactPreview.tsx + CSS: belső háromfüles, laptop/mobil reszponzív demó-szimulátor, GiB méretek és 10/25/100 Projektkapu taglépcsők, dátum/használat/foglalás/tagszám bemenettel. Csak kliensmemóriában működik.
- app/admin/licenckozpont/page.tsx: központi Licencközpont új önálló read-only panelje.
- components/drive/driveBuildInfo.ts: V0.9.42 forrásverzió, nem aktív DEV runtime.
- scripts/tests/drive-subscription-preview-contract.mjs: expiry-határnap, türelmi idő, read-only javaslat, kvóta-/seat-túllépés, reserved kapacitás, scope, no-delete/no-enforcement és admin-hard-gate regresszió.

## 3. Függő üzleti és technikai döntések

- Fizetős díjak, a 10 szerkesztő + 50 olvasó Projekt Drive keret, a Projektkapu 10/25/100 aktív résztvevő, az éves 10x díj és a 14 napos türelmi idő külön szerződéses jóváhagyást igényel.
- A lejárat utáni read-only hozzáférés, letöltési jog és adatmegőrzési időtartam jogi és műszaki egyeztetés tárgya.
- Számlázás és entitlement összekötés csak stabil AUTH identitás, idempotens tranzakció, audit, tényleges storage és role adatforrás, rollback, új E2E és üzemeltetői jóváhagyás után.
- A meglévő személyes 50 GiB és projekt 10 GiB default kvóta továbbra sem változott, a korábbi ügyfelek adatainál kötelező grandfathered védelem.
- AUTH 014–017 továbbra is source-only. A licenckiadás POST/PATCH hard gate továbbra is false.

## 4. Valós költség bizonyítottsága

A kapcsolt céges Gmail fiók célzott, csak olvasási keresése során 2026 júniusától DotRoll-számlaüzenet nem került elő, Hetzner számlaértesítések és Storage Box karbantartási értesítések viszont igen. Az e-mailek alapján nem lehet megbízhatóan kiszámítani a Drive szolgáltatás elkülönített primer és mentési tárhelyének teljes havi költségét. Nem töltöttünk le bizalmas mellékleteket és nem vettünk át számlaazonosítókat.

Az 500 GiB-os V0.9.41 modell továbbra is modellfeltevés; hiteles szolgáltatói szerződéses ár, költségallokáció, mentés-visszaállítás próba és kapacitásgarancia nélkül nem válhat publikus díj- vagy szolgáltatási ígéretté.

## 5. QA

33/33 elővizsgálati policy, TypeScript és célzott ESLint PASS. Teljes BUILD01 eredmény a build után rögzítendő. PROD DENY.
