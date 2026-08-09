# 10 Következő fejlesztések

## HexPin / tervi hibajelölés

- automatikus részletkép-generálás export előtt
- több marker listás kezelése egy hibán belül
- QR pecsét / tervlap azonosítás
- tervlap metaadatok kezelése
- tervtári integráció

## Platform

- adatbázis perzisztencia
- felhasználói jogosultságok
- projektválasztó bővítése
- email küldési napló
- export sablonok verziózása

## IFC néző következő fejlesztési lépések

1. IFC elemkijelölés stabilizálása ThatOpen / Fragments raycast alapján.
2. Kijelölt IFC elem tulajdonságpanel bővítése teljes property listával.
3. Kategória vagy elem szintű láthatóság-kezelés: fal, födém, oszlop, gépészet stb.
4. Valós 3D mérés készítése világkoordináta alapján, nem csak képernyőpontból.
5. Metszősík / clipping plane MVP.
6. 3D ponthoz kötött HJ marker:
   - `anchorMode: "screen" | "world"`
   - `worldPosition: { x, y, z }`
   - kamera mozgásakor képernyőre vetítés
   - meglévő képernyőpozíciós marker mód megtartása fallbackként.

## Értesítési Központ következő lépések

- File-backed MVP tároló migrálása Supabase/PostgreSQL táblákba.
- Végleges `ProjectMember` / projektjogosultsági adatmodell bekötése.
- Email státusz mezők és küldési napló bekötése, de nem olvasottsági adatforrásként.
- DokuBOX Drop, Mappaőr, Jegyzőkönyv és Ütemterv eseménygenerátorok bekötése.
- WebSocket vagy Server-Sent Events élő értesítésekhez.
- Felhasználói értesítési preferenciák: web, desktop, email, napi összefoglaló.

## DIMPRO Felmérő következő energetikai szint

- v0.7.4 – nyílászárók és hőhidak részletes számítása. Elkészült 2026-07-29.

- v0.7.5 – zónánkénti méretezési fűtési terhelés és gépészeti rendszerkapcsolatok. Elkészült 2026-07-29.

- v0.7.6 – havi nettó fűtési és hűtési energiaigény meteorológiai, szoláris, belső nyereség- és hőtárolási adatokkal.

- v0.8.0 – Terepi energetikai workflow, felújítási változatok, WinWatt-előkészítés, napelem, napkollektor, akkumulátor és autótöltés. Elkészült 2026-07-29.
- v0.8.1 – helyszíni gyorsfelvétel és javaslatkártyák további egyszerűsítése. Elkészült 2026-07-29.
- v0.8.2 – meglévő és tervezett változatok számított összehasonlítása.
- v0.8.3 – WinWatt mezőtérkép és próbaátadási csomag. Elkészült 2026-07-29.
- v0.8.4 – WinWatt próbamunkamenet, mezőnkénti célpontosítás, beviteli idő és DIMPRO–WinWatt eredményeltérés. Elkészült 2026-07-30.
- v0.8.4.1 – responsive központi szakértői munkatér, kompakt jobb board, Rajz/Adatok/Osztott nézet és felmérésalapú munkaidőmérő. Elkészült 2026-07-30.
- v0.8.4.2 – vezetett WinWatt-próbaasszisztens, vágólapmásolás, automatikus mezőidő, gyors státuszok, blokkolt lista és folytatható aktív mező. Elkészült 2026-07-30.
- v0.8.4.3 – PDF tervlap alapú felmérés MVP: többoldalas PDF, kivágás, elhelyezés, kétpontos léptékkalibráció, kézi helyiségpoligon, vektoros útvonal- és kontúrelemzés, jóváhagyandó overlay. Elkészült 2026-07-30.
- v0.8.4.3.1 – tervlapi 50–400% nagyítás, helyiségfókusz és feliratritkítás. Elkészült 2026-07-30.
- v0.8.4.3.2 – valós CAD/PDF helyiségfelirat- és m²-felismerés javítása. Elkészült 2026-07-30.
- v0.8.4.3.3 – kis helyiség callout-címke, kézi helyiségfelvétel, helyiség- és címkemozgatás, egyszeres kijelölés és dupla kattintásos fókusz/visszaállítás. Elkészült 2026-07-30.
- v0.8.4.4 – PDF geometriajavítás és külső határolás: poligonpont-mozgatás, helyiség összevonás/kettévágás, automatikus külső falszakasz-javaslat és falszakasz kézi javítás. Elkészült 2026-07-30.
- v0.8.4.4.1 – fal-szerkezettípus kapcsolat, részletes nyílászáró-javaslat, bruttó/nettó határolófelület és fal–nyílászáró–zóna kapcsolatok. Elkészült 2026-07-30.
- v0.8.4.4.2 – jóváhagyott fal- és nyílászáró-javaslatok idempotens átadása a központi energetikai modellbe, nyílászáró-katalógus, Uw/g-adatforrás, árnyékolás- és hőhídkapcsolat. Elkészült 2026-07-31.
- v0.8.4.4.3 – több tervlapos átadási nyilvántartás, terv–központi modell tartalmi változásjelzés, konfliktusvédelem, átadási auditnapló és megerősített eltávolítás. Elkészült 2026-07-31.
- v0.8.4.4.4 – tervverziók közötti oldal- és elempárosítás, vizuális/táblázatos változás-diff, részleges elfogadás és tervverzió-kapcsolat. Elkészült 2026-07-31.
- v0.8.4.4.5 – elfogadott tervverzió-változások ellenőrzött átvezetése a központi energetikai modellbe: forrásazonosító-migráció, részleges frissítés, törlési előnézet, audit és visszaállítás. Elkészült 2026-07-31.
- v0.8.4.4.6 – több egymást követő tervverzió verziógráfja, alkalmazási előzmények navigációja, rollback-pontok kezelése és projektállomány-méretoptimalizálás. Elkészült 2026-07-31.
- v0.8.4.4.7 – verziógráf export, összehasonlítási dokumentumcsomag és szerveres megosztott revíziókezelés előkészítése.
- Későbbi külön szint – raszteres/szkennelt PDF OCR és kézi javítási workflow.
- v0.8.5 – valós WinWatt-próbával visszaigazolt mezők ellenőrzött központi mezőtérkép-frissítése; csak tényleges próbaadatok alapján indítható.
