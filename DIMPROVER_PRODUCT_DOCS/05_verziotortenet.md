## 2026-08-07 – DIMPRO Identity Core 0.1.0 – központi adatbázismag, security hardening

- Elkészült a teljes DIMPRO/DIMPROVER termékcsalád közös felhasználó-, szervezet-, licenc-, modul-, Send-jogosultság- és projektkód-adatmodellje.
- A meglévő `dimpro_account_*`, Project Core és Drop rekordokhoz additív kompatibilitási hídkapcsolatok készültek, párhuzamos identitásrendszer nélkül.
- A migrációs csomag három lépcsős: központi törzs, Send/projekt hozzáférés és security hardening.
- A Send rate limit IP-pseudonimhoz, a projektkód rate limit entitlement + IP-pseudonimhoz kötött, ezért hibás kódok forgatásával nem kerülhető meg.
- A `locked_default` címzettmód fail-closed működésű, a default címzett kompozit FK-val a saját entitlementhez kötött.
- A belső `SECURITY DEFINER` helperek kliens-RPC futtatási joga explicit visszavonásra került; az érzékeny külső RPC-k `service_role`-only maradtak.
- PostgreSQL parser: 3 migráció + bootstrap + rollback + acceptance PASS.
- SQL acceptance szerződés: 24 teszteset; security contract: 16 ellenőrzés; TypeScript: PASS; célzott ESLint: 0 hiba.
- Live Supabase aktiválás még nem történt, mert a VPS-en nincs DDL/admin adatbázis-hitelesítés; `DIMPRO_IDENTITY_CORE_ENABLED=false` marad.
- Részletes dokumentáció: `109_dimpro_identity_license_send_project_core_v010.md`.

## 2026-08-01 – DIMPRO Drop DROP 0.2.0 – Atomi adatbázis- és csomagmotor

- Elkészült az adatbázis-adaptertől független publikus és admin repository-port, a Supabase service-role adapter és a kizárólag tesztben használható memóriás repository.
- Elkészült a fájl nélküli csomag-előnézet, a belső csomagkezelő, a szabályozott állapotgép, a purpose-specifikus link újrakiadása és az egyedi token-visszavonás.
- A publikus PIN-kapu, tokenpurpose-védelem, lejárat, rate limit és audit ugyanazon szolgáltatási rétegen teljes memóriás integrációs tesztet kapott.
- A csomaglétrehozás, csomagállapot-váltás, tokenhasználati számláló, token-újrakiadás és token-visszavonás külön atomi PostgreSQL RPC-vel készült el.
- A teljes Supabase bootstrap 6 migrációt, explicit `BEGIN` / `COMMIT` tranzakciót és `DROP 0.2.0` sémaverzió-jelölőt tartalmaz.
- Kötelező readiness: 7 tábla, `DROP 0.2.0`, 6 migráció és `drop-020-atomic-package-engine-20260801` bootstrap azonosító.
- Aktuális bootstrap SHA256: `591250bb1bdda6087b50ff7b94ea2b7a3c40e09301285c2460eba9318d1bae55`.
- A 11 lépcsős offline acceptance, TypeScript, célzott ESLint, admin API-szerződés, memóriás hozzáférési és admin életciklus teszt: PASS.
- Candidate nyilvános smoke 11/11, licencadmin védelem és előnézet PASS, desktop/tablet/mobil responsive 3/3 PASS. A végleges forrásváltozások után új candidate build szükséges.
- A Supabase SQL nincs alkalmazva; read-only readiness mind a 7 kötelező táblára 404-et ad. Adatbázisírás, éles `.next` csere és PM2 restart nem történt.
- Fájlfeltöltés, letöltés, ZIP, komment, PDF-riport, worker, Object Storage és Drive-archiválás továbbra is tiltott.
- Forrásbackupok: `backups/drop_v020_database_package_engine_20260731_222729`, `backups/drop_v020_offline_engine_20260801_070856`.
- Részletes dokumentáció: `71_dimpro_drop_architektura.md`–`76_dimpro_drop_v020_supabase_aktiválás.md`.
## 2026-07-31 – DIMPRO Felmérő v0.8.4.4.6 – Tervverzió-gráf, alkalmazási előzmények és több rollback-pont

- Több egymást követő PDF tervrevízió közös, navigálható verziógráfot kapott.
- A gráf a dokumentum-előzményeket, összehasonlításokat, gráfmélységet, aktuális verziót, elágazást, hiányzó elődöt és ciklushibát mutatja.
- Minden központi modellátvezetés külön időrendi alkalmazási rekordot, sorszámot és szülőalkalmazás-kapcsolatot kap.
- Korábbi alkalmazási rekord is kiválasztható és visszaállítható.
- A történeti rollback a kiválasztott állapot utáni teljes alkalmazási láncot `superseded` állapotba helyezi.
- A teljes központi modellpillanatképek deduplikált snapshot-tárba kerülnek; az alkalmazási rekord csak snapshot-azonosítót tárol.
- Legfeljebb nyolc aktív rollback-pont marad meg, a régebbi alkalmazások auditként továbbra is láthatók.
- A felület megmutatja az alkalmazások, rollback-pontok és snapshotok számát, a tárolt méretet és a becsült deduplikációs megtakarítást.
- A v0.8.4.4.5 beágyazott rollback-pillanatképei automatikusan az új snapshot-tárba migrálódnak.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`; a tervdokumentációs séma változatlanul `plan-document.v1`.
- Teljes domain- és integrációs regresszió: 556/556; új domain teszt: 12/12; Leica: 6/6.
- Candidate verziógráf E2E: 9/9; korábbi modellátvezetési E2E: 16/16; PDF-tervlap E2E: 29/29; energetikai E2E: 40/40 és 42/42; responsive: 15/15; PDF/DXF, tablet és assetaudit 15/15 sikeres.
- Candidate build: `ZIFcF-QeZPT7QizSq8dZD`.
- Éles build: `ZIFcF-QeZPT7QizSq8dZD`; HTTPS 200; PM2 online; verziógráf E2E 9/9; korábbi modellátvezetési E2E 16/16; PDF-tervlap E2E 29/29; energetikai E2E 40/40 és 42/42; responsive 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08446_20260731_155354`.
- Forrásbackup: `backups/property_survey_v08446_version_graph_20260731_150719`.
- Részletes dokumentáció: `71_dimpro_felmero_v08446_version_graph_history.md`.

## 2026-07-31 – DIMPRO Drop DROP 0.1.0 – Domain, adatmodell és inaktív UI shell

- Elkészült a `drop.dimpro.hu` külön host-routingja és nyilvános DIMPRO Drop felületi shellje.
- Elkészült a kezdőlap, a csomagkód/PIN oldal, valamint a feltöltési, megtekintési, letöltési és riportútvonalak biztonságosan inaktív helye.
- Elkészült a KépDrop, FájlDrop, kész ZIP és vegyes csomag látható, de nem aktiválható kártyarendszere.
- Központi release gate és funkciónkénti feature flag védi az ügyféladatot kezelő funkciókat; alapállapotban minden feltöltési és együttműködési funkció tiltott.
- Elkészült a titkokat nem felfedő `/api/drop/health` és `/api/drop/features` végpont.
- A Drop host külön CSP-, frame-, referrer-, permissions- és cache-védelmet kapott; belső admin- és Drive-útvonalak nem érhetők el róla.
- Elkészült a 12 táblás PostgreSQL/Supabase migrációs terv RLS-alapbeállítással és anonim adatbázis-policy nélkül.
- A meglévő DIMPRO Drive admin előnézet Drive/Drop modulváltót kapott; külön belső Drop kezelő shell készült.
- A `drop.dimpro.hu` DNS a VPS-re mutatott, de a fejlesztési kör kezdetén még nem volt külön Nginx host és megfelelő TLS-tanúsítvány.
- A Hetzner S3 környezeti változók a webfolyamatban még nem voltak beállítva, ezért valós feltöltés szándékosan nem aktiválható.
- Forrásbackup: `backups/drop_v010_shell_20260731_124029`.
- Külön Nginx virtual host és Let’s Encrypt TLS készült; HTTP → HTTPS átirányítás aktív.
- Végleges éles build: `WuudFiTzXIwm5-MmIFmYp`; candidate és éles Drop smoke 10/10; desktop és mobil responsive teszt 2/2 sikeres.
- TypeScript és célzott Drop ESLint hibamentes; a teljes repository-lint a 2 GiB-os Node heaplimiten kifutott.
- Az SQL-migráció és az S3-kapcsolat még nincs aktiválva, ezért valós feltöltés nem lehetséges.
- Részletes dokumentáció: `71_dimpro_drop_architektura.md`, `72_dimpro_drop_adatmodell.md`, `73_dimpro_drop_biztonsag_adatkezeles.md`, `74_dimpro_drop_fejlesztesi_allapot.md`.

## 2026-07-31 – DIMPRO Felmérő v0.8.4.4.5 – Tervverzió-változások átvezetése a központi energetikai modellbe

- Az alkalmazott tervverzió-döntések részleges helyiség-, fal-, nyílászáró- és hőhídmigrációt kapnak.
- Párosított helyiségnél, falnál és nyílászárónál megmarad a központi azonosító.
- Elfogadott új elem létrejön, elfogadott törlés külön megerősítéssel eltávolítható, elutasított változásnál a régi központi elem marad meg.
- Függőségvédelem készült: fal csak átvezetett helyiséghez, nyílászáró csak átvezetett falhoz migrálható.
- A kézzel módosított és zárolt központi elem blokkolja a csendes átvezetést.
- Az alkalmazás idempotens, duplikációmentes, és ugyanazon összehasonlítás ismételt futása megőrzi az eredeti rollback-pontot.
- A nyílászáró-részletek, hőhidak és tervlap-szintű transfer registry együtt migrálódnak.
- Teljes rollback-pillanatkép készül a helyiségekről, falakról, nyílászárókról, zónákról, energetikai nyílászárókról, hőhidakról és átadási registryről.
- Új előnézeti, törlési megerősítési, alkalmazási, audit- és rollbackfelület készült.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`; a tervdokumentációs séma változatlanul `plan-document.v1`.
- Domain- és integrációs teszt: 544/544; új domain teszt: 13/13; Leica regresszió: 6/6.
- Candidate modellátvezetési E2E: 16/16; korábbi teljes PDF tervlap E2E: 29/29; energetikai E2E: 40/40 és 42/42; responsive: 15/15; PDF/DXF, tablet és assetaudit 15/15 sikeres.
- Candidate build: `4Jd7MtGX5AqFxW9Ewzp5t`.
- Éles build: `4Jd7MtGX5AqFxW9Ewzp5t`; HTTPS 200; PM2 online; modellátvezetési E2E 16/16; korábbi teljes PDF tervlap E2E 29/29; történeti energetikai E2E 40/40 és 42/42; responsive 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08445_20260731_112403`.
- Forrásbackup: `backups/property_survey_v08445_model_migration_20260731_104200`.
- Részletes dokumentáció: `70_dimpro_felmero_v08445_version_model_application.md`.

## 2026-07-31 – DIMPRO Felmérő v0.8.4.4.4 – Tervverzió-párosítás és részleges változásátvétel

- Dokumentumszintű revíziókód, kiadási dátum, verziócsoport, előzménykapcsolat és aktuális verziójelölés készült.
- Azonos szintű, tervtípusú, megnevezésű és oldalszámú tervlapok automatikusan párosíthatók; a párosítás kézzel felülírható.
- A csak az új verzióban szereplő oldal teljes `added`, a csak a korábbi verzióban szereplő oldal teljes `removed` oldal-diffet kap.
- Helyiség-, fal- és nyílászáró-elempárosítás készült stabil azonosítókkal és döntésmegőrzéssel.
- Elkülönülnek a változatlan, módosított, új és törölt elemek.
- A falpárosítás a párosított helyiségkapcsolatot, a nyílászáró-párosítás a párosított falszakaszt kötelezően figyelembe veszi.
- A jóváhagyási státusz nem számít műszaki tervváltozásnak; külön döntési workflow kezeli.
- Elkészült a piros/narancs baseline és kék/zöld céloldali vizuális overlay.
- Táblázatos diff, elemenkénti és oldalpáronkénti elfogadás/elutasítás, szűrés és alkalmazás készült.
- Függőben maradó változásnál `review`, teljes döntés után `applied` állapot és alkalmazási időpont készül.
- Dokumentumtörléskor a kapcsolódó összehasonlítások is biztonságosan törlődnek.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`; a tervdokumentációs séma változatlanul `plan-document.v1`.
- Domain- és integrációs teszt: 531/531; új domain teszt: 14/14; Leica regresszió: 6/6.
- Candidate tervverzió E2E: 12/12; korábbi teljes PDF tervlap E2E: 29/29; energetikai E2E: 40/40 és 42/42; responsive: 15/15; PDF/DXF, tablet és assetaudit 15/15 sikeres.
- Candidate build: `Ipc_3ccvsvLqiFnHWTzip`.
- Éles build: `Ipc_3ccvsvLqiFnHWTzip`; HTTPS 200; PM2 online; tervverzió E2E 12/12; korábbi teljes PDF tervlap E2E 29/29; történeti energetikai E2E 40/40 és 42/42; responsive 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08444_20260731_100817`.
- Forrásbackup: `backups/property_survey_v08444_plan_version_diff_20260731_091930`.
- Részletes dokumentáció: `69_dimpro_felmero_v08444_plan_version_diff.md`.

## 2026-07-31 – DIMPRO Felmérő v0.8.4.4.3 – Több tervlapos átadási nyilvántartás és konfliktusvédelem

- Minden feltöltött dokumentum minden tervlapja külön átadási rekordot és állapotot kap.
- Determinisztikus tartalmi lenyomat készül a jóváhagyott tervfalakról, nyílászárókról és a kapcsolt központi energetikai modellről.
- Elkülönül a tervoldali változás, a központi modellváltozás, a kétoldali konfliktus, a forrás- vagy modellhiány és az eltávolított állapot.
- A tervből átadott központi fal vagy nyílászáró kézi szerkesztése `planTransferLocked` védelmet aktivál.
- A normál frissítés nem írhatja felül csendben a kézzel módosított központi modellt.
- A központi módosítás külön művelettel megtartható új összehasonlítási alapként.
- A tervvel történő felülírás csak külön jelölőnégyzetes megerősítéssel hajtható végre.
- Elkészült a több tervlapos állapotlista, az összesített konfliktus- és változásszámláló, valamint az aktív oldal auditnaplója.
- Az átadott falak, nyílászárók és hőhidak csak előnézet és megerősítés után távolíthatók el; védett központi elemeknél második megerősítés szükséges.
- Sikeres eltávolítás után az érintett helyiségek automatikus falmodellje helyreáll.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`; a `plan-document.v1` workspace sémaváltás nélkül kapja az új nyilvántartást.
- Domain- és integrációs teszt: 517/517; új átadási nyilvántartás teszt: 12/12; Leica regresszió: 6/6.
- Candidate PDF tervlap, konfliktus és eltávolítás E2E: 29/29; energetikai E2E: 40/40 és 42/42; responsive: 15/15; PDF/DXF, tablet és assetaudit 15/15 sikeres.
- Candidate build: `wM-Bo1myB7l9fURIOGRmF`.
- Éles build: `wM-Bo1myB7l9fURIOGRmF`; HTTPS 200; PM2 online; PDF tervlap, konfliktus és eltávolítás E2E 29/29; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08443_20260731_082215`.
- Forrásbackup: `backups/property_survey_v08443_transfer_registry_20260731_073102`.
- Részletes dokumentáció: `68_dimpro_felmero_v08443_transfer_registry_conflicts.md`.

## 2026-07-31 – DIMPRO Felmérő v0.8.4.4.2 – PDF falak és nyílászárók átadása az energetikai modellbe

- Elkészült a jóváhagyott PDF falszakaszok és nyílászárók ellenőrzött átadási előnézete.
- A hiányzó helyiség-, határolás-, rétegrend-, zóna-, geometria-, Uw-, adatforrás-, g- és Ψ-adat blokkolhatja az átadást.
- Az átadási motor tervlap- és javaslatazonosító alapján idempotens: ismételt futtatáskor frissít, nem duplikál.
- A tervlapról mért falhossz, falmagasság, tájolás és normalizált végpontok megmaradnak a központi falmodellben.
- Az energetikai geometria-, zóna-, falterület- és validációs motor a tervlapról átadott mért falszakaszadatokat használja.
- Az érintett helyiség automatikus külső határoló falai kiváltódnak a jóváhagyott PDF-falakkal, így nincs kettős területszámítás.
- Elkészültek az első, nem gyártóspecifikus nyílászáró-katalógussablonok PVC, fa, alumínium, homlokzati ajtó és garázskapu típusokra.
- A katalógussablonok figyelmeztetnek a gyártói teljesítménynyilatkozat vagy termékadatlap szükségességére.
- Átadható az Uw/U-érték, adatforrás, g-érték, árnyékolás, katalógusprofil és zónakapcsolat.
- A beépítési hőhíd kezelhető teljes kerületi Ψ-értékkel vagy külön káva-, parapet- és szemöldöktétellel.
- A `.dimpro` fő séma változatlanul `dimpro.property-survey.v0.8.4.3`; a régi projektek opcionális alapértékekkel migrálódnak.
- Történeti és új domain-/integrációs teszt: 505/505; új átadási teszt: 7/7; Leica regresszió: 6/6.
- Candidate PDF tervlap E2E: 24/24; energetikai E2E: 40/40 és 42/42; responsive: 15/15; PDF/DXF, tablet és assetaudit 15/15 sikeres.
- Candidate build: `G4LM6WpeVUtqe6wGFHGkF`.
- Éles build: `G4LM6WpeVUtqe6wGFHGkF`; HTTPS 200; PM2 online; PDF tervlap és energetikai átadási E2E 24/24; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08442_20260731_070947`.
- Forrásbackup: `backups/property_survey_v08442_energy_transfer_20260731_055934`.
- Részletes dokumentáció: `67_dimpro_felmero_v08442_plan_energy_transfer.md`.

## 2026-07-31 – DIMPRO Felmérő v0.8.4.4.1.1 – Leica DISTO D2 közvetlen BLE-adapter

- A `DISTO 51575411` eszközhöz közvetlen Web Bluetooth GATT-kapcsolat készült.
- A Leica DISTO mérési szolgáltatás és távolságkarakterisztika megnyitása, valamint az értesítés-feliratkozás működik.
- A beérkező little-endian `Float32` távolságérték méterre alakul.
- A mérés automatikusan a kijelölt Hossz, Keresztméret vagy Belmagasság mezőbe kerül.
- A mérési adatforrás `Leica DISTO Bluetooth` néven naplózódik.
- A kapcsolatmegszakítás és a fő Web Bluetooth hibák részletes felhasználói visszajelzést kapnak.
- TypeScript és célzott ESLint: sikeres; Leica DISTO BLE teszt: 6/6.
- Az aktív build tartalmazza a Leica adaptert; éles build: `E136JN8RSPqVPyDWRThJR`; HTTPS 200.
- Backup: `backups/property_survey_leica_disto_devcenter_20260731_055341`.
- Részletes dokumentáció: `66_dimpro_felmero_leica_disto_d2_ble.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.4.1 – Fal–szerkezet–nyílászáró–zóna kapcsolatok

- A külső falszakaszok fal kategóriájú energetikai rétegrendhez kapcsolhatók.
- A fal belső és másik oldali fűtött zónához vagy fűtetlen térhez rendelhető.
- Elkészült a falak közelében lévő kis PDF-vektorkontúrokból dolgozó automatikus nyílászáró-javaslat.
- A közeli felirat és a becsült szélesség alapján ablak, ajtó, erkélyajtó vagy garázskapu javasolható.
- A kijelölt falszakaszhoz kézi nyílászáró adható; adatforrása `manualDrawing` marad.
- Szerkeszthető a nyílászáró típusa, fala, mérete, parapetje, fal menti helye, zónája, kerete, üvegezése és U-értéke.
- A nyílászárók külön kapcsolható rajzi overlay-rétegen jelennek meg.
- Automatikusan számítódik a bruttó fal-, nyílászáró- és nettó falfelület.
- A falfelület újraszámolódik fal- vagy nyílászáró-geometria, méret, állapot és kapcsolat módosításakor.
- Falgeometria javításakor a kapcsolt nyílászárók fal menti aránya megmarad.
- Fal törlésekor a kapcsolt nyílászárók is törlődnek; fal újrafelismerésekor a kézi és jóváhagyott elemek biztonságosan megőrizhetők.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`; a régi projektek automatikusan migrálódnak.
- Domain- és integrációs teszt: 498/498; új fal–nyílászáró domain teszt: 6/6.
- PDF tervlap E2E: 22/22; történeti energetikai E2E: 40/40 és 42/42; responsive regresszió: 15/15.
- Tablet álló/fekvő, alap PDF/DXF és candidate assetaudit 15/15 sikeres; konzol- és oldalhiba: 0.
- Candidate build: `E136JN8RSPqVPyDWRThJR`.
- Éles build: `E136JN8RSPqVPyDWRThJR`; HTTPS 200; PM2 online; PDF tervlap E2E 22/22; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08441_20260730_214143`.
- Forrásbackup: `backups/property_survey_v08441_wall_opening_zone_20260730_205637`.
- Részletes dokumentáció: `65_dimpro_felmero_v08441_wall_opening_zone.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.4 – Geometriajavítás és külső határolás MVP

- A helyiségpoligonok pontjai egyenként mozgathatók, új töréspont szúrható be és kijelölt pont törölhető.
- A terület minden geometriajavítás után automatikusan újraszámolódik.
- A kijelölt helyiség vágóvonallal két részre bontható; a kiválasztott helyiség azonosítója a teljes művelet alatt stabil marad.
- A közös falszakasszal rendelkező helyiségek összevonhatók.
- Elkészült a helyiségpoligonok külső pereméből dolgozó automatikus külső falszakasz-javaslat.
- A falak hossz-, tájolás-, magasság-, vastagság-, helyiségkapcsolat-, adatforrás- és jóváhagyási adatokat kapnak.
- A határolási típus kézzel besorolható: külső levegő, talaj, fűtetlen tér, szomszédos épület/egység, belső fal vagy ismeretlen.
- A falak végpontjai húzhatók, valamint külön kezdőpont- és végpont-elhelyezési paranccsal pontosan áttehetők.
- Hiányzó falszakasz két kattintással kézzel felvehető; adatforrása `manualDrawing` marad.
- A falszakasz jóváhagyható, kihagyható, visszaállítható vagy törölhető.
- A `SurveyPlanPage` faljavaslati állapottal és `wallSuggestions` gyűjteménnyel bővült.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`; a régi projektek automatikusan migrálódnak.
- Domain- és integrációs teszt: 492/492; geometria- és fal domain teszt: 8/8.
- PDF tervlap E2E: 19/19; történeti energetikai E2E: 40/40 és 42/42; responsive regresszió: 15/15.
- Tablet álló/fekvő, alap PDF/DXF és candidate assetaudit 15/15 sikeres; konzol- és oldalhiba: 0.
- Candidate build: `j3RynkEny2gR-tbBYCdho`.
- Éles build: `j3RynkEny2gR-tbBYCdho`; HTTPS 200; PM2 online; PDF tervlap E2E 19/19; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v0844_20260730_204923`.
- Forrásbackup: `backups/property_survey_v0844_geometry_walls_20260730_195104`.
- Részletes dokumentáció: `64_dimpro_felmero_v0844_geometry_walls.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.3.3 – Kézi helyiség és tervlapi interakció

- Kis helyiségeknél a címke automatikusan callout-vonallal a helyiségen kívül jelenhet meg.
- A helyiségcímke külön húzható; kézi pozíciója a projektben mentődik.
- A nem felismert helyiségek külön kézi poligonfelvételi folyamattal rögzíthetők.
- A kézi poligon Enterrel vagy gombbal lezárható; Backspace visszavon, Escape megszakít.
- A kijelölt helyiség külön mozgatófogantyúval, teljes poligonként húzható.
- A mozgatás közben előnézeti geometria jelenik meg, a mentés a húzás végén történik.
- Egyszeres kattintás csak kijelöl; dupla kattintás nagyít; újabb dupla kattintás visszaállítja az előző nézetet.
- A címkeméret a nézeti nagyítástól függetlenül olvasható marad.
- A `SurveyPlanSuggestion` opcionális `labelPosition` mezővel bővült; a régi projektek automatikusan migrálódnak.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`.
- Domain- és integrációs teszt: 484/484; PDF tervlap E2E: 15/15.
- Történeti energetikai E2E: 40/40 és 42/42; responsive regresszió: 15/15.
- Tablet álló/fekvő, alap PDF/DXF és 15/15 assetaudit sikeres; konzol- és oldalhiba: 0.
- Candidate build: `GMumGBwPigeq4v7IGbVbh`.
- Éles build: `GMumGBwPigeq4v7IGbVbh`; HTTPS 200; PDF tervlap E2E 15/15; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08433_20260730_175540`.
- Forrásbackup: `backups/property_survey_v08433_manual_room_label_interaction_20260730_140038`.
- Részletes dokumentáció: `63_dimpro_felmero_v08433_manual_room_label_interaction.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.3.2 – Valós PDF helyiségfelismerés javítása

- Javítva a valós CAD/PDF tervlapokon előforduló `13,06 m²`, `13,06m²` és `13.06 m2` területfeliratok felismerése.
- A PDF.js által külön szövegelemként visszaadott `m` és felső indexű `2` automatikusan összefűzhető.
- Elkészült az egymás melletti, egy sorba tartozó PDF-szövegelemek zajtűrő csoportosítása.
- A helyiségnév és terület ugyanazon szövegelemben, illetve külön sorokban is párosítható.
- Unicode NFKC normalizálás és betűközökkel szétszedett helyiségnevek összefűzése készült.
- Bővült a magyar helyiségnevek és gyakori rövidítések felismerése.
- Erős helyiségnév esetén zárt kontúr hiányában is készül kötelezően ellenőrzendő közelítő javaslat.
- Az azonos nevű, közeli duplikált javaslatok kiszűrődnek.
- A tervpecsét-, anyag-, burkolat-, méret- és rétegrendfeliratok szűrése megmaradt.
- A korábbi nézeti nagyítás, helyiségfókusz és feliratritkítás változatlanul működik.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`.
- A standalone build fájlkövetése kizárja a futáshoz nem szükséges backup- és fejlesztési mappákat.
- Domain- és integrációs teszt: 484/484; PDF tervlap E2E: 14/14.
- Történeti energetikai E2E: 40/40 és 42/42; responsive regresszió: 15/15.
- Alap Felmérő-, PDF-, DXF- és tablet-regresszió sikeres.
- Candidate assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `R_zehmEnPNOmvXqhq9Icc`.
- Éles build: `R_zehmEnPNOmvXqhq9Icc`; HTTP 200; PDF tervlap E2E 14/14; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08432_20260730_134518`.
- Forrásbackup: `backups/property_survey_v08432_real_plan_recognition_20260730_125027`.
- Részletes dokumentáció: `62_dimpro_felmero_v08432_real_pdf_recognition.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.3.1 – PDF tervlap nagyítás és jóváhagyási UX javítás

- Elkészült az 50–400%-os külön nézeti nagyítás, gombos vezérléssel és Ctrl/Cmd + görgő támogatással.
- A nagyított tervlap saját munkatérben vízszintesen és függőlegesen görgethető.
- A jóváhagyási lista elemére kattintva a rendszer automatikusan a kiválasztott helyiségre nagyít és középre igazít.
- A rajzi helyiségkontúrok közvetlenül is kijelölhetők.
- Alapállapotban csak a kijelölt helyiség felirata látszik; a `Minden felirat` kapcsolóval az összes megjeleníthető.
- A kijelölt helyiség neve és területe külön rajzi jelvényen jelenik meg.
- Elkészült a Mind / Ellenőrzendő / Jóváhagyott / Kihagyott listasűrés.
- A tervpecsét-, méret-, anyag-, rétegrend- és egyéb műszaki feliratok szigorúbb felismerési szűrést kaptak.
- A kivágott tervrész határán kívüli szövegeket a helyiségfelismerés nem használja.
- Az ismeretlen, terület nélküli szövegek már nem hoznak létre automatikusan helyiségjavaslatot.
- A `.dimpro` séma változatlanul `dimpro.property-survey.v0.8.4.3`.
- Domain- és integrációs teszt: 484/484; PDF tervlap E2E: 14/14.
- Történeti energetikai E2E: 40/40 és 42/42; responsive regresszió: 15/15.
- Alap Felmérő-, PDF-, DXF- és tablet-regresszió sikeres.
- Candidate assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `k9IjeJjsQgeR1okyGFUog`.
- Éles build: `k9IjeJjsQgeR1okyGFUog`; HTTP 200; PDF tervlap E2E 14/14; történeti energetikai E2E 40/40 és 42/42; responsive E2E 15/15; tablet álló/fekvő és 15/15 assetaudit sikeres; rollback: `.next_before_property_survey_v08431_20260730_123350`.
- Forrásbackup: `backups/property_survey_v08431_zoom_review_20260730_120415`.
- Részletes dokumentáció: `61_dimpro_felmero_v08431_plan_zoom_review.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.3 – PDF tervlap alapú felmérés MVP

- Elkészült a Helyszíni, Tervdokumentáció alapú és Megvalósulási dokumentáció alapú projektmód.
- A PDF munkatér a meglévő közös PDF-/DocumentViewer motort használja; nem készült második PDF-megjelenítő.
- Többoldalas PDF, oldalválasztó, tervtípus, tervverzió, szintkapcsolat és több dokumentum kezelhető.
- Elkészült a tervrész kivágása, 90°/180°/270° forgatás, finom szögkorrekció, átlátszóság, elhelyezés, méretezés és háttérzár.
- Elkészült az oldalankénti és tervrészletenkénti kétpontos léptékkalibráció második ellenőrző mérettel, mért eltéréssel és százalékos hibával.
- A PDF fölött kézi helyiségpoligon rajzolható, majd jóváhagyással szerkeszthető DIMPRO helyiséggeometriává alakítható.
- A vektoros PDF-motor útvonalakat, vonalszakaszokat, görbéket, zárt és összefűzött kontúrokat, nyitott útvonalakat és párhuzamos falvonalpárokat elemez.
- A helyiségfelirat és alapterület-felirat zárt vektorkontúrhoz párosítható; kalibrált tervnél geometriai és feliratozott területeltérés készül.
- Az automatikus felismerés csak külön `ALAPRAJZ FELISMERÉSE` parancsra indul, és először jóváhagyandó overlay-javaslatot készít.
- Minden javaslat adatforrást, biztonsági pontszámot, kontúr-, módosítási és jóváhagyási állapotot kap.
- Elkészült a zöld/sárga/piros/kék/szürke ellenőrzési színlogika, név-, funkció-, belmagasság- és fűtöttségjavítás, elfogadás és figyelmen kívül hagyás.
- A meglévő Rajz / Adatok / Osztott központi munkatér használható; álló tableten egy munkatér, fekvő tableten osztott mód is elérhető.
- A PDF eredeti tartalma változatlan; minden DIMPRO adat normalizált overlay-rétegen tárolódik.
- A `.dimpro` munkafájl séma `dimpro.property-survey.v0.8.4.3`.
- A központi WinWatt-mezőtérkép és a v0.8.5 valós próbaág nem módosult.
- Történeti domain- és integrációs teszt: 475/475; új tervdokumentációs teszt: 9/9; összesen 484/484.
- PDF tervlap E2E: 13/13, tíz referencia-PDF-fel, köztük kilenc vektoros, egy raszteres és egy háromoldalas dokumentum.
- Történeti energetikai E2E: 40/40 és 42/42; responsive regresszió: 15/15; alap Felmérő-, PDF-, DXF- és tablet-regresszió sikeres.
- Candidate és éles screenshot-regresszió: 1920×1080, 1366×768, 1194×834 és 834×1194.
- Candidate és éles assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `KeR6behksZLIq-0meUh08`.
- Éles build: `KeR6behksZLIq-0meUh08`; HTTP 200; rollback: `.next_before_property_survey_v0843_20260730_114528`.
- Forrásbackupok: `backups/property_survey_v0843_pdf_plan_mvp_20260730_101737` és `backups/property_survey_v0843_vector_geometry_20260730_111700`.
- Részletes dokumentáció: `60_dimpro_felmero_v0843_pdf_plan_mvp.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.2 – Vezetett WinWatt-próbaasszisztens

- A WinWatt próbanapló vezetett próbafolyamatot kapott.
- A munkamenet projektben megőrzi az aktuális `activeFieldMapId` próbamezőt.
- A mezőeredmény új időadatai: `entryStartedAt` és `entryCompletedAt`.
- Elkészült a mezőpróba indítás, szüneteltetés, folytatás és idő-újraindítás.
- A rögzített és a futó mezőidő összeadódik.
- A DIMPRO forrásérték egy gombbal vágólapra másolható.
- Másoláskor a beviteli mód `copyPaste`, és szükség esetén elindul a mezőidőmérés.
- Hat gyors státuszgomb készült: egyezik, cél pontosítva, egység pontosítva, csak kézi, kihagyott, blokkolt.
- Az automatikus továbblépés a következő alkalmazandó, még nem próbált mezőt nyitja meg.
- A blokkolt mezők külön listából visszanyithatók és javíthatók.
- A kézi mezőválasztást a rendszer nem írja felül.
- Oldalfrissítés és munkamenetváltás után a próba folytatható.
- Az Excel `18_Probanaplo` lap és a ZIP CSV külön indítási és befejezési időbélyeget tartalmaz.
- A `.dimpro` munkafájl séma `dimpro.property-survey.v0.8.4.2`.
- A központi mezőtérkép, WinWatt JSON, Excel, ZIP és feedback sémája változatlan maradt.
- Domain- és integrációs teszt: 475/475.
- Vezetett WinWatt-próba és teljes v0.8.4 E2E: 40/40.
- Központi munkatér és stopper vizuális regresszió: 15/15.
- Történeti energetikai E2E: 42/42.
- Alap Felmérő-, PDF-, DXF-, WinWatt-, rajzlap- és tablet-regresszió sikeres.
- PDF: 11 oldal; Excel: 20 munkalap; ZIP: 10 fájl.
- Candidate assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `fKApbzYl5rTyx2QryGRJp`.
- Éles build: `fKApbzYl5rTyx2QryGRJp`; HTTP 200, vezetett WinWatt E2E 40/40, központi munkatér E2E 15/15, történeti energetikai E2E 42/42, 475/475 domain/integrációs teszt, teljes export-, rajzlap-, tablet- és 15/15 assetaudit sikeres; rollback: `.next_before_energy_v0842_20260730_094724`.
- Részletes dokumentáció: `59_dimpro_felmero_v0842_guided_winwatt_trial.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4.1 – Responsive szakértői munkatér és munkaidőmérő

- A teljes szakértői energetikai szerkesztő kikerült a keskeny jobb oldali panelből.
- A jobb oldali energetikai panel navigációs és összesítő board lett.
- Elkészült a központi `Rajz`, `Adatok` és `Osztott` nézet.
- A geometria, zónák, nyílászárók, zónaterhelés, U-érték, szakértői táblák, WinWatt átadás, állapot és nyomvonal teljes szélességű központi munkalapot kapott.
- Elkészült az öt energetikai gyorskártya hover- és koppintásos megnyitással.
- Energetikai munkalapon a normál asztali elrendezés 190 px bal navigációt és 280 px jobb boardot használ.
- A 1366 px széles laptop központi adatlapja 678 px-ről 808 px-re nőtt.
- Igazolt központi szélességek: 1242 px asztali, 808 px laptop, 936 px fekvő tablet, 802 px álló tablet, 358 px mobil.
- Teljes képernyős osztott nézetben a rajzpanel 966,6 px, az adatpanel 823,4 px széles.
- Tableten a részletes adatok önálló, teljes szélességű munkalapon jelennek meg.
- Mobilon a WinWatt-táblázat saját panelen belül görgethető, teljes oldali overflow nélkül.
- Elkészült a felméréshez kapcsolt `workTimerWorkspace` adatmodell.
- A stopper kézzel indítható, szüneteltethető, folytatható és lezárható.
- A stopper munkalapváltáskor külön időszakaszt hoz létre.
- Menthető az operátor, eszköz, megjegyzés és kézi perckorrekció.
- Oldalfrissítés után az aktív vagy szüneteltetett munkamenet folytatható.
- A `.dimpro` munkafájl séma `dimpro.property-survey.v0.8.4.1`.
- A WinWatt-, Excel-, ZIP- és számítási sémák változatlanok maradtak.
- Régi projekt automatikusan üres, `idle` állapotú munkaidőmérőt kap.
- Stopper domain teszt: 43/43.
- Teljes domain- és integrációs teszt: 458/458.
- Vizuális és stopper E2E: 15/15.
- v0.8.4 teljes felhasználói regresszió: 35/35.
- Történeti energetikai, alap Felmérő-, PDF-, DXF-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `-SsugSS1etgbA6J_2f5hu`.
- Éles build: `-SsugSS1etgbA6J_2f5hu`; HTTP 200, vizuális/stopper E2E 15/15, v0.8.4 regresszió 35/35, történeti energetikai E2E 42/42, 458/458 domain/integrációs teszt, teljes export-, rajzlap-, tablet- és 15/15 assetaudit sikeres; rollback: `.next_before_energy_v0841_20260730_082322`.
- Részletes dokumentáció: `58_dimpro_felmero_v0841_responsive_workspace_timer.md`.

## 2026-07-30 – DIMPRO Felmérő v0.8.4 – WinWatt próbaátadás és visszamérési jegyzőkönyv

- Elkészült a projektbe mentődő `energyWinWattTrialWorkspace` munkatér.
- Régi v0.8.3 projektnél automatikusan üres, érvényes próbanapló jön létre.
- Elkészült a `dimpro.winwatt-trial-feedback.v0.8.4` próbaösszesítő motor.
- Munkamenetenként rögzíthető a WinWatt-verzió, operátor, munkaállomás és általános megjegyzés.
- Mezőnként rögzíthető a pontos WinWatt célablak, célfül, célfelirat és egység.
- Elkészült a kézi begépelés, másolás, Excel-bevitel, natív import és nem alkalmazandó beviteli mód.
- Elkészült a még nem próbált, egyező, pontosított, csak kézi, kihagyott és blokkolt mezőstátusz.
- A munkamenet létrehozáskori mezőpillanatképet használ, ezért a későbbi projektmódosítás nem írja át a próba nevezőjét.
- Félkész vagy blokkolt munkamenet nem jelölhető lezártnak.
- Elkészült a mezőnkénti beviteli sorrend és időmérés magyar tizedesvessző támogatással.
- Elkészült a DIMPRO–WinWatt eredményeltérés abszolút és relatív tűrésvizsgálata.
- Automatikus DIMPRO-referencia készül a kondicionált területhez, térfogathoz és a validált terhelési mutatókhoz.
- Az éves energia-, primerenergia- és CO₂-mutatók DIMPRO-oldali értéke a havi motor validálásáig üres marad.
- A WinWatt átadás lap külön Átadási készültség és Próbanapló nézetre tagolódik.
- Az Excel séma `dimpro.winwatt-transfer.v0.8.4`, a munkafüzet 20 lapos.
- Új Excel-lapok: `18_Probanaplo` és `19_Eredmeny_elteres`.
- A WinWatt-előkészítő JSON séma `dimpro.winwatt-compatible.v0.8.4`.
- A DIMPRO munkafájl séma `dimpro.property-survey.v0.8.4`.
- A ZIP séma `dimpro.winwatt-trial-package.v0.8.4`, a csomag 10 fájlt tartalmaz.
- Új ZIP-kimenetek: próba-visszacsatolási JSON, próbanapló CSV és eredményeltérés CSV.
- Domain- és integrációs tesztek: 415/415.
- v0.8.4 candidate E2E: 35/35; történeti energetikai E2E: 42/42.
- Alap Felmérő-, PDF-, DXF-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `_woQoQbPeuPesDJRHo7kl`.
- Éles build: `_woQoQbPeuPesDJRHo7kl`; HTTP 200, v0.8.4 E2E 35/35, történeti E2E 42/42, 415/415 domain/integrációs teszt, teljes export-, rajzlap-, tablet- és 15/15 assetaudit sikeres; rollback: `.next_before_energy_v084_20260730_062404`.
- Részletes dokumentáció: `57_dimpro_felmero_v084_winwatt_trial_feedback.md`.

## 2026-07-29 – DIMPRO Felmérő v0.8.3 – WinWatt mezőtérkép és próbaátadási csomag

- Elkészült a `dimpro.winwatt-field-map.v0.8.3` mezőszintű átadási szerződés.
- A 15 szakértői adatcsoport minden oszlopa forrásútvonalat, célcsoportot, DIMPRO célkulcsot és célfeliratot kapott.
- Elkészült a kötelező, feltételes és opcionális mezők kezelése.
- Elkészült a közvetlen, kézi, referencia- és későbbi natív átadási mód.
- Elkészült a referenciaillesztett, DIMPRO-kiegészítő és valós próbát igénylő célmező-státusz.
- Elkészült az átadásra kész, ellenőrzendő, blokkolt és nem alkalmazandó készültség.
- Üres opcionális adatcsoport nem blokkolja a próbaátadást.
- A hibás numerikus vagy kötelezően hiányzó adat blokkoló ellenőrzést kap.
- A Szakértői Energetika munkatér külön WinWatt átadás lapot kapott.
- A mezőtérkép státusz, adatcsoport és szabad szöveg szerint szűrhető.
- Az energetikai fülsáv konténerszélességhez igazodó auto-fit elrendezést kapott.
- Elkészült a `dimpro.winwatt-transfer.v0.8.3` 18 lapos Excel munkafüzet.
- Új lapok: `16_Mezoterkep` és `17_Atadas_ellenorzes`.
- A WinWatt-előkészítő JSON séma `dimpro.winwatt-compatible.v0.8.3`.
- A DIMPRO munkafájl séma `dimpro.property-survey.v0.8.3`.
- A `.dimpro` és JSON tartalmazza a teljes WinWatt mezőtérképet.
- Elkészült a `dimpro.winwatt-trial-package.v0.8.3` ZIP-csomag.
- A ZIP hét fájlt tartalmaz: README, manifest, Excel, JSON és három CSV ellenőrző kimenet.
- Blokkolt projektnél diagnosztikai ZIP, hibamentes projektnél próbaátadási ZIP készül.
- A `WW.*` kulcsok DIMPRO átadási kulcsok, nem WinWatt belső mezőazonosítók.
- A mintaprojekt 188 mezőt, 576 átadási rekordot, 39 kész, 72 ellenőrzendő és 5 blokkolt mezőt mutatott.
- Domain- és integrációs tesztek: 358/358.
- v0.8.3 E2E: 29/29; történeti energetikai E2E: 42/42.
- Alap Felmérő-, PDF-, DXF-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 15/15; konzol- és oldalhiba: 0.
- Production candidate build: `7qmr-kRdOGrnnEKMeqkJf`.
- Éles build: `7qmr-kRdOGrnnEKMeqkJf`; HTTP 200, v0.8.3 E2E 29/29, történeti E2E 42/42, alap Felmérő-, PDF-, DXF-, rajzlap-, tablet- és 15/15 assetaudit sikeres; rollback: `.next_before_energy_v083_20260729_205928`.
- Részletes dokumentáció: `56_dimpro_felmero_v083_winwatt_field_map.md`.

## 2026-07-29 – DIMPRO Felmérő v0.8.2 – Meglévő és tervezett állapotok számított összehasonlítása

- Elkészült a `dimpro.energy-renovation-comparison.v0.8.2` számítási motor.
- Minden tervezett változat virtuálisan, az M0 módosítása nélkül számolódik.
- Elkészült a szerkezeti cél-U és nyílászáró cél-Uw alapú H-változás.
- Elkészült a zónánkénti tervezett méretezési fűtési teljesítmény.
- Elkészült a fűtési célkapacitás megfelelőségi vizsgálata.
- Elkészült a PV és napkollektor hozam arányosított előzetes összehasonlítása.
- Az akkumulátor és autótöltő kapacitásként jelenik meg, nem hamis energiamegtakarításként.
- Bevezetésre került a számítható, részleges, még nem számítható és javítandó státusz.
- Elkészült a kettős célpont blokkolása.
- A terepi Felújítás munkalap M0–T összehasonlító kártyákat kapott.
- A szakértői mód részletes változattáblát kapott.
- A szakértői adattáblák száma 15.
- A WinWatt-előkészítő Excel 16 lapos, új `13_Valtozat_osszeh` lappal.
- A `.dimpro` séma `dimpro.property-survey.v0.8.2`.
- A WinWatt-előkészítő JSON séma `dimpro.winwatt-compatible.v0.8.2`.
- Az Excel séma `dimpro.winwatt-transfer.v0.8.2`.
- A PDF külön meglévő–tervezett összehasonlító oldalt kapott.
- Domain- és integrációs tesztek: 314/314.
- v0.8.2 candidate E2E: 24/24; történeti energetikai E2E: 42/42.
- Teljes Felmérő-, export-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 13/13; konzol- és oldalhiba: 0.
- Production candidate build: `OgI3v1C0l7Xsy6n2AVTIL`.
- Éles build: `OgI3v1C0l7Xsy6n2AVTIL`; HTTP 200, v0.8.2 E2E 24/24, történeti E2E 42/42, 314/314 domain/integrációs teszt, teljes export-, rajzlap-, tablet- és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v082_20260729_200150`.
- Részletes dokumentáció: `55_dimpro_felmero_v082_scenario_comparison.md`.

## 2026-07-29 – DIMPRO Felmérő v0.8.1 – Helyszíni gyorsfelvétel és egyszerűsített terepi felület

- Elkészült az állandó Terepi útmutató az aktuális és következő hiányos lépéssel.
- Elkészült a projektbe mentődő `Csak a hiányos lépések` szűrő.
- A lépések szűréskor is megtartják eredeti sorszámukat.
- Az eszközkapcsolati kártyák összecsukható részbe kerültek.
- Elkészült a közös `EnergyFieldUi` komponensrendszer.
- A mezők külön `szükséges` és `opcionális` jelölést kapnak.
- A Megújuló munkatér Alapadat, Rendszer és Eredmény csoportokra tagolódik.
- Minden megújuló fül külön kész, hiányos vagy opcionális státuszt mutat.
- A munkalap teteje mindig megmutatja a következő teendőt.
- A tetősík, villamos, napelem, napkollektor, akkumulátor és autótöltő űrlap gyors- és részletes adatcsoportra váltott.
- Elkészült a napelemes `Maximum átvétele` gyorsművelet.
- Elkészült az akkumulátoros `Javaslat átvétele` gyorsművelet.
- Az ellenőrzési üzenetek felhasználói megnevezése: Javítandó, Ellenőrizendő, Tájékoztatás.
- A felújítási intézkedések terepi módban alapból összecsukott rövid kártyák.
- Elkészült a Mind / Beválasztva / Hiányos intézkedésszűrés.
- Elkészült az Első hiányos megnyitása művelet.
- A felújítási gyorsadatok elsőként csak a beavatkozást és a forrást kérik.
- A célértékek, hatásszint, meglévő állapot és kockázatok külön műszaki részbe kerültek.
- Az adatsémák és a számítási motorok változatlanok maradtak.
- v0.8.1 candidate E2E: 23/23.
- Történeti energetikai E2E: 42/42.
- Minden domain- és exportregresszió sikeres.
- Alap Felmérő-, PDF-, DXF-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 13/13; konzol- és oldalhiba: 0.
- Production candidate build: `uLQTREqrLyVG0zjJxTsS4`.
- Éles build: `uLQTREqrLyVG0zjJxTsS4`; HTTP 200, v0.8.1 E2E 23/23, történeti E2E 42/42, alap Felmérő-, PDF-, rajzlap-, tablet- és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v081_20260729_191407`.
- Részletes dokumentáció: `54_dimpro_felmero_v081_field_ux.md`.

## 2026-07-29 – DIMPRO Felmérő v0.8.0 – Terepi energetikai workflow, felújítási változatok és WinWatt-előkészítés

- Elkészült a külön Terepi és Szakértői felületmód ugyanarra az adatmodellre.
- Terepi módban a részletes szakértői Energetika lépés rejtett; a helyszíni lépéssor egyszerűsített.
- Szakértői módban az Energetika munkatér kilenclapos, új Szakértői táblák lappal.
- Elkészült 14 WinWatt-logikájú, kereshető szakértői adattábla.
- A széles táblák mobilon belső vízszintes görgetést használnak, az oldal nem lóg ki.
- Elkészült a `EnergyRenovationWorkspace` több meglévő/tervezett változattal.
- M0 Meglévő állapot és T1 Helyszíni javaslat automatikusan létrejön.
- Elkészült 16 felújítási intézkedéssablon a buroktól a gépészetig és megújulókig.
- Elkészült az automatikus javaslatmotor nem megfelelő rétegrendekhez, nyílászárókhoz, gépészethez és megújuló rendszerekhez.
- A javaslatmotor nem duplikál, és megőrzi a felhasználói beválasztást, megjegyzést és kézi intézkedéseket.
- Elkészült a tetősík helyszíni adatmodell azimuttal, dőléssel, bruttó/hasznos felülettel, árnyékolással és teherbírási státusszal.
- Elkészült a napelem panelmaximum-, kWp-, DC/AC-, éves hozam-, sajátfogyasztás- és többletszámítása.
- Elkészült a napkollektoros HMV-hőigény, hozam, lefedettség és tárolótérfogat előméretezése.
- Elkészült az akkumulátor sajátfogyasztási, tartaléküzemi, használható és névleges kapacitásjavaslata.
- Elkészült az elektromosautó éves/napi töltési energia-, idő-, fázisáram- és hálózati tartalékellenőrzése.
- Elkészült a dinamikus terhelésmenedzsment külön figyelmeztetési logikája.
- Minden előméretezési alapérték látható és forráshoz kötött; nincs rejtett hozam- vagy termékállandó.
- Elkészült a 15 munkalapos `dimpro.winwatt-transfer.v0.8.0` Excel munkafüzet.
- Az Excel kötelezően jelzi, hogy nem natív WinWatt projektfájl.
- A `.dimpro` séma `dimpro.property-survey.v0.8.0`.
- A WinWatt-előkészítő JSON séma `dimpro.winwatt-compatible.v0.8.0`.
- A számított megújuló/villamos eredmény séma `dimpro.energy-renewable-sizing.v0.8.0`.
- A PDF külön Helyszíni felújítási javaslatok és Megújuló és villamos előméretezés fejezetet kapott.
- Régi projekt migrációja: Terepi mód, M0/T1 változat, kikapcsolt megújuló réteg.
- Új domain/integrációs tesztek: 44/44 + 39/39 + 38/38 + 18/18.
- Korábbi motorregressziók: 36/36 + 43/43 + 25/25 + 28/28.
- Összes domain- és integrációs ellenőrzés: 271 sikeres.
- Új v0.8.0 E2E: 20/20; történeti energetikai E2E: 42/42.
- Teljes Felmérő-, PDF-, DXF-, WinWatt-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 13/13; konzol- és oldalhiba: 0.
- Production candidate build: `TgWAG7ypFaOltQdfP_FvC`.
- Éles build: `TgWAG7ypFaOltQdfP_FvC`; HTTP 200, v0.8.0 E2E 20/20, történeti E2E 42/42, alap Felmérő-, tablet- és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v080_20260729_181853`.
- Részletes dokumentáció: `53_dimpro_felmero_v080_field_workflow_winwatt_transfer.md`.

## 2026-07-29 – DIMPRO Felmérő v0.7.5 – Zónánkénti méretezési fűtési terhelés és gépészeti rendszerkapcsolatok

- Elkészült az opcionálisan bekapcsolható `EnergyDemandWorkspace` v1.
- Régi projektekben a terhelési réteg automatikusan `enabled: false`, ezért nem blokkolja a korábbi workflow-t.
- Elkészült a zónánkénti fal-, alsó/felső határ-, nyílászáró-, beépítési perem- és hőhídszámítás.
- Elkészült a fűtetlen és szomszédos terek dokumentált hőmérsékleti tényezője.
- A zónaközi fal hőárama csak a magasabb belső alapértékű zónánál jelenik meg.
- Talajjal érintkező szerkezetnél csak dokumentált, deklarált egyenértékű U-érték fogadható el.
- Hőtechnikai adat nélküli metszeti tetőablak blokkoló ellenőrzést kap.
- Elkészült a légcsereszám vagy légmennyiség alapú szellőzési H, opcionális hővisszanyeréssel.
- Elkészült a zónánkénti `Htr`, `Hve`, `Hösszes`, `ΔT`, kW és W/m² eredmény.
- Elkészült az energetikai rendszerek zóna- és helyszíni berendezéskapcsolata.
- Elkészült a névleges és zónánként kiosztott kapacitás ellenőrzése.
- Kapacitásállapotok: hiányzó, ismeretlen, elégtelen, megfelelő.
- A hiányzó rendszer nem hamisítja meg és nem blokkolja a hőveszteségi számítást.
- Az Energetika munkatér nyolclapos lett, új `Zónaterhelés` lappal.
- A `.dimpro` séma `dimpro.property-survey.v0.7.5`; új `calculated.energyDemand` blokk.
- A WinWatt-előkészítő séma `dimpro.winwatt-compatible.v0.7.5`; új terhelési, komponens-, rendszer- és auditblokkok.
- A PDF külön zónaterhelési és gépészeti rendszerkapcsolati oldalt kapott, zónánkénti kapacitáskiosztással.
- Domain tesztek: terhelés 36/36; nyílászáró 43/43; zóna 25/25; U-motor 28/28.
- Candidate E2E: 42/42; két zóna, 2,5124 kW összes méretezési fűtési igény, 36 auditrekord.
- Teljes Felmérő-, PDF-, DXF-, WinWatt-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 13/13; konzol- és oldalhiba: 0.
- Production candidate build: `moaTVTkWWUrA2GmTR-9Nd`.
- Éles build: `moaTVTkWWUrA2GmTR-9Nd`; HTTP 200, éles E2E 42/42, tablet álló/fekvő és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v075_20260729_162732`.
- Az npm-függőségi audit külön csevegésben kezelendő, nem része ennek a fejlesztési körnek.
- Részletes dokumentáció: `52_dimpro_felmero_v075_zone_load_systems.md`.

## 2026-07-29 – DIMPRO Felmérő v0.7.4 – Nyílászárók és hőhidak részletes számítása

- Elkészült a deklarált és részletes teljes nyílászáró Uw-számítás.
- A részletes képlet kezeli az üveg- és keretfelületet, Ug-t, Uf-et, üvegszegélyhosszt és Ψg-t.
- Elkészült a napenergia-átbocsátási tényező tárolása és validációja.
- Elkészült a dokumentált beépítési perem `kerület × Ψ` számítása.
- Elkészült a lineáris `l × Ψ` és pontszerű `n × χ` hőhídmotor.
- A motor blokkolja a beépítési perem és külön káva/parapet/szemöldök hőhíd kettős elszámolását.
- A hivatalos nyílászáró-követelmények külön szabályadatfájlba kerültek.
- A régi `uValue` mező deklarált Uw-vé migrálódik, magyar tizedesvessző támogatással.
- Az Energetika munkatér hétlapos lett: Beállítások, Geometria, Zónák, Nyílászárók, U-érték, Állapot, Nyomvonal.
- A normál terepi Nyílászárók munkalap ugyanazt az Uw-, követelmény-, beépítési H- és megfelelőségi eredményt mutatja.
- A `.dimpro` séma `dimpro.property-survey.v0.7.4`, a `calculated.energyOpenings` blokk teljes eredményt és auditnyomvonalat tárol.
- A WinWatt-előkészítő séma `dimpro.winwatt-compatible.v0.7.4`, részletes nyílászáró-, hőhíd- és összesítő blokkokkal.
- A vektoros PDF külön nyílászáró-hőtechnikai és lineáris/pontszerű hőhídoldalt kapott.
- Nyílászáró/hőhíd domain teszt: 43/43; zónaregresszió: 25/25; U-motor regresszió: 28/28; candidate E2E: 33/33.
- Teljes Felmérő-, PDF-, DXF-, WinWatt-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 13/13; konzol- és oldalhiba: 0.
- Production candidate build: `422-sZjRR2dKS3mMJyqIz`.
- Éles build: `422-sZjRR2dKS3mMJyqIz`; HTTP 200, éles E2E 33/33, tablet álló/fekvő és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v074_20260729_141548`.
- Részletes dokumentáció: `51_dimpro_felmero_v074_openings_thermal_bridges.md`.

## 2026-07-29 – DIMPRO Felmérő v0.7.3 – Energetikai zónák és fűtetlen terek

- Elkészült a helyiségalapú egy- és többzónás energetikai domainmodell.
- Régi v0.6–v0.7.2 projektekhez automatikus egyzónás alapbeosztás készül.
- Már zónásított projekt új helyisége nem kerül csendben zónába; hiányzó hozzárendelésként jelenik meg.
- Elkészült a használati profil és kondicionálási szolgáltatási szint kezelése.
- Elkészült a kapcsolódó fűtetlen terek típusa, szellőzése és hőmérsékletforrása.
- A motor zónánként számítja az alapterületet, térfogatot, külső, talaj-, szomszédos, fűtetlen és zónaközi határokat.
- Elkészült a zónaközi és zóna–fűtetlen tér falszakaszok felismerése, nyíláslevonása és deduplikálása.
- Elkészült a zónánkénti determinisztikus auditnyomvonal.
- Az Energetika munkatér hatlapos lett: Beállítások, Geometria, Zónák, U-érték, Állapot, Nyomvonal.
- A `.dimpro` séma `dimpro.property-survey.v0.7.3`; a teljes zónaeredmény a `calculated.energyZones` blokkban mentődik.
- A WinWatt-előkészítő séma `dimpro.winwatt-compatible.v0.7.3`, zóna-, fűtetlen tér- és kapcsolatblokkokkal.
- A vektoros PDF külön zónaösszesítő és fűtetlen tér/zónakapcsolat oldalt kapott.
- Domain teszt: 25/25; U-motor regresszió: 28/28; candidate E2E: 26/26.
- Teljes Felmérő-, PDF-, DXF-, WinWatt-, rajzlap- és tablet-regresszió sikeres.
- Candidate assetaudit: 13/13; konzol- és oldalhiba: 0.
- Production candidate build: `6Jj8Kyj9lxKuDDIRcSr4P`.
- Éles build: `6Jj8Kyj9lxKuDDIRcSr4P`; HTTP 200, éles E2E 26/26, tablet álló/fekvő és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v073_20260729_121520`.
- Részletes dokumentáció: `50_dimpro_felmero_v073_energy_zones.md`.

## 2026-07-29 – DIMPRO Felmérő v0.7.2 – Rétegrend- és U-érték motor

- Elkészült a tiszta TypeScript rétegrendi U-motor és a `dimpro.energy-assembly.v0.7.2` eredményséma.
- Beépült az `Ri=d/λ`, `Rtot=Rsi+ΣRi+Rse`, `U0=1/Rtot` és korrigált U-számítás.
- A felületi ellenállások és követelmények külön, verziózott szabályadatfájlba kerültek.
- Elkészült a zárt légréteg táblázat és lineáris interpoláció.
- Elkészült a számított/deklarált U-mód és a számított–deklarált eltérés.
- Elkészült a szerkezeti követelményvizsgálat megfelel/nem felel meg/nem alkalmazandó/talajszámítás szükséges állapotokkal.
- Elkészült a légüreg-, pontszerű mechanikai rögzítő- és fordított tető korrekció.
- Elkészült a 3% alatti korrekció elhagyási opció.
- Inhomogén és szellőztetett szerkezetnél a motor blokkolja az egyszerűsített eredményt.
- Talajjal érintkező szerkezetnél külön egyenértékű számítás szükséges; a rétegrendi U nem minősül automatikusan megfelelőségnek.
- Elkészült az iteratív hőszigetelés-vastagság kereső.
- Az Energetika munkatér öt lapos lett: Beállítások, Geometria, U-érték, Állapot, Nyomvonal.
- A Szerkezetek rétegrendi része külön `PropertySurveyAssembliesEditor` komponensbe került.
- A `.dimpro` séma `dimpro.property-survey.v0.7.2`, a `calculated.energyAssemblies` blokk teljes eredményt és auditnyomvonalat tárol.
- A vektoros PDF külön rétegrendi U-érték összesítő oldalt kapott.
- A korábbi beégetett kategóriaalapú felületi ellenállás-összegek megszűntek; a WinWatt-előkészítő ugyanazt a központi motort használja.
- Domain teszt: 28/28; új candidate E2E: 19/19; candidate assetaudit: 13/13.
- Teljes Felmérő-, PDF-, DXF-, WinWatt-, rajzlap- és tablet-regresszió sikeres.
- Production candidate build: `NCfDCt7I_Kpn5bfh6QkaN`.
- Éles build: `NCfDCt7I_Kpn5bfh6QkaN`; HTTP 200, éles E2E 19/19, tablet álló/fekvő és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v072_20260729_110235`.
- Részletes dokumentáció: `49_dimpro_felmero_v072_assembly_u_value.md`.

## 2026-07-29 – DIMPRO Felmérő v0.7.1 és Anyagtörzs MAT-0.3

- Elkészült a külön, tiszta TypeScript energetikai geometriamotor.
- Számítható a bruttó/nettó falfelület, nyílászáró-felület, alsó/felső határoló felület, kondicionált térfogat, lehűlő felület és A/V arány.
- A fűtött–fűtött szintátfedések automatikusan kikerülnek a lehűlő felületből.
- A padlásfödém és a tetősík eltérő logikát kapott; az egyedi tetőforma figyelmeztetést ad.
- Elkészült a tételes szint-, fal- és tájolási összesítő.
- Elkészült a determinisztikus számítási nyomvonal képlettel, bemenetekkel, kerekítetlen eredménnyel és elemhivatkozásokkal.
- A blokkoló geometriai hibák pontos helyiség-, fal- vagy nyílászáró-nevet mutatnak.
- A `.dimpro` séma `dimpro.property-survey.v0.7.1`; a teljes geometriai eredmény és auditnyomvonal a `calculated.energyGeometry` blokkban mentődik.
- Elkészült a projektkapcsolt `MaterialWorkspaceState`.
- Elkészült a hárompaneles anyagkatalógus kategóriafával, kereséssel, kedvencekkel, legutóbbi és projektanyag-listával.
- Elkészült a saját projektanyag és saját másolat munkafolyamat.
- A rétegrendi MaterialPicker pontos anyag- és verziópillanatképet ment.
- A λ-felülírás indoklás nélkül hiányossá teszi a Szerkezetek lépést.
- Geometriamotor domain teszt: 17/17; projektanyag-domain teszt: 10/10; korábbi anyagdomain teszt: 16/16.
- Production candidate build: `BD5ZcvrDec8Ujku949Qa5`; új összevont E2E 15/15, candidate assetaudit 13/13, teljes Felmérő-, PDF/DXF/WinWatt- és tablet-regresszió sikeres.
- Éles build: `BD5ZcvrDec8Ujku949Qa5`; HTTP 200, éles E2E 15/15, tablet álló/fekvő és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v071_mat03_20260729_084055`.
- Részletes dokumentáció: `47_dimpro_felmero_v071_energy_geometry.md` és `48_dimpro_material_catalog_mat03.md`.

## 2026-07-29 – DIMPRO Felmérő v0.7.0 és Anyagtörzs MAT-0.1/MAT-0.2

- Új `components/energy` domain- és szabálycsomag-architektúra készült.
- Elkészült az `EnergyProjectSettings` modell tíz projektbeállítással, validációval és készültségjelzővel.
- A `HU_EKM_2023_11_01` szabálycsomag `reviewRequired` architektúraváz; számítási állandót vagy energetikai végeredményt nem tartalmaz.
- Az Energetika lépés az energetikai és felújítási munkamódban elérhető, ipari módban rejtett.
- A `.dimpro` munkafájl séma `dimpro.property-survey.v0.7.0`; a korábbi v0.6.x projektek új mező nélkül is automatikusan migrálódnak.
- Elkészült a közös `components/materials` anyag- és termékdomain.
- A forrás- és licencmodell megakadályozza a nem engedélyezett központi publikálást.
- A JSON tesztkatalógus 25 privát, draft, unverified, kizárólag fejlesztési célú rekordot tartalmaz.
- Elkészült az ékezetfüggetlen keresés, kategória- és λ-szűrés, tulajdonság- és forrásvalidáció.
- Elkészült a megváltoztathatatlan `EnergyMaterialSnapshot`; λ-felülírás csak indoklással lehetséges.
- A meglévő rétegrendi réteg visszafelé kompatibilisen anyag- és verzióhivatkozással bővült.
- A domain teszt 16/16 ellenőrzéssel sikeres.
- Production candidate build: `tm7qdRVfJJNOhOs0mViBL`; új UI E2E 16/16, candidate assetaudit 13/13, teljes Felmérő- és tablet-regresszió sikeres.
- Éles build: `tm7qdRVfJJNOhOs0mViBL`; HTTP 200, éles UI E2E 16/16, tablet álló/fekvő és 13/13 assetaudit sikeres; rollback: `.next_before_energy_v070_mat02_20260729_071452`.
- Részletes dokumentáció: `45_dimpro_felmero_v070_energy_settings_architecture.md` és `46_dimpro_energy_material_database_mat02.md`.

# 05 Verziótörténet

## Aktuális fejlesztési kör

### HexPin tervi hibajelölés

Elkészült:

- PDF.js alapú tervnéző
- DIMPROVER HexPin marker
- marker drag / pozicionálás
- szakági színek
- A5/A4/A3 exportkeret
- PDF.js canvasból mentett tervrészlet-kép
- hibajegyhez kötött markeradatok
- PDF export előtti hiányzó részletkép figyelmeztetés
- Export / PDF panel státusz
- tervkapcsolat panel státusz


### Terepi hibafelvételi PDF export pontosítás

Frissítve:

- HJ jelölések PDF listáiban színezett szakág, súlyosság és státusz jelenik meg.
- A HJ jelölések alatt kompakt HexPin jelmagyarázat segíti a PDF-et önállóan olvasó címzetteket.
- A fotómelléklet blokk jelzi a kapcsolódó terepi hibafelvételi tervrészlet melléklet meglétét és oldalszámát.
- A hibalista összesítő státusz oszlopa hosszabb státuszoknál is tördelhetőbb.


### HexPin jelmagyarázat kiegészítés

A terepi hibafelvételi PDF export HexPin jelmagyarázata kiegészült az észrevétel és lezárt állapot jelölésével. A lezárt státusz pipája rajzolt CSS/PDF elemként jelenik meg, hogy ne okozzon betűkódolási hibát.


### Tervrészlet melléklet jelzés áthelyezése

A terepi hibafelvételi PDF exportban a tervrészlet melléklet oldalszámát és HJ darabszámát jelző blokk kikerült a fotómelléklet alól, és önálló PDF információs blokként jelenik meg.


### Több PDF tervlap egy TH hibához és fotóforrás választó

Frissítve:

- egy TH hibához több PDF tervlap kapcsolása és tervlaponkénti HJ HexPin jelölés egyértelmű UI támogatást kapott;
- a kapcsolt tervlapok sorszámozott tervkártyaként jelennek meg;
- a fotó / tervfotó feltöltés modális ablak helyett lenyíló forrásválasztót kapott a PDF tervfeltöltés logikájához igazítva.


### Fotóhely HexPin jelölés

Frissítve:

- a PDF.js tervnézőben külön HJ hibahely / Fotóhely jelölési mód választható;
- a fotóhely marker a kiválasztott fotó (`F-001`, `F-002`, stb.) tervi készítési helyét jelöli DIMPROVER hexagonként;
- a fotóhely marker kék, külön megkülönböztetett megjelenést kap;
- a HJ listázás és tervrészlet melléklet számítás a fotóhely markereket nem számolja HJ hibajelölésként.


### Lebegő fotóhely választó panel

Frissítve:

- a PDF.js fotóhely jelölési mód mozgatható, összecsukható lebegő panelt kapott;
- a panelben a feltöltött képek kicsinyített előnézete látható;
- a kiválasztott fotó vizuálisan kiemelve jelenik meg, majd a PDF tervlapra kattintva kék fotóhely HexPin marker helyezhető el.


### Fotóhely marker kártyaforma és drag javítás

Frissítve:

- javítva lett a fotóhely választó lebegő panelének drag állapota;
- a fotóhely marker külön kék fotókártya formát kapott, nem azonos a HJ HexPinnel;
- a fotóhely marker a tervnézőben képes a fotó kicsinyített előnézetét is megjeleníteni.


### Fotóhely marker megjelenítése a tervrészlet PDF exportban

Frissítve:

- a vektoros A4 tervrészlet melléklet már nem csak az aktuális HJ HexPint rajzolja ki;
- a kapcsolódó tervlap kivágási keretén belül lévő fotóhely markereket is rárajzolja a PDF tervrészletre;
- a fotóhely marker PDF-ben külön kék fotókártya-jelölőként jelenik meg, nem HJ HexPinként;
- a fotóhely markerek továbbra sem növelik a HJ darabszámot.

### FHJ fotóhely jelölés

A terepi hibafelvételi tervi jelölések között a fotóhely külön azonosítót kapott: `FHJ-001`, `FHJ-002`, stb. A `F-001` továbbra is maga a fotó sorszáma, míg az `FHJ-001` a fotó tervi helyének jelölése.

A jegyzőkönyv PDF-ben a HJ és FHJ jelölések egy közös tervi jelölési blokkban jelennek meg, hogy a tervrészlet melléklet önállóan is értelmezhető legyen.

### FHJ teljes tervi jelölés és külön tervrészlet export

Frissítve:

- az FHJ fotóhely marker ugyanazokat a súlyosság- és státuszjeleket kapja a PDF.js tervnézőn, mint a HJ marker;
- az A4 vektoros tervrészlet mellékletben minden HJ és FHJ külön saját kivágásként jelenik meg;
- a HJ kivágásokra nem rajzolódnak rá automatikusan a közel eső FHJ markerek;
- az FHJ kivágásokra nem rajzolódnak rá automatikusan a közel eső HJ markerek;
- az aktuális tervrészlet exportverzió: `fhj-parity-separate-crops-v1`.

## 2026-06-20 – IFC modellnéző export, elemkijelölés és mérési előkészítés

- IFC nézet PNG export hozzáadva.
- Kijelölt IFC-HJ / IFC-FHJ markerhez nézetkép mentés hozzáadva.
- Összes IFC markerhez közös aktuális nézetkép mentés hozzáadva.
- Bal oldali TH/HJ fa megkülönbözteti az IFC és PDF marker képstátuszokat.
- IFC elem kijelölés mód bekerült alap szintű információs panellel.
- Mérési mód előkészítve két képernyőpont közötti távolság-előnézettel.
- Metszet mód UI előkészítés megmaradt későbbi vágósík-fejlesztéshez.

Megjegyzés: a valódi IFC 3D ponthoz kötött HJ marker még nem aktív; külön fejlesztési lépésként készül, hogy a stabil képernyőpozíciós marker ne sérüljön.


## 2026-06-20 – IFC exportkeret A5/A4/A3 logika

- Az IFC export a PDF.js exportlogikához közelítve exportkeretet kapott.
- A felhasználó A5 / A4 / A3 és álló / fekvő keretet választhat az IFC nézeten.
- Az exportkeret húzható overlayként jelenik meg a modellnézet felett.
- A PNG export keret bekapcsolt állapotban csak az exportkereten belüli IFC nézetrészt és HJ/FHJ markereket menti.
- A kijelölt marker és az összes marker nézetkép mentése exportkeret esetén a kereten belüli képet menti.
- Az IFC renderer exportbarát beállítást kapott, hogy az export PNG-ben a 3D modell is megjelenjen, ne csak a HJ overlay markerek.


## 2026-06-20 – IFC mérési egységek és JKV mentési megkülönböztetés

- Az IFC mérési előnézet m / cm / mm váltót kapott.
- Ha a mérési pontoknál olvasható IFC 3D találat, a távolság modellkoordináta alapján jelenik meg.
- Ha nincs mindkét pontnál 3D találat, a rendszer továbbra is nézeti pixel előnézetet mutat.
- Az IFC export panelen különválasztásra került a PNG letöltés és a JKV mellékletbe mentés.
- A kijelölt marker mentése JKV mellékletbe egyértelműbb gombfeliratot kapott.


## 2026-06-20 – IFC exportkép megjelenítése a tervrészlet mellékletben

- A tervrészlet melléklet exportja már nem csak PDF alapú vektoros kivágást kezel.
- Ha egy IFC markerhez mentett exportkép tartozik, a melléklet PDF közvetlenül ezt a képet ágyazza be.
- A tervrészlet melléklet bejegyzések közé bekerülnek azok a markerek is, amelyeknél van mentett kép, de nincs klasszikus PDF cropFrame.
- Ez biztosítja, hogy az IFC exportkerettel mentett HJ/FHJ nézetképek a terepi jegyzőkönyv teljes PDF csomagjában is megjelenjenek.


## 2026-06-20 – PDF.js és IFC tervrészlet export egységesítése

- Az IFC export a PDF.js tervrészlet exporttal azonos melléklet-logikát használ.
- Az exportpanel szövegezése PDF/IFC tervrészletre módosult.
- A jegyzőkönyv hivatkozási szövege külön jelöli az IFC modellt és a PDF tervlapot.
- A tervrészlet melléklet exportverziója egységes PDF/IFC exportverzióra frissült.


## 2026-06-20 – IFC melléklet PDF hiba javítása

- Javítva a `No PDF Header found` hiba, amely akkor jelentkezett, amikor az IFC forrást a mellékletgenerátor PDF-ként próbálta betölteni.
- A mentett IFC exportkép dataUrl beágyazása közvetlen base64 feldolgozást kapott.
- Nem PDF forrás esetén a rendszer nem próbál PDF-et olvasni; ha nincs olvasható mentett kép, kontrollált hiányzó-kép helykitöltőt tesz a mellékletbe.


## 2026-06-20 – IFC HJ egyenkénti JKV mentés

- Az IFC exportpanelen a fő JKV mentés a kijelölt HJ/FHJ marker külön képét menti.
- A mentett képben csak a kijelölt marker jelenik meg, nem az exportkeret összes markere.
- A tömeges mentés külön, másodlagos gombként maradt meg: Keretben lévők mentése egyszerre.
- Ezzel a PDF tervrészlet mellékletben minden HJ saját külön exportképet kaphat.


## 2026-06-20 – IFC melléklet kép nagyítása

- Az IFC modellnézeti tervrészlet melléklet egy HJ/FHJ képet külön A4 oldalra helyez.
- A PDF tervrészlet logika továbbra is két részletet kezelhet egy oldalon.
- Az IFC képek így nagyobb méretben jelennek meg, olvashatóbb HJ jelöléssel.
- A képernyőpozíciós IFC export továbbra is átmeneti megoldás; következő fő lépés a 3D ponthoz kötött HJ marker.


## 2026-06-20 – IFC 3D ponthoz kötött HJ marker MVP

- Az új IFC HJ marker lerakás megpróbál valódi IFC/world pozíciót menteni.
- Ha a kattintásnál elérhető `worldPosition`, a marker kamera/orbit mozgás után a 3D pont képernyőre vetített helyén jelenik meg.
- Ha nincs IFC találat, a rendszer visszaesik a korábbi képernyőpozíciós marker működésre.
- Az IFC kapcsolat panel jelzi, hogy a marker `3D ponthoz kötött` vagy `képernyőpozíciós`.
- Az exportnál a 3D ponthoz kötött markerek aktuális kameraállás szerinti vetített pozícióval kerülnek képre.


## 2026-06-28 - DIMPRO Eseményszervező miniapp MVP

- Új route: app/esemeny/torta/page.tsx.
- Új rövid belépő route: app/torta/page.tsx.
- PIN-kódos családi eseményoldal előkészítve: 8565.
- Kezdő szöveg és idézetkártya beépítve Mama 85. és Apu 65. születésnapjához.
- Build sikeresen lefutott, az /esemeny/torta és /torta route-ok megjelentek a Next.js route listában.
- Következő lépés: teljes vendéglista, szavazás, adatbázis, email értesítés és esemeny.dimpro.hu aldomain éles bekötése.


## 2026-06-28 – DIMPRO Eseményszervező / Torta oldal regisztráció

- Meghívotti regisztráció készült teljes név, becenév, csoportnév, e-mail, telefon és 4 számjegyű PIN mezőkkel.
- A meglévő regisztrált személyek a belépési felületen csoportosított listában láthatók.
- Családtag / ismerős hozzáadása az aktív belépő csoportja alá menthető.
- Az AI szövegjavaslat kártya csak szervezői nézetben jelenik meg.
- A válaszok, szavazatok, felajánlások és üzenetek az aktív PIN-nel belépett személyhez kötve mentődnek.
- Tesztelve 6 csoporttal, csoportonként 4 fővel: 24 regisztrált személy, 24 válasz, 24 egyedi szavazó.


## 2026-06-28 – Eseményszervező csoportválasztás és önátsorolás

- Új regisztrációnál bekerült a meglévő család/csapat/csoport kiválasztása.
- Az új regisztráló továbbra is létrehozhat teljesen új csoportot, ha nem találja magát a listában.
- A belépett személy saját magát át tudja sorolni másik meglévő csoportba vagy új csoportba.
- Az átsorolás frissíti a személyhez kötött válaszokat, felajánlásokat, üzeneteket és szavazói megjelenést.
- Tesztelve: meglévő csoportba sorolás, új csoport létrehozás, saját áthelyezés egyik csoportból másikba.


## 2026-06-28 – Családfa törlés gomb

- Törlés gomb került a családfa személydobozokra.
- A központi Mama és Apu doboz zárolt, ezért nem törölhető.
- Törlés gomb került a családfa-hozzáírásokra / pontosításokra is.


## 2026-07-02 – DIMPRO licencszerver API MVP

- Elkészült a DIMPRO licencszerver API alapmotor az `app/lib/license/` mappában.
- Új végpontok:
  - `POST /api/license/activate`
  - `POST /api/license/check`
  - `GET /api/license/public-key`
- A licencállapot, lejárat, gépszám limit, próba/függő/tiltott állapot és moduljogosultság szerveroldali ellenőrzést kapott.
- Az MVP fájlalapú licenc-adattárat használ: `.dimprover/data/license-store.json`.
- A token Ed25519 aláírással készül, formátuma: `base64url(payload).base64url(signature)`.
- Éles környezethez előkészített környezeti változók:
  - `DIMPRO_LICENSE_PRIVATE_KEY_PEM`
  - `DIMPRO_LICENSE_PRIVATE_KEY_BASE64`
  - `DIMPRO_LICENSE_BOOTSTRAP_KEY`
  - `DIMPRO_LICENSE_BOOTSTRAP_MAX_DEVICES`
  - `DIMPRO_LICENSE_OFFLINE_GRACE_DAYS`
- A kliensoldali `dimpro_license_config.json` `serverPublicKeyBase64` értékéhez a publikus kulcs lekérhető a `GET /api/license/public-key` végpontról.


## 2026-07-02 – HAGE 118 DEV/RUN licencvédett csomagolási előkészítés

- Beállításra került a Next.js `standalone` build kimenet és a production browser source map tiltása.
- Létrejött a `scripts/package-hage-118.mjs` csomagoló:
  - `HAGE_DEV_118.zip` – fejlesztői forráscsomag.
  - `HAGE_RUN_118.zip` – futtatási csomag fejlesztői forrás nélkül.
- Létrejött a `launcher_source/DIMPRO_HAGE_Indito.js` fejlesztői launcher forrás.
- A launcher alapértelmezett licencszervere: `https://license.dimpro.hu`.
- A launcher géphez kötött `machineIdHash` értékkel ellenőriz licencet.
- A licenckulcs nem kerül beégetésre az EXE-be.
- A régi `DIMPRO-HAGE-INVEST-MVP-2026` fallback kulcs kikerült az induló licencmotorból; ha nincs környezeti kulcs, a rendszer véletlenszerű DIMPRO kulcsmintát generál.
- A login felületen megjelent a DIMPRO szerzői jogi és licencfeltétel szöveg.


## 2026-07-04 - dimpro.hu nyilvanos kezdolap

- A dimpro.hu nyilvanos kezdolap alapertelmezett megjelenese visszafogott, bizalomepito, fejlesztes alatt allo bemutatkozo oldal lett.
- Nyilvanosan megjelenitett aktualis fejlesztesi iranyok: DIMPRO Aruter, DIMPRO Felujitasi Gyorskalkulator, DIMPRO vallalati feladatszervezesi munkater OneDrive / SharePoint inditasi logikaval, valamint DIMPROVER - Digitalis Muszaki Projektvezerlo Rendszer.
- A korabbi reszletesebb modulbemutato felulet rejtett fejlesztoi nezetkent megmaradt.
- A rejtett reszletes nezet es a nyilvanos fejlesztesi oldal kozott a Ctrl + Alt + 0 billentyukombinacio valt.
- A nyilvanos oldalon megmaradt a Van jo otleted? modulotlet-bekuldo kartya.


## 2026-07-04 - dimpro.hu customer link es linkes bemutato nezet

- A dimpro.hu nyilvanos kezdolapjan a fejlesztesi kartyaelemek alapertelmezetten nem kattinthato linkek.
- A nyilvanos feluleten kattinthato elemkent csak a DIMPRO ugyfelfelulet es a modulotlet bekuldo link maradt.
- A DIMPRO ugyfelfelulet linkje: https://license.dimpro.hu/customer.
- A Ctrl + Alt + 0 gyorsbillentyuvel kapcsolhato linkes bemutato nezetben a fejlesztesi kartyak aktiv hivatkozaskent mukodnek.
- A customer kartya bekerult a fejlesztesi kartyaelemek koze.


## 2026-07-04 - DIMPRO Fajlmuhely kezdolap

- Bekerult a DIMPRO Fajlmuhely helyi asztali segedprogram a dimpro.hu fejlesztes alatti moduljai koze.
- A nyilvanos szovegbol kikerult a gyorsbillentyu emlitese.
- A nyilvanos oldal tovabbra is csak a fo fejlesztesi iranyokat mutatja, belso utemezes es fejlesztoi hivatkozasok nelkul.


## 2026-07-04 - dimpro.hu nyilvanos kategoriak es kodvedett bemutato

- A nyilvanos oldalon konkret modulnevek helyett altalanos kategoriak jelennek meg.
- Az Ugyfel- es licenckezeles kartya aktiv, sotetebb stilusu linkkent mukodik.
- A reszletes linkes bemutato nezet gyorsbillentyu utan kod megadasaval nyithato meg.


## 2026-07-05 - Szerver allapotfigyelo admin felulet

- Letrejott az app/admin/szerver belso szerverallapot oldal.
- Letrejott az app/api/license/server-status vedett API vegpont.
- A felulet a meglovo DIMPRO licencadmin kulcsot keri, es nem tarolja el a kulcsot a bongeszoben.
- Mutatott adatok: VPS uptime, memoria, tarhely, Nginx allapot, PM2 folyamatok, Node/npm/PM2 verzio, Git munkakonyvtar valtozas osszesites.
- A licencadmin dashboard fejlécébe bekerult a Szerverallapot gomb.

## 2026-07-05 - DIMPRO GazdaSeged MVP felulet

- Letrejott az app/gazdaseged/page.tsx route.
- Elkeszult a mobil elso GazdaSeged frontend MVP: fooldal, terepi rogzitese, allattartas, dolgozoi mod, desktop admin dashboard, export UI es szerepkor bemutato.
- A DIMPRO login es account modulvalaszto kiegeszult a GazdaSeged kartyaval.
- A gazdaseged.dimpro.hu root utvonal elokeszitve lett a /gazdaseged route-ra torteno atiranyitasra.
- Javasolt domain logika: app.dimpro.hu kozponti portal, app.dimpro.hu/gazdaseged app utvonal, dimpro.hu/gazdaseged marketing oldal, gazdaseged.dimpro.hu rovid atiranyitas.

## 2026-07-06 - DIMPRO GazdaSegéd bővített MVP és domain egységesítés

- Létrejött a központi `app/lib/dimpro/modules.ts` modulregiszter a DIMPRO és DIMPROVER modulokhoz.
- A DIMPRO login oldal a modulregiszterből jeleníti meg a modulokat, és `app.dimpro.hu` alatt DIMPRO account nézetként működik.
- A DIMPRO Account modulválasztó a központi modulregisztert használja, és megjeleníti a marketing/app/rövid cím logikát.
- A GazdaSegéd route host-alapon szétvált: `dimpro.hu/gazdaseged` marketing nézet, `app.dimpro.hu/gazdaseged` app nézet.
- Elkészült a GazdaSegéd bővített frontend MVP localStorage mentéssel, rögzítéssel, feladatlistával, állattartási listával és export funkciókkal.
- A proxy előkészíti a `dimpro.hu/login` -> `app.dimpro.hu/login`, valamint az `aruter.dimpro.hu` és `gazdaseged.dimpro.hu` -> `app.dimpro.hu/...` átirányítási logikát.

## 2026-07-06 - GazdaSegéd hat fő modul használható frontend MVP

- A `components/gazdaseged/GazdaSegedClient.tsx` újraszervezésre került hat külön használható modul köré.
- Elkészült: Napi munka, Állattartás, Gépnapló, Raktár, Fotók, Export.
- Minden modul saját rögzítő űrlapot, lista nézetet, törlést és kapcsolódó feladatgenerálást kapott.
- A Raktár modul bevét/kiadás esetén módosítja az aktuális készletet, és minimum készlet alatti jelzést ad.
- A Fotók modul böngészős képelőnézetet és localStorage alapú demo mentést használ.
- Az Export modul modulonkénti CSV exportot, teljes JSON mentést és nyomtatás/PDF előkészítést tartalmaz.
- Az MVP továbbra is frontend/localStorage alapú; következő kör backend adatmodell és valódi fájlfeltöltés.


## 2026-07-06 - GazdaSeged marketing kartyak kattinthatova tetele

- A components/gazdaseged/GazdaSegedMarketing.tsx modul kartyai app.dimpro.hu/gazdaseged?view=... hivatkozast kaptak.
- A components/gazdaseged/GazdaSegedClient.tsx beolvassa a view query parametert, es a megfelelo belso modult nyitja meg.
- A GazdaSeged marketing oldal Belepes es App megnyitasa gombjai is az app.dimpro.hu kozponti app domainre mutatnak.


## 2026-07-06 - app.dimpro.hu SSL utan GazdaSeged linkek veglegesitese

- A GazdaSeged marketing kartya linkek visszakerultek az app.dimpro.hu app domainre.
- A Belepes es App megnyitasa gomb is az app.dimpro.hu cimet hasznalja.


## 2026-07-06 - GazdaSeged Beallitas modul mukodove alakitasa

- A Beallitas modulban a Szerepkorok, Torzsadatok es Szinkron statikus kartyak mukodo helyi admin felulette alakultak.
- Hozzaadva: farmProfile, workers, fields, syncState adatszerkezetek a GazdaSeged localStorage allapothoz.
- Hozzaadva: felhasznalo felvetel/szerkesztes/torles/statuszvaltas.
- Hozzaadva: gazdasag alapadatok es tabla/terulet torzsadatok szerkesztese.
- Hozzaadva: helyi szinkron futtatas, JSON export/import es demo visszaallitas.

## 2026-07-08 - Védett release letöltés és DIMPRO Fájlműhely csomagkezelés előkészítése

- Létrejött a védett, token alapú release-letöltési rendszer a DIMPRO Fájlműhely / DIMPRO Drive Desktop ZIP csomagokhoz.
- Új route-ok:
  - `GET /download/[token]` – felhasználóbarát letöltési oldal.
  - `GET /api/downloads/[token]` – közvetlen csomagletöltés.
- A release fájlok nem a publikus `public/downloads` mappába kerülnek, hanem privát VPS tárhelyre:
  - `/root/dimprover_release_packages/files/`
- A release registry helye:
  - `/root/dimprover_release_packages/release-registry.json`
- A proxy publikus kivételt kapott a tokenes letöltési oldalra és az API letöltési végpontra.
- Létrejött a `scripts/register-release-package.mjs` segédscript kézzel feltöltött csomagok regisztrálására.
- A letöltési link nem listázott, nem indexelhető, de a token birtokában a lejáratig letölthető.
- A rendszer SHA256 ellenőrző összeget, lejáratot, letöltésszámot és utolsó letöltési időt naplóz.
- Az MCP `upload_file` eszköz fejlesztési iránya rögzítve: fájl feltöltése privát release tárhelyre, tokenes letöltési link generálással.

## 2026-07-08 - DIMPRO Fájlműhely release előzményoldal

- Létrejött a `GET /releases/dimpro-fajlmuhely` belső release előzményoldal.
- Az oldal listázza a DIMPRO Fájlműhely / Drive Desktop csomagokat, verziókat, méretet, lejáratot, letöltésszámot, utolsó letöltést és SHA256 ellenőrző összeget.
- A release rekordokhoz megjelenik a verzióleírás és a változáslista.
- A jobb oldali panel tartalmazza a kézi ZIP regisztrálási parancsmintát, valamint a későbbi védett admin feltöltőoldal javaslatát.
- Biztonsági döntés: nyilvános, bárki által használható ZIP-feltöltő nem készülhet; feltöltés csak adminvédelemmel történhet.

## 2026-07-08 - Védett admin ZIP feltöltő felület

- Létrejött a `GET /admin/releases` védett admin release feltöltő oldal.
- Létrejött a `POST /api/releases/upload` szerveroldali feltöltő végpont.
- A feltöltő kizárólag DIMPRO licencadmin kulccsal használható.
- Támogatott csomagformátumok: `.zip`, `.7z`.
- Feltöltési limit: 75 MB.
- A feltöltött csomag továbbra is privát VPS release tárhelyre kerül:
  - `/root/dimprover_release_packages/files/`
- A feltöltés során megadható: projekt, verzió, cím, verzióleírás, változáslista, lejárat és feltöltő neve.
- Sikeres feltöltés után automatikusan létrejön a tokenes letöltési oldal és a release rekord bekerül a verziótörténetbe.
- A licencadmin dashboard felső gombsorába bekerült a `Release feltöltő` és a `Fájlműhely verziók` gyorshivatkozás.

## 2026-07-08 - Release oldalak magyar időzóna javítása

- A release letöltési oldal, a Fájlműhely verziótörténet oldal és az admin release feltöltő oldal dátum/idő megjelenítése explicit `Europe/Budapest` időzónát kapott.
- A szerveren UTC-ben tárolt `createdAt`, `expiresAt` és `lastDownloadedAt` értékek a felületen magyar helyi idő szerint jelennek meg.

## 2026-07-08 - Release fájltörlés és verziófa

- Az admin release feltöltő oldal bővült szerverfájl-törlési funkcióval.
- Fontos működési szabály: a törlés csak a fizikai ZIP / 7Z fájlt törli a VPS privát release tárhelyéről; a verziórekord, verzióleírás, SHA256, dátum és előzmény megmarad.
- A törölt fájllal rendelkező verzió `Fájl törölve` státuszt kap, a régi tokenes letöltés nem működik, de az előzmény továbbra is látható.
- A DIMPRO Fájlműhely verziólista oldal kártyái alapból összecsukott állapotban jelennek meg.
- A verziólista bal oldali oszlopot kapott verziófa struktúrával: DIMPRO Fájlműhely → DIMPRO Drive Desktop → v3.x fejlesztési ág → verziók.

## 2026-07-08 – DIMPRO Drive API váz és desktop HTTP dev kör előkészítése

- Elkészült a DIMPRO Drive API első Next.js oldali MVP váza.
- Új endpoint-csoport: `/api/drive/*`.
- Előkészített végpontok: health, projects, project files, upload init, upload chunk, upload complete, download init, events.
- A proxy engedi az `/api/drive/` útvonalakat, de az endpointok saját jogosultságellenőrzést végeznek.
- Fejlesztői hitelesítés: DIMPRO licencadmin kulcs vagy külön Drive dev token.
- A Drive dev token helye: `.dimprover/drive/dev-token.txt`.
- A szerveroldali Drive MVP még fejlesztői fájlrendszer-alapú előnézet, nem végleges termékadatbázis.
- A desktop kliens hosszú életű szerver API kulcsot továbbra sem tárolhat; az MVP dev token csak fejlesztési/tesztelési célú átmeneti megoldás.

## 2026-07-09 – DIMPRO Drive dev token admin és élő metadata GUI kör

- Új admin oldal: `/admin/drive`.
- Új védett API: `GET /api/drive/dev-token`.
- A Drive fejlesztői token csak licencadmin kulccsal kérhető le.
- Az admin dashboard gombsorába bekerült a „Drive API token” hivatkozás.
- A desktop fejlesztési kör következő célja: dev token útmutató, kis méretű chunk teszt és élő szerverfájllista GUI megjelenítés.

## 2026-07-09 – DIMPRO Drive upload complete flow v3.90–v3.92

- Szerveroldalon bővült az upload complete receipt logika.
- Az upload complete után létrejövő receipt alapján a `/api/drive/projects/[projectId]/files` fájllista már upload-preview rekordként vissza tudja adni a frissen lezárt feltöltési előnézetet.
- Desktop oldalon elkészült a v3.90–v3.92 kör: upload complete dev workflow, complete utáni szerverlista frissítés, feltöltési lépésállapot panel.
- A workflow továbbra is fejlesztői MVP állapot: kis teszt payload, nem ügyfélfájl, legfeljebb 1 MB-os dev chunk.

## 2026-07-09 – DIMPRO Drive upload debug és cleanup v3.93–v3.95

- Desktop oldalon elkészült a v3.93–v3.95 fejlesztési kör: részletes upload workflow naplóablak, upload session lista, cleanup terv.
- Szerveroldalon új admin védett végpontok készültek az upload sessionök ellenőrzéséhez és kézi tisztításához.
- Új végpontok:
  - `GET /api/drive/uploads/sessions`
  - `GET /api/drive/uploads/cleanup-plan`
  - `DELETE /api/drive/uploads/[uploadId]`
- A cleanup terv csak javaslatot ad; automatikus törlést nem végez.
- A kézi törlés csak az ideiglenes upload session mappát törli, projekt receipt / fájllista rekordot nem töröl automatikusan.

## 2026-07-09 – DIMPRO Drive admin debug UI v3.96–v3.98

- Bővült az admin Drive oldal: `/admin/drive`.
- v3.96: upload session lista megjelenítése admin felületen.
- v3.97: upload session cleanup terv megjelenítése admin felületen.
- v3.98: manuális upload session törlés admin UI-ból, megerősítő ablakkal.
- A manuális törlés csak az ideiglenes upload session mappát törli.
- A projekt receipt / fájllista rekord automatikus törlése továbbra sincs bekapcsolva.

## 2026-07-09 – DIMPRO Drive v3.99–v4.01 mérföldkő és Object Storage szerződés

- v3.99: a Drive admin oldal vizuális státuszkártyákkal bővült.
- v4.00: a Drive API MVP fejlesztési kör mérföldkő dokumentációja elkészült.
- v4.01: elkészült az Object Storage előkészítő szerződés.
- Új admin védett végpont: `GET /api/drive/storage-plan`.
- A storage terv Hetzner Object Storage elsődleges tárhely, Backblaze B2 és Hetzner Storage Box backup/archív irányokat tartalmaz.
- Fontos: valós Object Storage írás nincs bekapcsolva, a végpont csak plan-only előkészítő szerződést ad vissza.

## 2026-07-09 – DIMPRO Drive v4.02–v4.04 storage előkészítő kör

- v4.02: elkészült a Drive Object Storage env ellenőrző admin/API előkészítés.
- v4.03: elkészült a storage provider választó / plan-only konfigurációs szerződés.
- v4.04: elkészült a signed upload előkészítő API szerződés, valós feltöltés nélkül.
- Új admin/API végpontok:
  - `GET /api/drive/storage-env`
  - `GET /api/drive/storage-config`
  - `POST /api/drive/storage/signed-upload/init`
- A `/admin/drive` oldal új gombokkal bővült: Env check, Provider terv, Signed upload terv.
- Valós Object Storage írás és signed URL kiadás továbbra sincs engedélyezve.

## 2026-07-09 – DIMPRO Drive webes felület MVP induló verzió

- Elkészült az első webes DIMPRO Drive oldal: `/drive`.
- A felület projektalapú fájltér MVP: bal projektlista, középső szerverfájllista, jobb részletpanel, API státusz és storage előkészítő státusz.
- Dev token csak memóriában kezelhető, localStorage/config mentés nélkül.
- A webes felület demo adatokkal is betölt, dev token megadásával élő Drive metadata API-kat tud lekérni.
- Fontos: ez még nem teljes Drive webapp és nem Google Drive-szintű végleges dokumentumtár, hanem első böngészős UI alap.

## 2026-07-09 – Ideiglenes Drive belépési átirányítás

- A `/drive` oldal bejelentkezés nélküli elérése ideiglenesen nem az app `/login` oldalára, hanem a `https://license.dimpro.hu/admin` felületre irányít.
- A módosítás célja, hogy a még nem végleges DIMPRO login felület helyett használható admin belépési útvonal legyen.
- Később a szabály egy proxy feltétel módosításával visszaállítható.

## 2026-07-09 – DIMPRO fejlesztői licenc kezdőlap

- Elkészült az új fejlesztői kezdőlap: `/admin/dev`.
- Célja: központi linkgyűjtő és szoftverfejlesztési irányítópult több DIMPRO szoftverprojekt kezeléséhez.
- Első projektként felkerült a DIMPRO Fájlműhely.
- A licencadmin dashboard felső gombsorába bekerült a „Fejlesztői kezdőlap” hivatkozás.

## 2026-07-09 – Licencadmin belépés utáni felületválasztó

- A `license.dimpro.hu/admin` belépés után új felületválasztó képernyőt kapott.
- A felületválasztón két fő belépési irány van:
  - DIMPRO szoftverfejlesztő kezdőlap,
  - DIMPRO licencadmin – licencelés, gépaktiválás és előfizetés-kezelés.
- A klasszikus licenc-dashboard továbbra is elérhető, de most a kiválasztó kártyáról nyílik.
- A dashboard gombsorába bekerült a „Belépési felületek” visszalépő gomb.

## 2026-07-09 – Licencadmin védett fejlesztői felületek és release útvonal

- A `license.dimpro.hu/admin/dev` fejlesztői kezdőlap már nem nyilvános oldal: belépés nélkül a licencadmin belépési oldalra irányít.
- A `license.dimpro.hu/admin/releases`, `/admin/drive`, `/admin/szerver` és `/adminlog` aloldalak szintén licencadmin belépés után érhetők el.
- A DIMPRO Fájlműhely verzióoldal elsődleges helye ez lett: `https://license.dimpro.hu/releases/dimpro-fajlmuhely`.
- A régi `https://dimprover.hu/releases/dimpro-fajlmuhely` útvonal átirányít a license domain alatti verzióoldalra.

## 2026-07-09 – Licencadmin belépés és Fájlműhely release oldal rendezése

- Elkészült az új védett Fájlműhely verzióoldal: `/admin/fajlmuhely-verziok`.
- A verzióoldal nem nyílt szerveroldali listázást használ, hanem a licencadmin kulccsal védett `GET /api/releases/list` végpontról tölti be a release adatokat.
- A régi `/releases/dimpro-fajlmuhely` útvonal átirányít az új admin alatti verzióoldalra.
- A proxy szabály szétválasztja a license admin útvonalakat a normál DIMPROVER app-login védelemtől, hogy a `license.dimpro.hu/admin/...` aloldalak a licencadmin belépési logikával működjenek.
- A `license.dimpro.hu/admin/dev` fejlesztői kezdőlap és az új Fájlműhely verzióoldal böngészőben tárolt `dimproLicenseAdminKey` alapján, szerveroldali admin API ellenőrzéssel válik használhatóvá.
- Az admin release, Drive és szerverállapot oldalak automatikusan átveszik a licencadmin belépés után eltárolt admin kulcsot, így nem kell minden aloldalon kézzel újra beírni.
- A klasszikus licencadmin dashboard megmaradt; belépés után a választófelület két fő kártyát mutat: DIMPRO szoftverfejlesztő kezdőlap és DIMPRO licencadmin dashboard.

## 2026-07-09 – DIMPRO Drive webes admin előnézet licencadminhoz kötése

- A webes DIMPRO Drive MVP belépési logikája rendezésre került.
- A Drive webes admin előnézet elsődleges címe: `https://license.dimpro.hu/drive`.
- Az `app.dimpro.hu/drive` útvonal átirányít a license domain alatti Drive előnézetre.
- A módosítás oka, hogy a licencadmin belépés után eltárolt `dimproLicenseAdminKey` domainhez kötött, ezért az app domain nem tudná biztonságosan átvenni.
- A `/drive` oldal kliensoldali admin gate-et kapott: a `localStorage`-ban lévő licencadmin kulcsot a `GET /api/drive/health` végponton ellenőrzi.
- Sikeres ellenőrzés után a webes Drive API hívások admin headerrel futnak.
- A fejlesztői kezdőlapon a Webes DIMPRO Drive link relatív `/drive` útvonalra került, hogy a license domainen maradjon.

## 2026-07-09 – DIMPRO Drive webes admin UI használhatósági kör

- A `/drive` webes admin előnézet sikeres licencadmin ellenőrzés után automatikusan betölti a Drive adatokat.
- Automatikusan lekért adatok: API health, projektlista, kiválasztott projekt fájllistája és storage terv.
- A fájllista keresőt kapott fájlnév, útvonal, státusz és kiterjesztés alapján.
- Bekerült a státusz szűrő és a fájl/mappa típus szűrő.
- A középső panel bővült látható fájl darabszámmal és metadata méret összesítéssel.
- A jobb oldali részletpanel bővült kiterjesztés, SHA256, upload-preview/folder összesítő és storage provider részletekkel.
- A letöltés és DocumentViewer előnézet gombok előkészített, még nem aktív műveletként jelennek meg.
- Ez a kör a későbbi desktop Fájlműhely / DIMPRO Drive Desktop integráció webes admin alapját erősíti.

## 2026-07-09 – DIMPRO Drive download-init gomb bekötése

- A `/drive` webes admin előnézet jobb oldali részletpanelén a „Letöltés előkészítése” gomb valódi API-hívást kapott.
- Meghívott végpont: `POST /api/drive/files/[fileId]/download/init`.
- A válasz megjelenik a részletpanelen: státusz, download ID, file ID, lejárat, hiba vagy MVP megjegyzés.
- A funkció még nem tényleges fájlletöltés, hanem fejlesztői download session előkészítés.
- A cél a későbbi signed download, desktop kliens és jogosultságos letöltési workflow előkészítése.

## 2026-07-09 – DIMPRO Drive upload-init panel bekötése

- A `/drive` webes admin előnézet bal oldali panelén megjelent az Upload init tesztblokk.
- A blokk a `POST /api/drive/projects/[projectId]/upload/init` végpontot hívja.
- A felhasználó megadhat teszt fájlnevet, relatív útvonalat, fájlméretet és MIME típust.
- Siker esetén a jobb oldali panelen megjelenik az upload session adata: upload ID, fájlnév, relatív útvonal, méret és következő API endpoint.
- A funkció még nem valós fájlfeltöltés, hanem upload session / chunk workflow előkészítés.
- Ez a kör a DIMPRO Drive Desktop és DIMPRO Fájlműhely kézi feltöltési/szinkronos integrációját alapozza meg.

## 2026-07-09 – DIMPRO Drive Desktop GUI upload-init előkészítés

- A desktop GUI kiegészült helyi fájl kiválasztással.
- A kiválasztott fájlhoz megjelenik a méret és a MIME típus.
- A GUI automatikusan javasol relatív szerverútvonalat.
- A GUI-ból meghívható az upload-init API a kiválasztott projektre.
- A config példa és README frissült a `defaultUploadRelativePath` mezővel és az upload-init működéssel.
- A fejlesztés továbbra is csak a desktop kliensmappát és dokumentációt érintette, a DIMPROVER webapp modulstruktúráját nem.

## 2026-07-09 – DIMPRO Drive Desktop GUI kis fájl teljes MVP feltöltés

- A Python kliens kiegészült raw/binary request támogatással.
- Új metódusok készültek: `upload_chunk`, `upload_complete`, `upload_small_file`.
- A parancssoros kliens új kapcsolót kapott: `--upload-small-file`.
- A Tkinter GUI új gombot kapott: „Kis fájl feltöltése MVP”.
- A GUI egy kiválasztott, legfeljebb 10 MB méretű fájlra végigfuttatja az upload-init → chunk → complete láncot.
- Sikeres kisfájlos feltöltés után a GUI automatikusan frissíti a projekt fájllistáját.
- A fejlesztés nem érintette a DIMPROVER webapp modulstruktúráját vagy menürendszerét.

## 2026-07-09 – DIMPRO Drive Desktop több szint: download-init, naplózás, előzmények

- A GUI szerverfájllista táblázatából kijelölt fájlra meghívható a download-init végpont.
- A desktop kliens JSONL műveleti naplófájlt vezet: `dimpro_drive_operations.jsonl`.
- A parancssoros kliens új kapcsolókat kapott: `--log-file`, `--show-log`.
- A GUI új műveleti előzmények panelt kapott.
- A GUI-ban új gombok jelentek meg: `Download-init`, `Napló megnyitása`, `Előzmények frissítése`.
- A fejlesztés nem módosította a DIMPROVER webapp modulstruktúráját, layoutját vagy menürendszerét.

## 2026-07-10 – DIMPRO Drive Desktop GUI letöltési mentési terv

- A GUI új letöltési előkészítő panelt kapott.
- A kiválasztott szerverfájlhoz automatikusan javasolt helyi mentési útvonal készül.
- A felhasználó kézzel is választhat mentési célfájlt.
- A download-init válasz és a célútvonal együtt naplózódik.
- A config példa kiegészült a `lastDownloadTargetPath` mezővel.
- A fejlesztés továbbra is csak a desktop kliensmappát és dokumentációt érintette.

## 2026-07-10 – DIMPROVER jobb oldali gyorsindító sáv rendezése

- A jobb oldali, összecsukott quick rail új, egységes sötétkék/türkiz DIMPROVER dock megjelenést kapott.
- A gyorsindító gombok valódi kattintható/nyitható kártyaként működnek: felhasználó, főmodulváltó, projekt, értesítések, havi naptár, éves naptár, kapcsolatok, határidők, feladatok és előzmények.
- A havi és éves naptár gombok külön ikonra és külön flyout kártyára kerültek, a lapozó nyilak működnek és külön `stopPropagation` kezelést kaptak.
- A havi naptár kártyából közvetlen `/naptar` link nyílik.
- A flyout kártyák továbbra is elhúzhatók és rögzíthetők lebegő kártyaként, a pozíció localStorage-ben tárolódik.
- A teljes jobb oldali boardba bekerült a főmodulváltó, projektválasztó blokk, havi naptár, éves naptár és kontextuspanel rendezettebb elrendezésben.
- Létrejött a közös `dimproverModuleRegistry.ts`, amely a főmodulok útvonal-, szín-, állapot- és feature flag adatait egy helyen kezeli.
- Létrejött a `DimproverModuleSwitch.tsx`, amely a főmodulváltó kártyákat és a jobb board főmodulváltóját adja.

## 2026-07-12 – DIMPRO Fájlműhely v4.89 – Költségvetés Műhely MVP

Elkészült a DIMPRO Fájlműhely asztali szoftver új **Költségvetés Műhely** MVP modulja.

Változások:
- új csomag: `DIMPRO_Fajlmuhely_v4_89_Koltsegvetes_Muhely_MVP.zip`;
- v4.88 alapverzióból készült, backup mentéssel;
- új modul fájl: `dimpro_budget_workshop_module.py`;
- fő GUI integráció: `dimpro_fajlrendezo_gui.py`;
- új `K / Költségvetés Műhely` menüpont, gyorsgomb és súgóbejegyzés;
- költségvetési tételtábla, egyedi tételek, főanyag/rezsianyag bontás, rezsióradíj, JSON mentés és Excel/CSV export előkészítés;
- szerveres normatár-frissítés gombhely és státuszmentés előkészítve.

Letöltési release:
- token: `rel_20260712_yMlyTluXFCehZ89-9bC-deP3`;
- SHA256: `d74ec8d84f15b021cd19cdf6655130b56025eefd983a7d78b704b55ea8486c35`;
- méret: `11 904 679 byte`.

## 2026-07-12 – DIMPRO Fájlműhely v4.90 – Indítópult és Költségvetés Műhely javítások

Elkészült a v4.90 javító és bővítő csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_90_Inditopult_Koltsegvetes_Javitasok.zip`

Fő változások:
- főablakcím javítva: `DIMPRO Fájlműhely v4.90 GUI MVP`;
- Költségvetés Műhely kártya bekerült az indítópult `Műszaki műhely` csoportjába;
- gyorsgomb felirat javítva: `Ft Költs.`;
- mentett költségvetések lista hozzáadva;
- PDF export gomb és HTML fallback export hozzáadva;
- teljes App Xvfb smoke teszt sikeres.

Release adatok:
- token: `rel_20260712_4t-f2bAGHnQQSZSd5TxBjx0v`;
- SHA256: `d205734a528e2efb405bd57eac415a00c53a94157414dfd00ce4404df91e5a0e`;
- méret: `12 154 387 byte`.

## 2026-07-12 – DIMPRO Fájlműhely v4.91 – Beépített ReportLab PDF motor

Elkészült a v4.91 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_91_Beepitett_ReportLab_PDF.zip`

Fő változások:
- ReportLab telepítve a VPS Python környezetére;
- ReportLab bekerült a programcsomag `vendor/reportlab` mappájába;
- Költségvetés Műhely automatikusan betölti a vendor mappát;
- valós PDF export teszt sikeres;
- HTML fallback biztonsági tartalékként megmaradt.

Release adatok:
- token: `rel_20260712_9MyE8sycrTKQW1QlARfnQZLW`;
- SHA256: `659409eb5ea8a49c0cb54df9e062f9d9c81a0a6edc4c88469f23b1a659881fe2`;
- méret: `14 378 334 byte`.

## 2026-07-12 – DIMPRO Fájlműhely v4.92 – Windows EXE BuildKit

Elkészült a v4.92 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_92_Windows_EXE_BuildKit.zip`

Fő változások:
- Windows PyInstaller build spec hozzáadva;
- Windows `build_windows_exe.bat` hozzáadva;
- build környezet ellenőrző script hozzáadva;
- offline Windows 64-bit wheelhouse hozzáadva;
- Linux VPS-en ellenőrizve, hogy natív Windows `.exe` közvetlenül nem készíthető;
- v4.92 teljes App Xvfb smoke sikeres;
- vendor ReportLab valós PDF export sikeres.

Release adatok:
- token: `rel_20260712_m7D9308XzBafqI-2U3FgJJci`;
- SHA256: `5762112dc67bb8e529f9eebdc4e3a52d37723f1c2e04bba02527fb8d69fc5c9c`;
- méret: `54 542 366 byte`.

## 2026-07-12 – DIMPRO Fájlműhely v4.93 – Költségvetés export módok

Elkészült a v4.93 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_93_Koltsegvetes_Export_Modok.zip`

Fő változások:
- export mód választó: ügyfél / belső;
- ügyfél exportból belső forrásadatok elrejtése;
- belső export teljesebb forrásadatokkal;
- tételsor mozgatás Fel / Le gombbal;
- JSON menti az export módot;
- HTML/PDF export módhoz igazodik.

Release adatok:
- token: `rel_20260712_8TMzFWKpekR_yRMdL9LII5cH`;
- SHA256: `4a904ac9427e9610a94f88fec7cc9b255bc1a278e3c8d67530a8a554aaadcd41`;
- méret: `54 791 662 byte`.


## 2026-07-12 – VPS tárhelytisztítás és backup rendszer javítása

- A `license.dimpro.hu/admin/szerver` felületen feltárt tárhelyprobléma alapján átvizsgálásra került a `dimprover.hu/app.dimprover.hu/license.dimpro.hu` fő app és a `dev.dimprover.hu` dev app mappaszerkezete.
- A fő tárhelyfoglaló a `/root/dimprover/.dimprover/backups` mappa volt, ahol több óránkénti backup 3–3,4 GB méretűre nőtt.
- A növekedést az okozta, hogy a korábbi mentési script nem zárta ki a projektgyökérben lévő `backups/` mappát, a `.next-*` buildmentéseket és a ZIP release csomagokat.
- Javítva lett a fő app backup scriptje: `/root/dimprover/.dimprover/scripts/backup-now.sh` és `backup-retention.sh`.
- Javítva lett a dev app backup scriptje is: `/root/dimprover_dev/.dimprover/scripts/backup-now.sh` és `backup-retention.sh`, hogy a dev mentés saját `/root/dimprover_dev` mappára mutasson.
- A retention szabály lokálisan 6 óránkénti, 7 napi és 4 heti mentést tart meg.
- A hibásan felhízott óránkénti mentések törlésre kerültek; a VPS lemezhasználata kb. 100%-ról kb. 36%-ra csökkent.

## 2026-07-12 – DIMPRO Fájlműhely v4.94 – Költségvetés saját tételtár

Elkészült a v4.94 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_94_Koltsegvetes_Sajat_Teteltar.zip`

Fő változások:
- saját tételtár panel;
- saját tételtár kereső;
- kijelölt költségvetési tétel mentése saját tételtárba;
- saját tételből beszúrás költségvetésbe;
- saját tétel törlése;
- saját tételtár JSON export;
- helyi saját tételtár adatfájl: `config/dimpro_budget_own_items.json`.

Release adatok:
- token: `rel_20260712_wFABEz2oOVLjzNebgxZxZouA`;
- SHA256: `e267b46ef341e20d6ef94e566eb6f6b661ca2a61be96c2e5dc558f711ea87d77`;
- méret: `55 042 847 byte`.


## 2026-07-12 – Szerverállapot sávdiagramok és swap folyamatbontás

- A `license.dimpro.hu/admin/szerver` oldal új dinamikus mappaméret sávdiagramot kapott.
- Külön DIMPRO és DIMPROVER tárhelybontás készült.
- DIMPRO bontás: `/root/apps`, `/root/dimprover_release_packages`, `/root/dimprover_fajlmuhely_work`.
- DIMPROVER bontás: `/root/dimprover`, `/root/dimprover_dev`.
- A sávdiagramok automatikusan az aktuális almappákat olvassák, így új mappa létrejöttekor külön fejlesztés nélkül megjelenik a következő állapotfrissítésnél.
- A swap figyelmeztetéshez bekerült a folyamatonkénti swap lista.
- A swap szövegezése pontosítva lett: ha van elegendő elérhető RAM, akkor a magas swaphasználat inkább régebbi swapban maradt folyamatoldalakra utal, nem feltétlenül aktuális túlterhelésre.

## 2026-07-12 – Szerverállapot fejlesztői warning lista

- A `license.dimpro.hu/admin/szerver` oldal új „Fejlesztői warning lista” blokkot kapott.
- Új gomb: „Warning lista lekérése”.
- A teljes ESLint lista csak kézi gombnyomásra fut, nem az automatikus 30 másodperces szerverállapot frissítéssel.
- Az API `includeWarnings=1` query paraméterrel visszaadja az ESLint warningokat és errorokat.
- Minden jelzéshez megjelenik fájl, sor, oszlop, rule, eredeti üzenet és rövid magyar okmagyarázat.
- Aktuális ellenőrzés szerint a projektben 110 ESLint warning és 0 error van.

## 2026-07-12 – Szerverállapot 7 üzemeltetési panel, fülek és összecsukható kártyák

- A szerverállapot oldal oldalfüles szerkezetet kapott: Áttekintés, Tárhely, Folyamatok, Üzemeltetés, Warningok, Részletes listák.
- A hosszú görgetős nézet helyett a főbb blokkok összecsukható kártyákba kerültek.
- Beépült a Teendők / javasolt műveletek blokk.
- Beépült a Backup állapot panel.
- Beépült a Domain / port / PM2 térkép.
- Beépült az SSL tanúsítvány lejárati figyelő.
- Beépült a Log hibaösszesítő.
- Beépült a Release csomag tárhelyfigyelő.
- Beépült a Biztonsági checklist.
- Beépült a Takarítási javaslat panel, amely csak tervet mutat, automatikusan nem töröl.
- A tárhely kördiagram kiegészült a szabad tárhellyel.
- A szerverállapot API válasz feldolgozása védettebb lett, hogy HTML/login válasz esetén ne nyers JSON parse hiba jelenjen meg.

## 2026-07-12 – DIMPRO Fájlműhely v4.95 – Saját tételtár import és szűrő

Elkészült a v4.95 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_95_Sajat_Teteltar_Import_Szuro.zip`

Fő változások:
- saját tételtár JSON import;
- munkanem szűrő a saját tételtárhoz;
- keresés + munkanem szűrés együtt;
- aktuális költségvetés menthető tételeinek tömeges mentése saját tételtárba;
- azonos tételkód esetén frissítés duplikálás helyett.

Release adatok:
- token: `rel_20260712_OikKUdVr4BcqQmD4VjE1t8yS`;
- SHA256: `f484b3dda4ba3ea4872a341631dd23ee797ed44c6a89bf55a71d03d05dde7545`;
- méret: `55 295 481 byte`.


## 2026-07-12 – Szerverállapot teljesítményjavítás és betöltési overlay

- Az alap „Állapot frissítése” már nem futtatja az összes nehéz diagnosztikát.
- Bevezetésre került a `mode` query paraméter: `overview`, `storage`, `processes`, `operations`, `warnings`, `raw`.
- Az aktív fül részletes adatai külön „Aktív fül lekérdezése” gombbal tölthetők be.
- Az auto refresh csak az Áttekintés fülön fut.
- A betöltés DIMPRO hexagon logós overlay-t és sávos progress jelzőt kapott.
- A frontend védetten kezeli, ha az API helyett HTML/login oldal érkezik.

## 2026-07-12 – DIMPRO Fájlműhely v4.96 – Saját tétel szerkesztés és munkanem összesítő

Elkészült a v4.96 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_96_Sajat_Tetel_Szerkesztes_Munkanem_Osszesito.zip`

Fő változások:
- saját tétel szerkesztése a saját tételtárban;
- dupla kattintás szerkesztésre;
- jobb oldali munkanem összesítő panel;
- HTML/PDF/Excel export munkanem összesítővel.

Release adatok:
- token: `rel_20260712_hzesrDc_Dr-R6w4DFaMlBV8r`;
- SHA256: `fc36b384022bbd3dc6d4097638b2b99908038503e556730ea2e2ee492f6053cc`;
- méret: `55 548 414 byte`.


## 2026-07-12 – Tárhely kördiagram foglalt/szabad bontás és zöld szabad jelölés

- A tárhely kördiagram két fő szegmensre módosult: Foglalt tárhely és Szabad tárhely.
- A szabad értékek minden kördiagramon zöld színt kapnak.
- A foglalt tárhely narancsos figyelmeztető színt kap.
- A RAM és swap kördiagram színlogikája is erősebben elkülönülő lett.

## 2026-07-12 – DIMPRO Fájlműhely v4.97 – Saját tételtár Excel/CSV

Elkészült a v4.97 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_97_Sajat_Teteltar_Excel_CSV.zip`

Fő változások:
- saját tételtár XLSX/CSV/JSON export;
- saját tételtár CSV import;
- CSV importnál azonos tételkód szerinti frissítés duplikálás helyett;
- táblázatos saját tételtár mezőséma.

Release adatok:
- token: `rel_20260712_lADJJy-2_IOWHPNH3PHjkPaT`;
- SHA256: `e0a2f73fc23610f17eb70ffacfdfc84e6d3fafad51b712299a36812627521961`;
- méret: `55 821 197 byte`.

## 2026-07-12 – DIMPRO Fájlműhely v4.98 – Ajánlatfejléc és fedőlap

Elkészült a v4.98 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v4_98_Ajanlat_Fejlec_Fedolap.zip`

Fő változások:
- ajánlatmeta mezők hozzáadva;
- ajánlatadatok DIMPRO JSON mentése és visszatöltése;
- HTML ügyfél export fedőlap jellegű ajánlatfejléccel;
- PDF export ajánlatfejléccel;
- Excel tételes és összesítő lap ajánlatadatokkal;
- ügyfél exportban belső TERC/ÉNGY adat továbbra sem jelenik meg.

Release adatok:
- token: `rel_20260712_n4mOO_A_6du6tfYIq_wf-UuT`;
- SHA256: `05d3c13b27fb6f685c2a390485711362ce766926b57db1998af13a9d3e8290c1`;
- méret: `56 098 133 byte`.


## 2026-07-12 – Webes Értesítési Központ MVP indulás

- Létrejött a szerveroldali Notification / NotificationRecipient típus- és tárolóréteg.
- Létrejöttek a web/desktop közös API végpontok: lista, olvasatlan szám, részletek, olvasottnak jelölés, archiválás, összes olvasott, projekt activity.
- Elkészült a `NotificationBell`, `NotificationDropdown`, `NotificationList`, `NotificationCard`, `NotificationDetailPanel` és a teljes `/notifications` oldal.
- A jobb oldali board korábbi statikus `5` értesítés jelzése valós API-alapú komponensre lett cserélve.
- A Drive upload lezárása `FILE_UPLOADED` értesítés generálására elő lett készítve.
- A `proxy.ts` engedi a közös notifications API útvonalakat, de az API saját auth ellenőrzést végez.

## 2026-07-13 – Fejlesztési Napló / AI Kontextustár MVP

Elkészült a belső DIMPRO fejlesztési tudástár első MVP verziója.

Új route:
- `/admin/fejlesztesi-naplo`

Új API:
- `GET /api/license/dev-notes`
- `POST /api/license/dev-notes`

Új szerveroldali modul:
- `app/lib/license/dev-notes.ts`

Tárolás:
- `.dimprover/dev-notes/dev-notes.json`

Fő funkciók:
- fejlesztési ötletek, döntések, feladatok, hibák és kódolási utasítások rögzítése;
- AI kontextus külön mezővel;
- új csevegőbe / más AI-nak másolható átadó blokk generálása;
- modul, típus, státusz, prioritás és címke kezelés;
- keresés és szűrés;
- archiválás, visszaállítás és törlés;
- licencadmin kulccsal védett API;
- admin és fejlesztői kezdőlap linkek bővítése.

Létrejött első induló naplóbejegyzés:
- `Fejlesztési Napló / AI Kontextustár MVP indulás`

Következő kapcsolódó fejlesztési lépések:
- Szerverőr e-mail értesítés bekötése;
- Verziónapló / changelog oldal összekapcsolása a Fejlesztési Naplóval;
- build, lint, smoke teszt és dokumentációfrissítés rögzítése fejlesztési körönként.

## 2026-07-13 – Fejlesztési Napló kapcsolódó fejlesztések és többfelületű csomaglogika

A Fejlesztési Napló / AI Kontextustár bővült a közös webes–desktopos–szerveres fejlesztések kezelésére.

Fő változások:
- bővített modul lista közös fejlesztési modulokkal;
- új `Érintett felületek` mező többválasztós jelöléssel;
- új `Fejlesztési csomag / Epic` mező;
- új kapcsolódó bejegyzés választó;
- kapcsolódó fejlesztések megjelenítése chipként;
- új mezők: függőségek, blokkolók, párhuzamos csevegő állapota, külső AI megjegyzés, átadó összefoglaló;
- AI átadó blokk bővítése az új kapcsolati mezőkkel;
- API szűrés bővítése `surface` és `epic` paraméterrel;
- `allNotes` könnyített lista a kapcsolódó bejegyzések kiválasztásához.

Ezzel a webes Értesítési Központ, a Drive Desktop Értesítések és a közös Értesítési Motor egy közös fejlesztési csomagban vezethető.

## 2026-07-13 – AI Kontextussegéd MVP a Fejlesztési Naplóban

Elkészült a Fejlesztési Napló teljes AI Kontextussegéd MVP-je.

Új fájlok:
- `app/lib/license/dev-notes-ai.ts`
- `app/api/license/dev-notes-ai/route.ts`
- `components/admin/DevNotesAiAssistant.tsx`

Módosított fájl:
- `app/admin/fejlesztesi-naplo/page.tsx`

Funkciók:
- 11 AI művelet gombnyomással;
- minden gombon becsült Ft költség;
- napi és havi becsült limit;
- AI usage JSONL napló;
- OpenAI Responses API szerveroldali bekötés előkészítve;
- API kulcs hiányában biztonságos, nem futtató állapot;
- válasz előnézet;
- vágólapra másolás;
- kézi átvétel AI kontextusba, kódolási utasításba, következő lépésbe, átadó összefoglalóba vagy részletes leírásba.

Tervezett induló beállítás:
- napi limit: kb. 2 USD;
- havi limit: kb. 40 USD;
- modell és árazás env változókkal módosítható.

## 2026-07-13 – Release Központ / Élesítési napló MVP

Elkészült a DIMPROVER webes Release Központ MVP.

Új fájlok:

- `app/lib/license/release-center.ts`
- `app/api/license/release-center/route.ts`
- `app/admin/release-kozpont/page.tsx`
- `scripts/check-release-center-api.sh`

Módosított fájlok:

- `app/admin/dev/page.tsx`
- `app/admin/page.tsx`

Funkciók:

- DEV / STAGING / PRODUCTION állapotkártyák;
- PM2 és build/static állapot megjelenítés;
- release bejegyzés létrehozása és szerkesztése;
- verziószám, cím, típus, forrás/cél állapot;
- érintett modulok jelölése;
- technikai changelog;
- publikus changelog;
- belső fejlesztői changelog;
- ismert hibák / kockázatok;
- build és smoke eredmény;
- rollback terv és backup útvonal;
- AI release átadó blokk;
- kötelező checklist;
- release státuszváltás: RC, élesítésre kész, élesítettként rögzítés, rollback pont kész.

Biztonsági megjegyzés:

Az MVP nem indít automatikus élesítést. A `production_deployed` státusz jelenleg naplózási/jóváhagyási állapot, nem futtat deploy parancsot.

## 2026-07-13 – Szerverőr e-mail riasztás MVP

Elkészült a Szerverőr e-mail értesítési MVP.

Módosított fájlok:

- `app/lib/license/server-monitor.ts`
- `app/api/license/server-monitor/route.ts`
- `app/admin/szerver/page.tsx`

Új ellenőrző script:

- `scripts/check-server-monitor-email-api.sh`

Funkciók:

- SMTP konfigurációs állapot megjelenítése;
- monitor címzettek darabszámának és listájának megjelenítése;
- szükséges env változók listázása;
- kézi teszt e-mail gomb;
- teszt e-mail eredmény naplózása;
- automatikus warning/error riasztás meglévő Szerverőr futáskor, ha az SMTP beállítás teljes;
- ismétlődő azonos hiba 6 órás kiküldési védelme.

Jelenlegi korlát:

Valódi e-mail küldéshez még be kell állítani az SMTP környezeti változókat és PM2 restart `--update-env` móddal kell futtatni.

## 2026-07-13 – DIMPRO automatikus e-mail profilok előkészítése

- Új központi e-mail profil motor készült a DIMPRO automatikus levelezéshez.
- Külön profilok készültek: system, notifications, drive, noreply, billing, admin, info.
- Új admin API készült az e-mail profilok állapotának lekérdezéséhez és célzott tesztküldéséhez.
- A profilállapotok jelszót nem adnak vissza, csak konfiguráltsági állapotot mutatnak.
- A tényleges SMTP titok manuális szerveroldali beállítást igényel.

## 2026-07-13 – Admin E-mail beállítások oldal

- Elkészült az `/admin/email` admin oldal.
- Menthető közös SMTP host, port, SSL/TLS állapot, közös jelszó és teszt címzettlista.
- A feladóprofilok engedélyezhetők, szerkeszthetők és külön tesztelhetők.
- Az admin és fejlesztői kezdőoldalakon megjelent az E-mail beállítások link.
- A Szerverőr képes a közös mail-profil fájlból is átvenni a system SMTP profilt, ha nincs külön PM2/env SMTP beállítás.

## 2026-07-14 – Szerverőr riasztási szabályok és app.dimprover.hu figyelés

- A Szerverőr figyelt HTTP céljai közé bekerült a `app.dimprover.hu` webes alkalmazás.
- Bekerült a `dimprover.hu` főoldal elérhetőségi ellenőrzése is.
- A Szerverőr konfiguráció visszaadja a figyelt webes célokat és a riasztási szabálylistát.
- A Szerverállapot / Szerverőr felületen megjelent a „Figyelt webes felületek” és a „Szerver riasztási szabályok” blokk.
- A védett app domaineknél a 3xx bejelentkezési átirányítás működő válasznak számít.
- A Szerverőr e-mail címzettjei env változó hiányában a mentett mail-profil teszt címzettlistából is átvehetők.

## 2026-07-14 – SMTP whitelist hiba magyar magyarázata

- Az `/admin/email` oldalon a sikertelen teszt e-mail eredmény magyar magyarázó hibát is mutat.
- A Szerverőr teszt e-mail és automatikus riasztás is kapott magyar SMTP hibaértelmezést.
- A DotRoll whitelist / relay hiba külön felismerést kapott: `550 Recipient rejected. You are not on the whitelist.`
- A technikai hibaüzenet megmarad, de mellette felhasználóbarát teendő jelenik meg.

## 2026-07-15 – DIMPRO Fájlműhely v5.30 – PDF Tervösszehasonlítás MVP6

Elkészült a DIMPRO Fájlműhely asztali PDF Tervnéző új, külön **Tervösszehasonlítás** munkamódjának v5.30 MVP6 csomagja.

Csomag:
- `DIMPRO_Fajlmuhely_v5_30_PDF_Tervosszehasonlitas_MVP6_20260715_1959.zip`

Tokenes letöltés:
- `https://license.dimpro.hu/download/rel_20260715_Bpj76dtaeeAAN8Rkie2nR5zZ`

Publikus tartalék letöltési útvonal:
- `https://license.dimpro.hu/downloads/DIMPRO_Fajlmuhely/DIMPRO_Fajlmuhely_v5_30_PDF_Tervosszehasonlitas_MVP6_20260715_1959.zip`

Release adatok:
- token: `rel_20260715_Bpj76dtaeeAAN8Rkie2nR5zZ`;
- SHA256: `acfcdd9e3862b1d0ba224cd077bb8542933998f516ad41b5193e04343761cf02`;
- méret: `218 661 byte`;
- lejárat: `2026-08-14T20:02:51.251Z`.

Fő funkciók:
- A/B PDF tervpár betöltés;
- párhuzamos régi / új tervnézet;
- közös zoom, pan és oldallapozás;
- overlay nézet opacity állítással;
- blink nézet állítható váltási idővel;
- kézi X/Y/skála illesztés;
- területkizárás;
- kézi eltéréskártyák;
- aktuális oldali szöveg-diff;
- teljes dokumentum szöveg-diff oldalankénti összesítővel;
- tervlap metaadat gyors felismerés: rajzszám / tervszám, revízió, dátum;
- tervpár gyorsellenőrzés;
- eltéréskártya CSV export;
- PDF változásriport export;
- ellenőrzési ZIP csomag export;
- önellenőrzés / diagnosztika;
- minta PDF-pár generálás.

Dokumentáció:
- `.work_pdf_viewer_v525/D498/docs/PDF_Tervosszehasonlitas_MVP1.md`
- `.work_pdf_viewer_v525/D498/docs/PDF_Tervosszehasonlitas_kezi_ellenorzesi_csekklista.md`

Tesztelés:
- Python syntax ellenőrzés sikeres;
- `compileall` sikeres;
- session/import smoke teszt sikeres;
- Xvfb UI smoke tesztek sikeresek;
- szöveg-diff, teljes diff, CSV export, ellenőrzési ZIP csomag, diagnosztika és minta PDF-pár smoke tesztek sikeresek;
- ZIP tartalomellenőrzés sikeres.

Megjegyzés:
- A fejlesztés az asztali DIMPRO Fájlműhely Python/Tkinter munkacsomagot érintette, nem a webes DIMPROVER appot.
- Valódi Windowsos kézi ellenőrzés még szükséges a friss csekklista alapján.

## 2026-07-15 – DIMPRO Fájlműhely v5.30 FULL – PDF Tervösszehasonlítás MVP6 teljes csomag

A korábbi v5.30, 218 661 byte méretű ZIP csak fejlesztői/módosítási csomag volt. Elkészült a teljes, Windowsos kézi próbára szánt komplex D498 csomag.

Csomag:
- `DIMPRO_Fajlmuhely_v5_30_FULL_PDF_Tervosszehasonlitas_MVP6_20260715_2008.zip`

Tokenes letöltés:
- `https://license.dimpro.hu/download/rel_20260715_xFyW1str4KDvp9_zhW3_Za-3`

Közvetlen ZIP letöltés:
- `https://license.dimpro.hu/api/downloads/rel_20260715_xFyW1str4KDvp9_zhW3_Za-3`

Release adatok:
- token: `rel_20260715_xFyW1str4KDvp9_zhW3_Za-3`;
- SHA256: `7a35cd5bbc83c5f388c9f884e3cf60b8b456992e879ef81d64e6854d6d3f2651`;
- méret: `43 777 316 byte`, kb. `41,7 MB`;
- lejárat: `2026-08-14T20:09:16.097Z`.

Tartalom:
- teljes D498 Fájlműhely munkacsomag;
- `wheelhouse_win312` függőségek;
- PDF Tervnéző és DocumentViewer engine;
- új `modules/pdf_compare` tervösszehasonlító modul;
- dokumentáció és kézi ellenőrzési csekklista.

Fontos:
- Windowsos kézi teszthez ezt a FULL csomagot kell használni, nem a 214 KB körüli módosítási ZIP-et.

## 2026-07-15 – DIMPRO Fájlműhely v5.31 – Overlay/Blink zoom javítás

Kézi Windows teszt alapján javítva lett a PDF Tervösszehasonlítás overlay/blink nézetének nézetállapot-kezelése.

Csomag:
- `DIMPRO_v531_FULL_shortpath_overlayfix.zip`

Letöltés:
- `https://license.dimpro.hu/download/rel_20260715_gPl5CVQdseplcYcKf_DtKUgx`

Közvetlen ZIP:
- `https://license.dimpro.hu/api/downloads/rel_20260715_gPl5CVQdseplcYcKf_DtKUgx`

SHA256:
- `d64eeb245c67f7aa6d06e2fcf2b6851089739272fea9af53a69c3df279c14c2f`

Javítások:
- overlay opacity csúszka nem állítja vissza és nem ugrasztja el a PDF nézetet;
- blink váltás közben a zoom/pan állapot megmarad;
- overlay/blink módban a zoom gombok az overlay viewer saját állapotát módosítják;
- a PDF Tervnéző verziófelirat v5.31-re frissült.

## 2026-07-15 – DIMPRO Fájlműhely v5.32 – Pixel-diff MVP

Elkészült a PDF Tervösszehasonlítás aktuális oldali pixel-diff MVP funkciója.

Csomag:
- `DIMPRO_v532_FULL_shortpath_pixeldiff.zip`

Letöltés:
- `https://license.dimpro.hu/download/rel_20260715_RHDNl8z2OCGcOaYsIBIXOs49`

Közvetlen ZIP:
- `https://license.dimpro.hu/api/downloads/rel_20260715_RHDNl8z2OCGcOaYsIBIXOs49`

SHA256:
- `f21769074f0bcb558462462555a59e38c919280129f57ae8d8eaefba237cd3c8`

Fő változások:
- új `Pixel-diff` nézetmód;
- aktuális A/B PDF oldal képi összehasonlítása;
- piros eltéréskiemelés;
- állítható pixel-diff küszöb;
- pixel-diff összesítő: eltérő pixelek száma és százaléka;
- `Pixel kártya` gomb eltéréskártya létrehozásához;
- PDF változásriport pixel-diff összefoglalóval;
- verziófelirat v5.32.

Tesztelés:
- `py_compile` sikeres;
- `compileall` sikeres;
- Xvfb pixel-diff UI smoke teszt sikeres generált képpárral;
- zoom/pan állapotmegőrzés ellenőrizve pixel-diff újrarendereléskor.

## 2026-07-15 – DIMPRO Fájlműhely v5.34 – Pixel-diff területkizárás

Elkészült a pixel-diff számításba való valódi területkizárás.

Csomag:
- `DIMPRO_v534_FULL_shortpath_pixeldiff_exclusion.zip`

Letöltés:
- `https://license.dimpro.hu/download/rel_20260715_HV_omBDwYoray6TFEvXLM3Ha`

Közvetlen ZIP:
- `https://license.dimpro.hu/api/downloads/rel_20260715_HV_omBDwYoray6TFEvXLM3Ha`

SHA256:
- `ab5b417a0d0b9b9f83733a9dd169e0beb7ae5810ec5bddaaf3232fb98f1ff156`

Fő változások:
- a területkizárás már nemcsak vizuális jelölés;
- a kizárt régiók ténylegesen kikerülnek a pixel-diff maszkból;
- a kizárt pixelek nem növelik az eltérés százalékát;
- a pixel-diff összefoglaló tartalmazza a kizárt régiók és pixelek számát;
- a PDF riport is jelzi a pixel-diffből kizárt régiókat.

Tesztelés:
- generált képpáros Xvfb pixel-diff smoke teszt sikeres;
- a kizárt területben lévő eltérés 1,8453%-ról 0,0%-ra csökkent;
- `py_compile` és `compileall` sikeres.

## 2026-07-15 – DIMPRO Fájlműhely v5.35 – Modern kétkártyás PDF compare UI

A PDF Tervösszehasonlítás felület modern DIMPRO-zöld kétkártyás nézetet kapott.

Csomag:
- `DIMPRO_v535_FULL_shortpath_modern_compare_ui.zip`

Letöltés:
- `https://license.dimpro.hu/download/rel_20260715_lLMJBuAdTkGCtMpJTJRkwfcM`

Közvetlen ZIP:
- `https://license.dimpro.hu/api/downloads/rel_20260715_lLMJBuAdTkGCtMpJTJRkwfcM`

SHA256:
- `e02391d497dc196a6b36707eeb48179b524f38a87834a6a62c25d5a06c3f1f93`

Fő változások:
- modern DIMPRO-zöld felső compare vezérlősáv;
- két nagy kártyás A/B PDF nézet: `A – RÉGI` és `B – ÚJ`;
- overlay / blink / pixel-diff külön kompozit kártyába került;
- meglévő compare motor megtartva;
- RevCompare kivezetési döntés megtartva;
- v5.35 verziófelirat.

Dokumentáció:
- `.work_pdf_viewer_v525/D498/docs/DIMPRO_PDF_COMPARE_MODERN_CARD_UI_V535.md`

Tesztelés:
- `py_compile` sikeres;
- `compileall` sikeres;
- Xvfb modern UI smoke teszt sikeres: kártyák, overlay, pixel-diff, kizárás, visszalépés párhuzamos nézetre.

## 2026-07-15 – DIMPRO Fájlműhely v5.36 – Compare mód teljes szélességgel

A PDF Tervösszehasonlítás munkamódban a jobb oldali Jelölések / HexPin / D pecsét panel automatikusan rejtett.

Csomag:
- `DIMPRO_v536_FULL_shortpath_compare_fullwidth.zip`

Letöltés:
- `https://license.dimpro.hu/download/rel_20260715_TvW_OTdj1E-7icVABlkkQRB9`

Közvetlen ZIP:
- `https://license.dimpro.hu/api/downloads/rel_20260715_TvW_OTdj1E-7icVABlkkQRB9`

SHA256:
- `fba348ac0b7bf7db72e0c05d8acb43e7853557c8753e4b2d8f4bd80201965eda`

Változások:
- compare mód megjegyzi a korábbi jobbpanel-állapotot;
- a panel automatikusan eltűnik;
- compare módban a Panel gomb nem nyitja vissza;
- Olvasó módra visszalépve a korábbi panelállapot visszaáll;
- a két PDF kártya teljes munkaszélességet kap.

Tesztelés:
- `py_compile` és `compileall` sikeres;
- Xvfb UI smoke tesztben az elrejtés, blokkolás és visszaállítás sikeres.


## 2026-07-18 – HAGE AI Gateway élesítés

- elkészült a központi `api/hage-ai/[operation]` Gateway;
- névre szóló AI-jogosultság került a DIMPRO licencadminba;
- aktív licenc + aktív AI-modul + aktív felhasználó ellenőrzés történik minden futtatáskor;
- az OpenAI API-kulcs nem kerül a HAGE klienscsomagba;
- a költség és tokenhasználat a DIMPRO szerveren naplózódik;
- a licencadatok buildtől független tartós mappára kerültek;
- a HAGE Gateway státusz- és becsléstesztje sikeres volt `Keserű Benjámin` felhasználóval.

## 2026-07-20 – Értekezleti Kísérő kétoldali webes ellenőrzés és Teams dark contrast fix

- A `/ertekezleti-kisero` webes kezelőoldalon alapértelmezetten egyszerre látható a szervezői és a résztvevői panel.
- Mindkét oldal ugyanazt a meetingadatot használja, de a résztvevői oldal csak a megosztott tartalmat jeleníti meg.
- Külön nézetváltóval elérhető a korábbi Teams-elrendezés szemléltető nézete.
- A Teams sötét témában megszűntek a fehér panelrészek és a gyenge kontrasztú szövegek.
- Ellenőrzések: TypeScript sikeres, célzott ESLint sikeres, production build sikeres, PM2 restart sikeres.

## 2026-07-20 – Értekezleti jelenléti ív és sablonkezelő

- MeetingWorkspace v3 adatmodell.
- Részletes jelenlévő felvétel, szerkesztés és törlés.
- Jelenléti státusz, online/személyes részvétel, érkezés/távozás és külsős jelölés.
- Hat működő értekezlet- és jegyzőkönyvsablon.
- Napirendi pont hozzáadás, átnevezés, törlés, sorrendezés, aktuális/teljesített és megosztott/privát állapot.
- Résztvevői olvasható jelenléti és megosztott napirendi nézet.
- Jelenléti ív az exportban és az archív keresésben.
- Teljes ESLint 0 hiba; production build és 15 lépéses élő teszt sikeres.

## 2026-07-20 – Napirendi pontok részletes kidolgozó munkalapja

- MeetingWorkspace v4 adatmodell.
- Aktuális napirendi pont alatt külön leírás-, egyeztetési-, döntés-, nyitott kérdés- és privát jegyzetmező.
- Mintaszövegek minden új sablonpontban.
- Mentetlen módosítás figyelmeztetés pontváltáskor.
- Résztvevői csak olvasható, privát tartalmat kizáró nézet.
- Részletes napirend a snapshotban, archív keresésben és exportban.
- TypeScript, teljes ESLint és production build sikeres; éles API-teszt a részletes tartalom mentéséig és privát szerkesztési tiltásig sikeres.

## 2026-07-20 – Értekezleti Kísérő jogosultság, Teams átirat és használhatóság

- Külön helyi szervezői és közös résztvevői Teams-token.
- Meghívottak csak olvasható, privát adatokat kizáró nézete.
- API-szintű organizer scope ellenőrzés.
- Webes kétoldali nézet teljes értékű értekezletvezetőként megőrizve.
- Napirendi mezők 1,4 másodperces automatikus mentése.
- Microsoft Graph Teams-átirat konfiguráció és szinkron API/UI.
- MeetingWorkspace v6 projekt- és dokumentumadatokkal.
- DIMPRO Drive projektválasztás.
- Napirendhez kötött feladatok és mellékletek.
- Szerkeszthető DOCX-export, bővített PDF/HTML.
- Bővített értekezleti archívum.
- Teams alkalmazáscsomag v0.1.4, manifest 1.23, RSC-előkészítés.

## 2026-07-20 – DIMPRO Értekezleti Asszisztens v0.1.5

- kompakt ikonos Teams-fejléc és teljes szélességű szekciók;
- ÁLT kategória külön emlékeztető/jegyzőkönyv/feljegyzés dokumentumformával;
- automatikus projekt-/típusalapú számozás;
- projektadatlap és újrahasznosítható projekttagok;
- értekezletvezető, jegyzőkönyvvezető és jóváhagyó;
- Gyors/Joker sablon és strukturált témablokkok;
- élő és közzétett összefüggő dokumentum;
- korábbi dokumentumok felugró előnézete;
- AI dokumentum-megfogalmazó modal;
- következő egyeztetés, lezáró sablonok és e-mail tájékoztatás;
- SMTP-küldés PDF/DOCX csatolással és auditnaplóval;
- résztvevői tudomásulvétel, észrevétel és értékelés;
- nyers HTML/JSON hiba javítása;
- 26 lépéses éles integrációs teszt sikeres.

### v0.1.5 UI finomítás – 2026-07-20

- projekt- és értekezletválasztó kezdőoldal az `/ertekezleti-kisero` útvonalon;
- régi alapértelmezett demómeeting eltávolítása;
- egyaktív-szakaszos ikonos panelnavigáció;
- aktív tartalom paneltetejére igazítása;
- halványabb, formázott és könnyebben olvasható élő emlékeztető.

### v0.1.5 UI finomítás – összecsukott fejezetek és türkizzöld dokumentum

- minden fejezet zárva indul;
- ikongomb és fejezetfejléc azonos egyaktív-szakaszos logikát használ;
- megnyitáskor a tartalom a panel tetejére kerül;
- halvány türkizzöld dokumentumlap és fekete aláhúzások.

### v0.1.5 webes téma és elrendezés – 2026-07-21

- kézi, mentett világos/sötét mód;
- szélesebb szervezői és keskenyebb résztvevői kétoldali munkatér.

### v0.1.5 – húzható munkatér és folyamatjelző – 2026-07-21

- mentett, húzható 66/34 kétoldali elrendezés;
- résztvevői nézet összecsukása és alaparány-visszaállítás;
- hétlépéses, automatikus 0–100%-os értekezleti készültség;
- szervezői hiányosságlista és egyszerűsített résztvevői állapot;
- szerepkör szerint elkülönített fejezetnavigáció.

### v0.1.5 webes stabilitás – 2026-07-21

- teljes oldalas sötét téma;
- projektlista jogosult adatbetöltése;
- húzható 66/34 munkatér;
- készültségi sáv biztonságos kijelző módban.


### Értekezleti Asszisztens – licenc- és szerkesztésátadási roadmap – 2026-07-21

- közös DIMPRO/DIMPROVER licenc, modulonkénti jogosultságokkal;
- az Értekezleti Asszisztens modulazonosítója `meeting_assistant`;
- meghívott résztvevőnek és ideiglenes szerkesztőnek nem kell külön teljes licenc;
- tervezett `organizer`, `editor`, `participant` szerepkörök;
- következő MVP: egyszer használatos szerkesztői párosítókód, visszavonás és audit;
- teljes tenant- és előfizetési licencmotor csak a valós Teams-pilot után készül.

### Értekezleti Asszisztens – editor jogosultság MVP – 2026-07-21

- új `editor` szerepkör;
- ceruzaikonos szerkesztésátadás;
- 6 számjegyű, 10 perces, egyszer használatos párosítókód;
- hibás próbálkozási korlát és kódzárolás;
- visszavonható, grant-alapú editor-token;
- aktív szerkesztő kijelzése és helyi tokenmegőrzés;
- megosztott jegyzet, napirend, Joker-téma, feladat és melléklet korlátozott szerkesztése;
- privát adatok és szervezői műveletek szerveroldali védelme;
- szervezői visszavonás és editor kilépés;
- editor auditnapló;
- `meeting_assistant` pilot entitlement kapu;
- új 16 lépéses editor-folyamatteszt.

### Értekezleti Asszisztens editor biztonsági kiegészítés – 2026-07-22

- külön szervezői és résztvevői webes preview-token;
- a jobb oldali résztvevői panel szerveroldali privátadat-szűrése;
- e-mailhez kötött párosítókódnál kötelező pontos e-mail-egyezés;
- editor-folyamatteszt 17 ellenőrzési lépésre bővítve.

### Teams alkalmazáscsomag v0.1.6 - 2026-07-22

- javítva a 80 karaktert meghaladó rövid alkalmazásleírás;
- a pilothoz eltávolítva a még nem konfigurált RSC/Graph jogosultságok;
- új, Teams-feltöltésre előkészített ZIP és SHA-256 ellenőrzőösszeg készült.

### Teams-ügynök és átírás-integráció roadmap – 2026-07-22

- rögzítve a későbbi, csak olvasási DIMPRO Teams-ügynök MVP;
- rögzítve a Teams-átirat post-meeting Graph importja;
- rögzítve, hogy aktív meeting közbeni részleges Graph transcript jelenleg nem támogatott;
- tervezett Graph change notification, VTT-import, AI-összefoglaló és jóváhagyásos jegyzőkönyvi átemelés;
- szükséges Entra, `webApplicationInfo`, RSC és Teams Admin Center Transcript API beállítások dokumentálva.

### Értekezleti képmetsző és kép-/PDF-jelölő roadmap – 2026-07-22

- rögzítve a Teams-panelből indítható képernyő-/ablakrögzítés felhasználói engedélykéréssel;
- rögzítve a kép- és PDF-drag & drop, PDF-lapmetszés és dialogos szerkesztő;
- rögzítve az alap rajzi eszközök, cím, leírás, feltöltő és teljes audit metaadatai;
- a funkció a közös DIMPRO KépBOX / Képmetsző / DocumentViewer motorra épül;
- a jóváhagyott képek az automatikus Teams-átirattal együtt bevonhatók a DIMPRO webes AI-összefoglalóba;
- dokumentálva, hogy más résztvevő Teams-képernyőmegosztásának képpontjai közvetlenül nem olvashatók ki a meeting appból.

## 2026-07-22 – DIMPRO Értekezleti Mellékletszerkesztő v0.1.0

- A DIMPROVER meglévő canvas-alapú képszerkesztőjéből adaptált, külön értekezleti mellékletszerkesztő készült.
- Kép- és többoldalas PDF-forrás támogatott.
- Elkészült a képernyő/alkalmazásablak felhasználói engedéllyel történő rögzítése.
- Rajzi eszközök: toll, nyíl, téglalap, kör, szöveg, sorszámozott jelölő, kivágás, kijelölés, mozgatás, zoom, undo/redo.
- A szerkesztett kép külön JPG-ként, a rajzi adatok külön JSON-oldalkocsiként mentődnek.
- Új attachment metaadatok és auditnapló készültek.
- Az AI-kontekstus csak az `includeInAi` kapcsolóval kijelölt mellékleteket kapja meg.
- Új API: `POST /api/meeting-assistant/attachments/edited`.
- Részletes dokumentáció: `19_dimpro_ertekezleti_mellekletszerkeszto_v010.md`.

## 2026-07-22 – DIMPRO Értekezleti AI dokumentumműhely v0.2.0

- Elkészült a külön, teljes méretű webes AI dokumentumműhely.
- Bal oldali forráspanel, középső dokumentumszerkesztő és húzható/összecsukható jobb oldali AI-panel készült.
- Bevezetésre került a gyors, kiegyensúlyozott, prémium és audit modellszint.
- Tizenöt kézi AI-művelet érhető el előfeldolgozásra, dokumentumkészítésre, ellenőrzésre és finomításra.
- Minden futtatás előtt minimum, várható és maximális Ft-költség, valamint tokenbecslés jelenik meg.
- Prémium modellhez külön költségjóváhagyás szükséges.
- Az AI-eredmény nem írja felül automatikusan a dokumentumot; átemelhető, hozzáfűzhető vagy elvethető.
- A rendszerprompt kötelezően tiltja felelős, határidő, döntés és műszaki adat kitalálását.
- A dokumentumlogika támogatja a „Lényeg röviden” blokkokat és a korlátozott félkövér kiemelést.
- Az AI-használati napló v2 projekthez, értekezlethez, felhasználóhoz, modellhez, tokenhez, költséghez és futási eredményhez kapcsolt adatokat tárol.
- A Teams oldalsó panelen csak négy gyors AI-művelet marad; a teljes feldolgozás a webes munkatérben történik.
- Részletes dokumentáció: `20_dimpro_ertekezleti_ai_dokumentummuhely_v020.md`.

### AI dokumentumműhely v0.2.0 stabilitási kiegészítés – 2026-07-22

- tokenvédett `/teams/meeting-assistant/studio` teljes képernyős mélylink készült;
- művelet- és modellváltáskor az előző költségbecslés automatikusan érvénytelenné válik;
- futtatás csak az aktuális művelethez és modellszinthez tartozó friss becsléssel engedélyezett;
- 22 pontos böngészős teszt, valódi AI-futtatás és három regressziós tesztcsomag sikeresen lefutott;
- a lezárási regressziós teszt egyedi meetingazonosítót és automatikus takarítást kapott.

### Értekezleti adattárolás párhuzamos mentési javítása – 2026-07-22

- A workspace-, pairing-, editor-pairing-, projektprofil- és AI-napló mentései `randomUUID()` alapú egyedi ideiglenes fájlnevet kaptak.
- Megszűnt az azonos milliszekundumban induló mentések ideiglenes fájlnévütközési lehetősége.
- A javítás 30 egyidejű workspace-frissítéssel lett ellenőrizve: 30/30 sikeres.
- Rollback backup: `backups/meeting-atomic-write-20260722_211124`.

## 2026-07-22 – DIMPRO Értekezleti Kísérő közös mellékletek és Teams stage v0.1.7

- A webes DIMPRO-workspace és a tényleges Teams-meeting külön azonosítóval, de egy párosításban kapcsolódik össze.
- Megszűnt a Teams panel és a webes kétoldali értekezletvezető eltérő munkatérbe kerülésének lehetősége az új párosításoknál.
- A résztvevő kép- és fájlfeltöltés után egyértelmű „A szervező megkapta” visszajelzést kap.
- A szervező egy lépésben jóváhagyhatja és megoszthatja a mellékletet.
- A mellékletek egyoszlopos, kisméretű, lenyitható kártyaként jelennek meg.
- A megosztott kép alatti közös szöveget a résztvevők is szerkeszthetik.
- A mellékletszerkesztőt minden résztvevő megnyithatja, de rajzolni, képre írni és képmetszést készíteni kizárólag a szervező tud.
- A keskeny Teams-panel kompakt, mindig látható eszköztárat kapott.
- Rögzített alsó állapotsáv és jóváhagyásos szöveges megosztási workflow készült.
- Saját négyzetes Teams stage-megosztás gomb került a panel jobb alsó részére.
- A Teams alkalmazás rövid neve `DIMPRO Értekezleti Kísérő` lett.
- A panelen és a manifest leírásában megjelent az `info@dimpro.hu` és `admin@dimpro.hu` kapcsolati tájékoztatás.
- Új manifest-verzió: v0.1.7, `meetingStage`, RSC és custom share-to-stage beállításokkal.
- Új integrációs teszt: `scripts/test-meeting-collaboration-v017.cjs`.
- Részletes dokumentáció: `21_dimpro_ertekezleti_kozos_mellekletek_teams_v017.md`.

### v0.1.7 végső ellenőrzés és Teams-csomag – 2026-07-22

- Együttműködési API-integráció: 22/22 sikeres.
- Keskeny Teams-panel és széles stage böngészős teszt: 20/20 sikeres.
- Mellékletszerkesztő: 11/11; editor-jogosultság: 17/17; lezárás/archiválás: 16/16 sikeres.
- A v0.1.7 manifest a hivatalos Microsoft Teams v1.23 séma szerint érvényes.
- Elkészült a `DIMPRO_Ertekezleti_Kisero_Teams_App_v0_1_7.zip` telepítőcsomag.
- SHA-256: `5d55790e091ca15bcf95a2578fb2dac4f5f869f8c3badcc5236c9fb7d328aa3e`.

## 2026-07-23 – DIMPRO Értekezleti Kísérő v0.1.8

- Új, nagyméretű Információ és útmutató munkatér készült a felső ikonsor végén.
- A munkatér Felhasználói útmutató, Szerkesztői útmutató és Kapcsolat fület kapott.
- A funkciók gombonként lenyitható, nagyobb betűméretű kártyákon jelennek meg.
- A panel aljáról kikerült az állandó e-mail tájékoztató.
- Az info@dimpro.hu és admin@dimpro.hu gombok automatikusan kitöltött tárgymezőt és meetingazonosítót használnak.
- Az alsó vezérlés egyetlen minimális sorra csökkent: állapotjelző, négyzetes szövegküldő és négyzetes Teams-megosztás.
- A szövegbevitel külön popover kártyába került.
- A résztvevői gomb felirata: „Küldés a szervezőnek vagy szerkesztőnek”.
- A képernyőrögzítés külön nagy Teams URL-dialogba került.
- A capture útvonal szerveroldali szervezői tokenvédelmet kapott.
- Készült külső böngészős rögzítési tartalék Teams WebView-korlátozás esetére.
- A /ertekezleti-kisero kezdőoldal Új projekt létrehozó űrlapot kapott.
- Projekten belül új, részletes Új értekezlet létrehozó űrlap készült.
- Részletes dokumentáció: `22_dimpro_ertekezleti_kisero_utmutato_uj_projekt_capture_v018.md`.
- A megosztott Teams-stage teljes piros keretet, felső „Megosztott DIMPRO tartalom” címkét és jobb felső piros leállító X gombot kapott.
- A leállító gomb a Teams SDK `stopSharingAppContentToStage` műveletét használja.
- v0.1.8 végső teszt: 27/27 új UI és workflow ellenőrzés; 22/22 együttműködés; 11/11 mellékletszerkesztő; 17/17 szerkesztői jogosultság; 16/16 lezárás/archiválás.

## 2026-07-23 – DIMPRO Értekezleti Kísérő v0.1.9

- Dinamikus Élő követés készült a Teams side panel és meeting-stage között.
- A közös nézet követi a nyilvános modult, napirendi pontot, mellékletet és görgetési célpontot.
- A résztvevő Saját olvasás módban szüneteltetheti, majd folytathatja a követést.
- Külön, hatjegyű, egyszer használatos prezentációs vezérlőkód készült.
- A vezérlőkód opcionálisan privát e-mailben küldhető, és nem ad szerkesztési jogot.
- A szervező azonnal visszaveheti a közös nézet vezérlését.
- Kétsoros, fix alsó board készült élő dokumentum, követés, vezérlés, gyorsrögzítés, megosztás és biztonságos bezárás gombokkal.
- A gyors szöveges bejegyzés kötelező nevet, opcionális e-mailt és napirendi kapcsolatot kapott.
- Külön Szöveges bejegyzések modul készült moderálással és dokumentumba kerülési pipával.
- A teljes képernyős élő dokumentum megjeleníti a jóváhagyott szövegeket, fotókat és mellékleteket.
- Kézi VTT, DOCX, TXT és beillesztett átiratimport készült.
- Automatikus, védett Graph átirat- és attendance-artifact figyelő készült.
- Teams meghívott- és tényleges jelenléti import készült forrásjelöléssel és részvételi idővel.
- Külön Munkamenet biztonságos bezárása folyamat készült.
- A résztvevői exportból minden prezentációs és Graph belső azonosító eltávolításra került.
- Részletes dokumentáció: `23_dimpro_ertekezleti_elokovetes_atirat_jelenlet_v019.md`.
- v0.1.9 végső ellenőrzés: 34/34 új integráció, összesen 127/127 célzott és regressziós ellenőrzés sikeres.
- A tízpercenkénti, védett átirat- és attendance-artifact figyelő cronfeladata telepítve lett.
- A Microsoft Graph kapcsolat jelenleg nincs konfigurálva; a kézi átiratimport ettől függetlenül működik.
- Javítva a token nélküli capture útvonal Next.js route-manifest hibája; a zárolt oldal most 200-as tájékoztató nézetet ad.

## 2026-07-23 – DIMPRO Értekezleti Kísérő v0.1.10 hotfix

- Javítva az Új értekezlet létrehozása és megnyitása gomb token/meetingId eltérése.
- Az új meeting létrehozása után külön meetinghez kötött szervezői token készül.
- A napirendi sablon az új meetingtoken-nel töltődik be.
- A létrehozási hiba most közvetlenül a modalban jelenik meg.
- Az Értekezleti Kísérő a központi `ertesites@dimpro.hu` SMTP-profilt használja.
- Vezérlőkód és értekezleti dokumentum e-mail küldés központi DIMPRO e-mail motorra került.
- SMTP és létrehozási integráció: 7/7, bootstrap regresszió: 6/6 sikeres.

## 2026-07-23 – DIMPRO Értekezleti Kísérő v0.1.11

- Projektkártyákon megjelent a végleges törlés piros kuka gombja.
- Projekt törlésekor a kapcsolódó értekezletek, feltöltések, snapshotok és ideiglenes kódok is törlődnek.
- A DIMPRO Drive eredeti projektmappája és fájljai nem törlődnek.
- A kezdőoldali Korábbi értekezletek listában külön törlőgomb készült.
- A teljes `/ertekezletek` archívumban külön értekezlettörlés készült.
- A törlés pontos projekt- vagy értekezletnév beírásával erősíthető meg.
- Törlési auditnapló és törölt Drive-projekt rejtési lista készült.
- Projekt- és értekezlettörlési integráció: 12/12 sikeres.

## 2026-07-23 – DIMPRO Értekezleti Kísérő v0.1.12

- A projekt- és értekezlettörlés névbegépeléses megerősítése 3 másodperces nyomva tartásra változott.
- A törlőgomb élő visszaszámlálást és folyamatjelző sávot mutat.
- A nyomás megszakításakor a törlés azonnal visszaáll alaphelyzetbe.
- Egér-, érintés-, Enter- és Space-kezelés készült.
- A figyelmeztető ablak és a szerveroldali pontos névellenőrzés megmaradt.
- Nyomva tartásos komponensellenőrzés: 9/9 sikeres.

## 2026-07-23 – DIMPRO Értekezleti Asszisztens v0.1.13

- Bevezetve a `meetingMode: "teams" | "in_person"` adatmező és a `version: 8` munkatérmodell.
- Az új értekezlet létrehozása kétlépcsős: először Teams vagy személyes mód választandó.
- Személyes módban a Teams Graph, Entra, jelenléti és stage funkciók rejtve maradnak.
- Teams módban a Graph átiratimport és a Teams-funkciók megmaradtak; a saját DIMPRO hangátírás opcionális tartalék.
- A kézi VTT/DOCX/TXT import mindkét módban közös funkció.
- Elkészült a böngészős MediaRecorder mikrofonrögzítés, az eltelt idő, az elvetés és a leállítás utáni átírás.
- Elkészült a legfeljebb 500 MB-os streaming hang-/videófeltöltés és az FFmpeg-alapú 16 kHz/mono, 15 perces darabolás.
- Elkészült a külön Node háttérworker és a titkos kulccsal védett belső callback.
- Elkészült a beszélőkre bontott átirat, Beszélő A/B/C címkézés, valós név párosítás és címkeösszevonás.
- Elkészült az átiratsor szövegének, beszélőjének és megoszthatóságának szerkesztése, valamint a sortörlés.
- Elkészült a külön hozzájárulással menthető szervezeti hangprofil, az aktív/inaktív állapot, végleges törlés és auditnapló.
- A teljes forrásfelvétel, normalizált hang és chunkok alapértelmezetten törlődnek; a tartós referenciahang külön szervezeti profilban marad.
- Beépült az indítás előtti Ft-költségbecslés és az input/output tokenekből számított tényleges USD/Ft költség.
- Valódi, mesterséges kétbeszélős éles diarizálási E2E: 35/35 sikeres; 2 beszélő, 8 sor, 3,55685 Ft számított költség.
- Teams/személyes DOM-szétválasztás: 12/12 sikeres.
- MediaRecorder mesterséges mikrofonforrással: indítás, rögzítési állapot, időszámláló és elvetés sikeres.
- Korábbi releváns értekezleti regressziós csomagok: 10/10 sikeres.
- TypeScript: sikeres; ESLint: 0 hiba; production build és éles PM2 indítás: sikeres.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/26_dimpro_ertekezleti_sajat_hangatiras_v0113.md`.

## 2026-07-23 – DIMPRO Értekezleti Asszisztens v0.1.14

- Javítva az AI Dokumentumműhely DOCX/PDF exportja: most a középen látható aktuális AI-tervezetből készül, nem a hagyományos munkatér- és átiratexportból.
- Az export a még külön el nem mentett kézi szerkesztéseket is tartalmazza.
- Új AI-tervezet DOCX/PDF/HTML exportmotor készült alapvető címsor-, felsorolás- és félkövér formázással.
- A fájlnevek `AI-tervezet` jelölést kapnak.
- Az Értekezleti Asszisztens 8–13 px-es kezelőfelületi szövegei 11–15 px közötti, olvashatóbb méretre nőttek.
- A dokumentumelőnézet betűmérete változatlan maradt.
- A külön `/teams/meeting-assistant/studio` oldal megkapta a közös értekezleti témaburkot.
- DOCX/PDF tartalmi teszt: az AI-tervezet szerepel, az eltérő átiratjelölés nem szerepel.
- Böngészős mérés: segédszöveg 13 px, fejezetcím 14 px; dokumentumbekezdés változatlan 14 px, címsor 16 px.
- TypeScript és ESLint: 0 hiba; production build és végső HTTP-smoke sikeres; PM2 online.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/27_dimpro_ai_tervezet_export_tipografia_v0114.md`.

## 2026-07-24 – DIMPRO Értekezleti Asszisztens v0.1.15

- Elkészült az üres `aiMinutesDraft` automatikus helyreállítása a legutóbbi sikeres `draft_minutes` AI-előzményből.
- A mentett tervezet továbbra is elsőbbséget élvez; csak üres mentett tervezetnél történik visszatöltés.
- A visszatöltött tervezet megtekinthető, szerkeszthető és DOCX/PDF formátumban exportálható.
- A felület külön jelzi a helyreállítás tényét és az AI-eredmény időpontját.
- A tervezet kliensállapotai külön kezeltek: `saved`, `history`, `edited`, `empty`.
- Lezárt vagy közzétett értekezlet adatállapota nem módosul automatikusan; export újranyitás nélkül lehetséges, mentéshez szabályos újranyitás kell.
- A `fefw-1784824847953-1784824883221-f36pm` próbaértekezleten a 0 karakteres mentett tervezet helyett pontosan a 3435 karakteres AI-előzmény töltődött vissza.
- A valós helyreállított tervezetből 10 921 bájtos DOCX és háromoldalas, 72 789 bájtos PDF készült.
- Production build és PM2 újraindítás sikeres.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/28_dimpro_ai_tervezet_automatikus_visszatoltes_v0115.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.1 MVP

- új `/ingatlanfelmero` route;
- új `PropertySurveyPage` tabletes felmérési munkatér;
- új közös `SurveyFloorPlanEngine` SVG-alaprajzi motor;
- DIMPRO modulregiszter és dimpro.hu kezdőlapi modul-kártya;
- mobil/tablet/desktop reszponzív elrendezés;
- világos/sötét téma;
- helyi automatikus mentés, teljességellenőrzés és JSON export;
- LiDAR/RoomPlan és Bluetooth-lézer adapterpontok technikailag előkészítve, valós hardverkapcsolat nélkül.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.2 MVP

- A felmérési workflow új Hibák lépéssel bővült.
- Elkészült a koppintásos alaprajzi hibapont-felvétel.
- A hibapontok automatikus HJ-001, HJ-002 stb. sorszámot kapnak.
- A koordinátából automatikusan meghatározható a kapcsolódó helyiség.
- Elkészült az egyszerű hibajegy-adatlap szakág, súlyosság, státusz, leírás, dátum és rögzítő mezőkkel.
- Hibánként egy helyszíni vagy jelölt fotó kapcsolható, helyi képoptimalizálással.
- A hibapont áthelyezhető és törölhető.
- A közös `PlanHexMarker` és `PlanMarkerTypes` engine került felhasználásra; nem készült párhuzamos marker-motor.
- Az alaprajz keretén megjelent a 8 fő tájolás: É, ÉK, K, DK, D, DNy, Ny, ÉNy.
- Elkészült a felső alaprajzi oldal 8 irányú gyorsbeállítása.
- Külön WinWatt oldaltájolási blokk mutatja a felső, jobb, alsó és bal oldal égtáját és azimutját.
- A csúszka lenyitható finomhangolási eszközként maradt meg.
- A tájolási vezérlő az alaprajz alá került, ezért a teljes rajzfelület szabadon koppintható.
- JSON export séma: `dimpro.property-survey.v0.2`, hibajegyekkel és fotóelőnézettel.
- TypeScript és érintett ESLint: sikeres; production build: sikeres.
- HJ-001/HJ-002, fotó, áthelyezés, tájolás, WinWatt oldalak és responsive E2E: sikeres.
- Aktív build: `MGU91fxXemm0_SpcbPgPL`.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/30_dimpro_ingatlanfelmero_v02_hibafelvetel_tajolas.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.2.1

- Elkészült az Ingatlanfelmérő saját projektközpontja.
- Új projekt hozható létre projektkóddal, helyszínnel, megrendelővel és megjegyzéssel.
- Egy projekten belül több energetikai, felújítási, műszaki vagy gyors alaprajzi felmérés kezelhető.
- Új felmérés üres alaprajzzal vagy hét helyiséges mintafelméréssel indítható.
- A LiDAR/RoomPlan és PDF/kép import előkészített, de egyértelműen letiltott állapotban jelenik meg.
- Az üres alaprajzon húzással létrehozható az első helyiség.
- A rendszer automatikus helyiségnevet és kezdeti alapterületet készít.
- A korábbi egyfelméréses localStorage adat automatikusan a `Korábbi helyi felmérés` projektbe migrálódik.
- A tájolási blokk kompakt, 55 px magas eszközsávra változott.
- A rajztér desktopon 538 px magasra nőtt.
- A 8 gyors égtájgomb és a négy WinWatt oldaltájolás alapállapotban megmaradt.
- A pontos finomhangolás lenyitható, lebegő részletes panelbe került.
- JSON export séma: `dimpro.property-survey.v0.2.1`, projekt- és felmérésmetaadatokkal.
- Projekt/felmérés/üreslap/rajzolás/visszanyitás/migráció/tájolás/hibapont E2E: sikeres.
- Aktív build: `OzcvgQYBEfURuz9EXeCMT`.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/31_dimpro_ingatlanfelmero_v021_project_center_compact_orientation.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.2.2

- A helyiségek külön hossz-, keresztméret- és belmagasságmezőt kaptak.
- Az alapterület automatikusan a hossz × keresztméret alapján számolódik.
- A méret módosítása átméretezi az alaprajzi helyiségtéglalapot.
- A kijelölt helyiség vízszintes és függőleges méretvonalat kapott.
- A helyiség belsejében megjelenik a hossz × keresztméret, alapterület és belmagasság.
- A helyiségek közvetlenül megfoghatók és húzással mozgathatók.
- A helyiséghez kapcsolt HJ hibapont együtt mozog a helyiséggel.
- Elkészült a Bluetooth-lézeres mérésfogadó panel.
- Támogatott a Bluetooth billentyűzet-emulációs bevitel.
- Elkészült a `dimpro:property-survey-measurement` natív bridge eseményfogadó.
- A mérési forrás, időpont és eszköznév méretenként tárolható.
- A Web Bluetooth eszközválasztó támogatott böngészőn megnyitható, a gyártói protokoll külön adapterfeladat marad.
- JSON export séma: `dimpro.property-survey.v0.2.2`.
- Kézi 5,00 m hossz, Bluetooth 3,50 m keresztméret, 17,50 m² alapterület, bridge 2,85 m belmagasság és helyiség/HJ együttmozgatás E2E: sikeres.
- Aktív build: `XHJyumZkzA_EMat6DOl8f`.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/32_dimpro_ingatlanfelmero_v022_room_dimensions_bluetooth.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.3.0

- Elkészült az A4/A3/A2 papírméret-választó álló és fekvő elhelyezéssel.
- Elkészült az automatikus és kézi fizikai léptékkezelés.
- Túl nagy kézi léptéknél javaslat és lapvágási figyelmeztetés jelenik meg.
- Elkészült a pince–földszint–emelet hierarchia és a szintenkénti alaprajzi munkatér.
- A korábbi felmérések automatikusan Földszintre migrálódnak.
- Elkészült a szakaszolható falszakasz-adatmodell oldal, kezdőpont, hossz, határolás, faltípus és falvastagság mezőkkel.
- A rendszer automatikusan felismeri a részlegesen belső és részlegesen külső helyiségoldalakat.
- Elkészült a falszakasz kijelölés, felezés, összevonás és automatikus újraelemzés.
- A kézi szakaszhatár-módosítás hézagmentesen igazítja a szomszédos szakaszt.
- Elkészült a falhoz kötött ablak-, ajtó-, erkélyajtó- és garázskapu-kezelés.
- A nyílászáró tájolása és azimutja a falszakaszból és az északi szögből automatikusan számolódik.
- A nyílászárók grafikusan megjelennek a kiválasztott falon.
- A helyiségmozgatás, Bluetooth-mérés és HJ együttmozgatás az új laptranszformáció mellett is működik.
- JSON export séma: `dimpro.property-survey.v0.3.0`.
- Aktív build: `7u4ghjpCZ2oWcpy6uwvST`.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/33_dimpro_ingatlanfelmero_v030_multilevel_wall_opening.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.3.1

- Elkészült a helyiségmozgatást és méretváltoztatást folyamatosan követő dinamikus falmotor.
- A külső és belső falszakaszok minden geometriai változás után automatikusan újraszámolódnak.
- Az aktív szint teljes külső falhossza és a külső falszakaszok méretfeliratai élőben frissülnek.
- A kézzel beállított faltípus, falvastagság, megjegyzés és nyílászáró geometriai átfedés alapján megmarad.
- Elkészült a mágneses helyiségillesztés zöld segédvonallal, állapotjelzéssel és opcionális haptikus rezgéssel.
- A külső falszakasz kézzel ±10 cm-rel finomítható, hézagmentes szomszédos határmozgatással.
- Elkészült a közös 2 másodperces hosszú nyomásos mentés, helyiségtörlés és falszakasz-összevonás.
- Rövid nyomás vagy korai elengedés nem hajt végre veszélyes műveletet.
- Candidate és éles E2E: külső falhossz 20,00 m → 16,00 m, mágneses illesztés, ±10 cm, mentés, törlés és összevonás sikeres.
- Aktív build: `SfIvjW-iImmO4KwD68e-M`.
- Részletes dokumentáció: `DIMPROVER_PRODUCT_DOCS/34_dimpro_ingatlanfelmero_v031_dynamic_walls_magnetic_hold.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.4.0

- Javítva az egymásba metsző helyiségek falszakasz-besorolása.
- A fűtött–fűtött közös fal belső, a fűtött–fűtetlen közös fal fűtetlen térrel határos besorolást kap.
- Helyiségátfedés-figyelmeztetés készült.
- Helyiségenként padló-, fal- és mennyezeti burkolat rögzíthető.
- Elkészült az álmennyezet és a hasznos belmagasság számítása.
- Szerkeszthető, automatikus vagy kézi hőhatár készült.
- Lábazat-, fal-, padló- és födémrétegrend-adatmodell készült.
- A falvastagság arányosan jelenik meg az alaprajzon; a belső falak világosabbak.
- Az ajtó és az ablak külön felvételi műveletet és külön összesítést kapott.
- A nyílászáró közvetlenül végighúzható a kijelölt falszakaszon.
- Gépészeti berendezések helyiségben és alaprajzi pozícióval elhelyezhetők.
- Elkészült az F-001, F-002 stb. számozott alaprajzi fotópont és a helyiségkapcsolat.
- A korábbi fájlnévlista automatikusan fotópont-rekorddá migrálódik.
- Részletes dokumentáció: `35_dimpro_ingatlanfelmero_v040_energy_model_photos_mechanical.md`.

## 2026-07-27 – DIMPRO Ingatlanfelmérő v0.4.1

- Az Ingatlanfelmérő fotópontjai 0,58-as, hibapontjai 0,52-es modul-specifikus méretskálát kaptak.
- A közös markerkomponens más modulokban használt alapértelmezett mérete nem változott.
- Az Ingatlan munkalap címadatai külön irányítószám, település, utca és házszám mezőkre lettek bontva.
- Beépült a 3046 magyar irányítószámot és 3571 településkapcsolatot tartalmazó offline törzs.
- Egyértelmű irányítószámnál automatikus településkitöltés, több településnél választó működik.
- A teljes cím továbbra is automatikusan előáll az exporthoz és térképi kereséshez.
- A korábbi egymezős címek migrációja kezeli a perjeles házszámokat is.

## 2026-07-28 – DIMPRO Felmérő v0.5.0

- A modul fejlécneve DIMPRO Felmérőre változott.
- Új Épület- és csarnokfelmérés munkamód készült.
- Új Térbeton- és burkolatfelmérés munkamód készült.
- Az energetikai és ipari munkamódok saját lépéskészletet kapnak.
- Elkészült a valós méterkoordinátás, kalibrált ipari rajzi munkatér.
- Pillér felvétel, kijelölés, húzás, méret és alak szerkesztés készült.
- Szabadkézi repedésrajz és automatikus folyóméter-számítás készült.
- Szabálytalan, raszterezett hibás térbeton-poligon és m²-számítás készült.
- Egyéb szabadkézi vektoros jelölés készült.
- Elkészült az élő ipari mennyiségösszesítő.
- Elkészült a 6 réteges, milliméter egységű DXF export AutoCAD/Archicad továbbrajzoláshoz.
- Csarnokminta készült két 25,30 × 41,80 m-es épülettel, 48 pillérrel és térbetonjelölésekkel.
- Energetikai módban külön Hőhatár mérete és Hőhatár igazítása gyorsvezérlő készült.
- Részletes dokumentáció: `36_dimpro_felmero_v050_building_hall_freehand_dxf.md`.

## 2026-07-28 – DIMPRO Felmérő v0.5.1

- Elkészült a szabálytalan, poligonális épületkontúr rajzolása.
- Az épületkontúrok automatikus területet és ÉP-sorszámot kapnak.
- Szerkeszthetővé váltak az épület-, térbeton-, repedés- és szabadkézi vektorcsomópontok.
- A pillér- és csomópontmozgatás egyetlen tranzakciós Undo-lépés.
- Elkészült a 40 állapotos ipari Visszavonás / Ismétlés előzménytár.
- Kép és PDF első oldal tölthető be optimalizált rajzi háttérként.
- Beállítható a háttér láthatósága, erőssége és szürkeárnyalata.
- Elkészült a kétpontos, ismert távolság alapú háttérkalibrálás.
- A PDF.js `.mjs` worker statikus assetként elérhető.
- A térbeton DXF export valódi ANSI31 HATCH entitást készít.
- A négyszög pillérforgatás a DXF-geometriában is megjelenik.
- Javítva lett az ipari rajzeszközök rétegprioritása meglévő kontúr, hibajelölés és pillér fölött.
- A zárt poligonok duplikált kezdő-záró csomópontja automatikusan megszűnik.
- Részletes dokumentáció: `37_dimpro_felmero_v051_polygon_history_background_hatch.md`.

## 2026-07-28 – DIMPRO Felmérő v0.5.2

- Elkészült a háttér közvetlen húzása, méteres X/Y eltolása, forgatása és százalékos méretezése.
- Elkészült a háttértranszformáció alaphelyzetbe állítása és tranzakciós Undo/Redo kezelése.
- PDF háttérből legfeljebb az első 6 oldal tölthető be és váltható oldalanként.
- Elkészült az épület-, térbeton-, repedés- és szabadkézi csomópont beszúrása és törlése.
- A kijelölt csomópontok külön legfelső SVG-interakciós réteget kaptak.
- Elkészült a tengelyrácsra és derékszögre illesztés állítható méteres tűréssel.
- Elkészült a legfeljebb 400 pilléres automatikus pillérsor-generátor.
- Elkészült a részletes repedésadatlap súlyosság-, státusz-, szélesség-, mélység-, hely-, ok-, javítás- és statikai felülvizsgálati mezőkkel.
- A repedés legfontosabb metaadatai bekerülnek a DXF szövegrétegbe.
- A v0.5.1 mentések automatikus háttér-, snap- és repedésadat-migrációt kapnak.
- Részletes dokumentáció: `38_dimpro_felmero_v052_background_transform_multipage_snap_pillars.md`.

## 2026-07-28 – DIMPRO Felmérő v0.5.3

- Elkészült a valódi, teljes képernyős rajzi fókuszmód natív Fullscreen API és CSS fallback működéssel.
- A rajzmotor új `focusMode` megjelenítést kapott, amely kitölti a teljes tablet- és asztali képernyőt.
- Elkészült a bal oldali, összecsukott Felmérési lépések perempanel.
- Elkészült a jobb oldali, összecsukott Aktív munkalap perempanel.
- Egérrel képernyőszélre érve automatikus, érintéssel koppintásos panelnyitás működik.
- Mindkét panel külön rögzíthető és saját görgetést kapott.
- Elkészült a minimális lebegő gyorssáv mentéssel, témaváltással, panelkapcsolókkal, lap-/szintbeállítással és kilépéssel.
- A lap-, szint- és léptékbeállítás külön lebegő kártyára került.
- Javítva lett a gyors panelrögzítés állapotversenye és a tablet rétegütközés.
- Javítva lett az iPad szintetikus mouseleave miatti panel-visszacsukódás.
- Javítva lett a normál 390 px-es mobilnézet külső vízszintes overflow-ja.
- Részletes dokumentáció: `39_dimpro_felmero_v053_tablet_focus_workspace.md`.

## 2026-07-28 – DIMPRO Felmérő v0.6.0

- Az energetikai hőhatár a falmodell külső, fűtetlen és szomszédos határoló falszakaszait követi; a korábbi automatikus befoglaló téglalap megszűnt.
- A hőhatár munkamód szerint jelenik meg: energetikai módban elérhető, gyors alaprajzban és ipari módokban rejtett.
- Az általános alaprajzi munkatér nagy virtuális koordinátatérre váltott, ezért új helyiség a korábbi hőhatáron és fix modellkereten kívül is létrehozható.
- Új helyiség után a lap, a lépték, a falmodell és a hőhatár automatikusan újraszámolódik.
- A helyiségrajzolás pointerállapota ref-alapú stabilizálást kapott gyors egér-, toll- és érintőmozdulatokhoz.
- Elkészült a tételes helyiségátfedési hibajegyzék helyiségnevekkel, átfedő területtel, érintett falakkal és közvetlen kijelölőgombokkal.
- A szerkeszthető felmérési munkafájl `.dimpro` kiterjesztést és `dimpro.property-survey.v0.6.0` sémát kapott.
- Elkészült a `.dimpro` munkafájl visszanyitása és normalizált migrációja.
- Elkészült a közvetlen PDF-export A4, A3 és A2 lapméretben, álló és fekvő tájolással.
- Elkészült az energetikai és általános alaprajzi DXF-export helyiség-, fal-, nyílászáró-, hőhatár-, fotó-, hiba- és szövegrétegekkel.
- A teljes képernyős munkatér alján munkamód-függő, érintésbarát rajzeszköz-paletta készült.
- A részletes tájolás alaphelyzetben rejtett, teljes képernyőben a palettáról lebegő panelként nyitható.
- Elkészült az alsó türkizzöld állapot- és folyamatjelző sáv.
- A felület háromállapotú Világos / Sötét / SUN témát kapott; a SUN mód kültéri, erős napfényes használatra optimalizált.
- Részletes dokumentáció: `40_dimpro_felmero_v060_thermal_export_sun_workspace.md`.

## 2026-07-29 – DIMPRO Felmérő v0.6.1.3

- Elkészült a natív kétujjas pinch-zoom 45–400%-os tartományban.
- A pinch középpontját követő kétujjas pásztázás készült.
- Az egyujjas helyiségmozgatás alap- és nagyított nézetben is stabil lett.
- A rajzfelület `touch-action: none`, `overscroll-behavior: contain` és nem passzív `touchmove` védelmet kapott, ezért a rajzi gesztus nem görgeti el az oldalt.
- A képernyőpont–SVG koordináta-átváltás az aktuális képernyőmátrix alapján történik.
- A helyiségek x/y mozgatása nem indít automatikus teljesrajz-újraillesztést, ezért a koordinátarendszer húzás közben stabil marad.
- A `Teljes rajz` gomb továbbra is kézzel visszaállítja a 100%-os, középre rendezett nézetet.
- Tablet álló 834 × 1194 és fekvő 1194 × 834 érintésteszt sikeres.
- Kétujjas nagyítás 100%-ról 215%-ra, nagyítás utáni helyiségmozgatás és visszakicsinyítés sikeres; oldalelgördülés 0 px.
- Teljes v0.6.1 és v0.6.1.2 regresszió, valamint 13/13 candidate assetaudit sikeres.
- Végleges éles build: `Y2VYmPGILjMDzP-OxmxP-`; éles álló és fekvő tablet érintésteszt, valamint 13/13 assetaudit sikeres.
- Atomikus `.next` csere és PM2 restart sikeres; rollback: `.next_before_ingatlan_v0613_20260729_063151`.
- Részletes dokumentáció: `44_dimpro_felmero_v0613_tablet_gestures.md`.

## 2026-07-28 – DIMPRO Felmérő v0.6.1.2

- A rajzlap bal felső sarkából kikerült az ismétlődő papírméret-, fizikai lapméret- és léptékfelirat.
- A PDF szintoldalairól megszűnt a külön felső `FSZ - Földszint` cím és a projekt/felmérés alcím.
- A szint neve a rajzadat-fejlécbe került, ezért minden Földszint, Emelet és Pince lap egyértelműen azonosítható.
- A fejléc új mezői: Megrendelő és Rajzverzió.
- A rajzverzió a következő `.dimpro` projektverzió száma szerint jelenik meg, például `v001`.
- A fejléc felső sora: projekt, megrendelő, felmérés neve, rajzverzió.
- A fejléc alsó sora: szint, felmérés típusa, helyszín, dátum, készítő, lépték.
- Minden helyiségeket tartalmazó szintlap külön nyolcelemes rajzlapi jelmagyarázatot kapott.
- Minden szintlap külön fűtött, fűtetlen és összes alapterület-, valamint helyiségdarabszám-összesítőt kapott.
- A PDF fedlap kiegészült a megrendelő és a rajzverzió adataival.
- Végleges éles build: `C8wNPB74_gEqnaJ8lW3w2`; candidate és éles assetaudit 13/13; célzott és teljes v0.6.1 regresszió sikeres.
- Az atomikus `.next` csere, a PM2 restart és az éles célzott E2E sikeresen lezárult; rollback: `.next_before_ingatlan_v0612_20260728_221149`.
- Részletes dokumentáció: `43_dimpro_felmero_v0612_sheet_header_legend_area.md`.

## 2026-07-28 – DIMPRO Felmérő v0.6.1.1

- A fotókezelés kijelölésalapú lett: 12-nél több felmérési fotó tárolható, a WinWatt ZIP-be csak a külön bepipált képek kerülnek.
- A fotókategóriák a WinWatt három megnevezésére módosultak: épület, hőtermelő rendszer, hőleadó rendszer.
- Az új fotók alapértelmezetten nincsenek kijelölve; a 12 kép és 4 MB korlát csak a bepipált képekre vonatkozik.
- A rajzlap 5 mm-es türkízzöld belső keretet és A4 álló alapú, 200 × 34 mm-es kétsoros rajzadat-fejlécet kapott; hosszú adat esetén két sor használható.
- A fejléc A3 és A2 lapokon is azonos fizikai méretű marad, és a vektoros PDF-ben is megjelenik.
- A metszeti adatmodell padló- és födémvastagsággal bővült.
- Az alaprajzi belső falszakaszok metszetvonallal való keresztezése automatikusan megjelenik a metszeti előnézetben és a PDF-metszeten.
- Az északjel belső középvonalának északi végére diszkrét mini nyílhegy került.
- A mini nyíl a belső aszimmetrikus hexagonnal együtt fordul, ezért mindig ugyanabba az északi irányba mutat.
- A módosítás a közös SVG rajzban és a valódi vektoros PDF-kimenetben is megjelenik.
- A külön külső piros nyíl továbbra sem tért vissza.

## 2026-07-28 – DIMPRO Felmérő v0.6.1

- A rajzlap jobb felső sarkába állandó DIMPRO hexagon északjel került: a belső aszimmetrikus hexagon hegyes csúcsa mutatja az északi irányt, az `É` betű diszkrét, és nincs külön külső piros nyíl.
- Az északjel a közös SVG rajz része, ezért a vektoros PDF szintoldalain is megjelenik.
- A helyiségátfedési hibák hibánként összecsukott kártyaként jelennek meg, egyedileg nyithatók, és a geometria javítása után automatikusan eltűnnek.
- Új közös Metszet felmérési lépés készült minden energetikai, felújítási, műszaki, gyors, épület-, csarnok- és térbeton munkamódhoz.
- Alaprajzi húzással A-A, B-B stb. metszetvonal hozható létre.
- A metszet kezeli a padlószintet, belmagasságot, eresz-/felsősík- és gerincmagasságot, térdfalakat, tetőhajlást és ferde tetőablakot.
- A metszet törlése 2 másodperces folyamatos nyomva tartáshoz kötött; a rövid vagy megszakított nyomás nem töröl.
- A metszetek automatikus ABC-betűzése javítva: a második metszet `B-B`, a harmadik `C-C`, a sorozat `AA-AA` jelölésig folytatható.
- Új metszetrajzolási iránysegéd készült szabad, vízszintes és függőleges móddal; a tengelyzárt módok kizárják a véletlen néhány fokos ferdeséget.
- Az energetikai fotókezelés átalakult: a fotódokumentáció az elsődleges, a hibafotó másodlagos típus.
- A fotók automatikusan JPG-re optimalizálódnak legfeljebb 1600 px hosszabbik oldalra és 280 KB célméretre; az eredeti/optimalizált méret és pixelméret mentésre kerül.
- Beépült a 12 képes és 4 MB-os e-tanúsítási keret ellenőrzése, 3,5 MB-os előzetes figyelmeztetéssel.
- Elkészült a WinWatt fotócsomag ZIP szabványosított JPG fájlnevekkel, CSV fotójegyzékkel és README-vel, valamint a minden feltöltött képet tartalmazó külön ZIP.
- Az alaprajzi fotómarker dokumentációs marker lett; nem jelenít meg hibasúlyosságot vagy hibastátuszt.
- Elkészült a többoldalas teljes épület-PDF: fedlap, szintenkénti vektoros alaprajz, metszeti oldalak, jelmagyarázat és mérnöki aláírási blokk.
- A PDF alaprajzi kimenet valódi vektoros: a teszt-PDF oldalain 0 beágyazott képrajzolási művelet volt.
- Elkészült a külső/határoló fal bruttó felületének, a nyílászáró-levonásnak és a nettó falfelületnek a számítása.
- Elkészült a padló-, fűtött padló- és födémfelület összesítése.
- Elkészült a rétegrend vastagság- és lambda-adataiból számított U-érték; hiányos adatnál a rendszer nem talál ki eredményt.
- Elkészült a tájolásonkénti energetikai felületösszesítő.
- Elkészült a `dimpro.winwatt-compatible.v0.6.1` JSON és CSV előkészítő adatcsomag.
- A `.dimpro` munkafájl sémája `dimpro.property-survey.v0.6.1` lett, automatikus v001/v002 projektverziózással és verziómegjegyzéssel.
- Új hitelesített `POST /api/property-survey/drive-save` végpont készült a verziózott munkafájl DIMPRO Drive szerveres mentéséhez.
- Az általános és ipari DXF új `DIMPRO_SECTIONS` metszetréteget kapott; az ipari ANSI31 HATCH megmaradt.
- Candidate build, célzott ESLint, TypeScript, teljes E2E, assetaudit, desktop/tablet/iPad/mobil és ipari regresszió sikeres.
- Részletes dokumentáció: `42_dimpro_felmero_v061_section_vector_energy_export.md`.

## 2026-07-31 – DIMPRO rendszerstruktúra és szerverátalakítási térkép – INFRA 0.1.0

- Elkészült a védett `license.dimpro.hu/admin/dev/rendszerstruktura` működési oldal.
- Párosított jelenlegi–tervezett kártyák készültek szerverekhez, fejlesztési folyamathoz, adatbázishoz, tárhelyhez, domainekhez, belépési pontokhoz, termékekhez, e-mailhez és üzemeltetéshez.
- A bal oldal a jelenlegi működést, a jobb oldal a célállapotot mutatja.
- A tervezett elem sötétszürke, a folyamatban lévő türkiz, a külső lépésre váró borostyán, a teljesített cél zöld.
- Külön belépési térkép készült a DIMPRO Account, DIMPROVER, Drive, Drop, licencügyfél-portál, licencadmin és Fejlesztési Központ számára.
- Külön főcsoport készült a DIMPRO Licenc- és előfizetési rendszernek és a DIMPRO Dev Fejlesztési Központnak.
- A termékcsalád hierarchikusan felsorolja a DIMPRO mag, Drive, Drop, DIMPROVER, Desktop és Fájlműhely moduljait.
- A központi e-mail profilok célja és biztonságos élő SMTP-állapota megjelenik, titkok nélkül.
- A mai döntés szerint a jelenlegi PROD szerver Ubuntu 24.04 LTS marad; az új DEV és DATABASE VPS is Ubuntu 24.04 LTS rendszert kap.
- A Supabase csak saját PostgreSQL, migráció, párhuzamos teszt és rollback igazolása után vezethető ki.
- Részletes dokumentáció: `75_dimpro_rendszerstruktura_es_szerverterv.md`.

## 2026-07-31 – Fejlesztési és Licencközpont termékcsalád-hierarchia – DEV-CENTER 0.4

- Elkészült a DIMPRO, DIMPROVER, DIMPRO Drive / Drop és DIMPRO Fájlműhely központi összesítője.
- A központi összesítők alatt a modulok külön kártyán jelennek meg.
- A HAGE-INVEST Munkatér és más külső rendszerek külön projektcsoportba kerülnek.
- Minden projektkártya megjeleníti a projekt indulását és az utolsó fejlesztési munkát.
- A fejlesztési verziók mobilos leírásmezője teljes kártyaszélességű lett; mért szélességarány: 99,5%.
- A Licencközpont indítófelületén megjelent a termékcsaládok tömörített fejlesztési összesítője.
- A korábbi fejlesztési verziók automatikusan a DIMPRO, DIMPROVER, Drive/Drop vagy Fájlműhely központi projekthez sorolódnak.
- Az éles migráció eredménye: 6 projekt, 53 verzió és 51 munkamenet.
- TypeScript PASS; célzott ESLint 0 hiba; elkülönített webpack production build PASS; 61 standalone chunk.
- Candidate és éles desktop/mobil böngészőteszt PASS; 0 px overflow; PM2 online; új hibanapló 0 bájt.
- Éles build: `BfMfMLSEy65fMEMo-LovG`.
- Éles felület: `https://license.dimpro.hu/admin/dev`.
- Rendszerstruktúra: `https://license.dimpro.hu/admin/dev/rendszerstruktura`.

## 2026-07-31 – DIMPRO rendszerstruktúra témaszínek és fix navigáció – INFRA 0.1.1

- Saját szemantikus világos/sötét paletta készült a rendszerstruktúra oldalhoz.
- Javítva lett minden azonosított sötét háttér–sötét szöveg kontraszthiba.
- A tervezett, folyamatban lévő, külső lépésre váró és teljesített állapot külön kártya- és címkeszínt kapott.
- Asztalon és tableten 74 px felső pozícióban rögzített, aktuális szakaszt követő menü működik.
- Mobilon fix alsó dokk és hétpontos teljes menü működik.
- A 16 jelenlegi–tervezett összehasonlítási csoportból csak az első indul nyitva.
- A 15 termékmodul-csoport összecsukva indul.
- Candidate és éles desktop/tablet/mobil tesztek sikeresek; 0 px overflow, 0 konzolhiba.
- Vizsgált kontrasztarányok: 14,1:1–17,61:1.
- Éles build: `jnlouzeqjb9KKuwCUWyVI`.
- Rollback: `.next_before_infra_v011_20260731_200827`.
- Éles felület: `https://license.dimpro.hu/admin/dev/rendszerstruktura`.

## 2026-07-31 – Fejlesztési időbontás és licencdomain visszalépés – DEV-CENTER 0.5

- A fejlesztési időkimutatás külön kezeli a **Bruttó munkamenetet** és négy részidőt: Aktív fejlesztés, Build és teszt, Várakozás / blokkolás, Dokumentáció és kiadás.
- A Bruttó munkamenet félkövér, a részidők normál betűs megjelenést kaptak.
- Futó munkameneten belül időkategória váltható; a váltás automatikusan lezárja az előző időszegmenst és elindítja a következőt.
- Új API: `/api/dev/versions/[versionId]/time/category`.
- A korábbi lezárt munkamenetek nem kaptak becsült visszamenőleges bontást; „Korábbi, nem bontott idő” jelöléssel maradnak meg.
- A korábban nyitva maradt munkamenetek várakozó kategóriába kerültek, ezért nem növelik tovább az aktív fejlesztési időt.
- A teljes `license.dimpro.hu` felületen fix, útvonalhoz kötött, előzményfüggetlen Vissza gomb működik. A gomb nem használ böngésző-előzményt, ezért nem lépteti ki a felhasználót a licencadmin munkamenetből.
- A Fejlesztési Központ mobil alsó dokkja fölé külön pozicionálás készült: a candidate mérés 16 px szabad távolságot és 0 átfedést igazolt.
- Candidate és éles útvonalteszt sikeres; 8 licencdomain-oldal HTTP 200; 17/17 asset elérhető.
- TypeScript és célzott ESLint ellenőrzés sikeres; Nginx hibamentes; PM2 `dimprover` online; új PM2 hibanapló: 0 bájt.
- Éles build: `n-Bn5z4-meDrulu7EspI2`.
- Rollback: `.next_before_dev_center_v05b_20260731_212111`.
- Éles felület: `https://license.dimpro.hu/admin/dev`.

## 2026-07-31 – Fejlesztési verziótábla oszlopszétválasztás – DEV-CENTER 0.5.1

- Javítva lett a Fejlesztési verziók táblázatban a Ráfordított idő és a Frissítve / befejezve oszlop összemosódása.
- A hiba oka a kompakt időbontás 168 px-es minimumszélessége volt egy ennél keskenyebb cellában.
- Az időoszlop 13%-os, a dátumoszlop 10%-os, a műveleti oszlop 11%-os szélességet kapott.
- A táblázaton belüli kompakt időbontás `min-width: 0` és `width: 100%` szabállyal a saját celláján belül marad.
- A dátummező tördelhető lett, a futó időtípus-választó pedig a műveleti oszlop szélességéhez igazodik.
- Tíz asztali szélességi minta ellenőrzése sikeres: 920–2560 px, kényszerített oszlopátnyúlás 0 px.
- Candidate és éles CSS-asset ellenőrzés sikeres; az éles Fejlesztési Központ HTTP 200 választ ad.
- TypeScript és célzott ESLint ellenőrzés sikeres; Nginx hibamentes; PM2 `dimprover` online.
- Éles build: `-82vnB8_xDb2pFPCNdIXr`.
- Rollback: `.next_before_dev_center_v051_20260731_214757`.
- Éles felület: `https://license.dimpro.hu/admin/dev#verziok`.

## 2026-08-01 – Szerverállapot mobil/tablet navigációs hibajavítás

- Javítva a 768–1023 px közötti tablet nézet, ahol a nagyméretű felső sticky menü korábban kitakarta a felületet.
- 1024 px alatt egységes, Fejlesztési Központ-stílusú alsó navigáció jelenik meg.
- Az alsó tartalmi térköz safe-area támogatással megakadályozza a panelek eltakarását.

### Szerverállapot navigáció – kiadási eredmény

- A 360 px-es közös admin fejléc túlcsordulása is javítva.
- Candidate és éles responsive teszt: **10/10 PASS**, 360–1280 px között.
- Nincs vízszintes túlcsordulás; mobil/tablet nézetben 32 px tartalmi biztonsági hézag marad az alsó menü felett.
- Éles build: `y-A834azZYCsiqG8GqoHo`.
- Rollback: `.next_before_server_status_nav_final_20260801_120302`.

## 2026-08-01 – DIMPRO Projektkapu D6 Core – PROJEKTKAPU 0.1.0

- Elkészült a `projektkapu.dimpro.hu` elsődleges host és a `door.dimpro.hu` → `projektkapu.dimpro.hu` 301-es átirányítás.
- Közös TLS-tanúsítvány készült a két aldomainhez, automatikus megújítással.
- Létrejött a DOCK dashboard és mind a hat D6 modulútvonal magyar modulnevekkel.
- Elkészült a file-backed Project Core MVP: projekt, tagság, szerepkör, engedély, lifecycle és audit.
- Új projekt API-k: lista/létrehozás, projektadat/módosítás, dashboard, tagság és lifecycle.
- A DOCK dashboard projektadatai és auditaktivitása már a Project Core-ból érkezik.
- A projektlista valódi repository-adatokat tölt, és előkészített projektlétrehozási űrlapot kapott.
- A jóváhagyott világos/sötét arculat elkészült `#0798A6` türkiz, petrol és tompított zsályás-türkiz rendszerrel; a Projektkapu neon lime színt nem használ.
- A fejléc alacsony és sticky, a kártyák 8–10 px lekerekítésűek, a blueprint dekoráció visszafogott.
- A DIMPRO Drop forrása ebben a fejlesztési körben nem módosult.
- Részletes dokumentáció: `76_dimpro_projektkapu_d6_core.md`.


## 2026-08-01 – DIMPRO Drop private-pilot aktiválás – DROP 0.2.0

- A Supabase DROP 0.2.0 bootstrap sikeresen alkalmazva lett.
- Mind a hét kötelező Drop tábla és a hatmigrációs sémaverzió-jelölő elérhető.
- A központi release gate, a csomagmotor és a PIN/token hozzáférési kapu private-pilot módban aktiválva lett.
- Az admin csomaglétrehozási és csomaglista API, a nyilvános PIN-kapu és a tokenes megtekintési oldal éles végpontokon sikeresen tesztelve lett.
- A tesztcsomag, címzett, csoport, tokenek, auditpróbálkozások és események ellenőrzése sikeres; a tesztcsomag automatikusan törlődött.
- A licencadmin kezelőfelület: `https://license.dimpro.hu/drive/drop`.
- A valós kép-, fájl-, ZIP- és vegyes feltöltés, Object Storage, worker és PDF-riport továbbra is tiltott.
- Környezeti rollback: `backups/drop_v020_private_pilot_env_20260801_174930.env.local`.


## 2026-08-01 – DROP 0.2.0 hozzáférési linkkártya javítás

- Csomaglétrehozás után automatikus görgetés és űrlapbezárás készült.
- A PIN-es belépési oldal és a közvetlen megtekintési link kiemelten, magyar felirattal jelenik meg.
- Build: `4YnlBgL2eELxO87RF3zw5`.
- Éles smoke: 11/11 PASS; candidate és éles böngészőteszt: PASS.
- Rollback: `.next_before_drop_v020_link_ux_20260801_181909`.

## 2026-08-01 – DIMPRO Drop admin kártya, e-mail értesítés és 2 mp-es megerősítés – DROP 0.2.1 private-pilot

- A licencadmin indítóoldalon külön DIMPRO Drop fő kártya és a licenc-dashboardon állandó Drop csomagkezelő gomb készült.
- A Drive SMTP-profillal automatikus, címzettenkénti Drop meghívó e-mail működik.
- A levél tartalmazza a csomagkódot, PIN-t, lejáratot, PIN-es belépést és közvetlen megtekintési linket.
- Sikeres küldéskor `invitation_sent_at` és e-mail audit esemény készül; SMTP-hiba nem törli a csomagot.
- Elkészült a későbbi Storage-véglegesítéshez használható feltöltési értesítési szolgáltatás.
- Csomaglétrehozás, új link kiadása, token-visszavonás és visszafordíthatatlan állapotváltások 2 másodperces nyomva tartást igényelnek.
- A Drop veszélyes műveleteknél az egyszerű `window.confirm` megszűnt.
- Valódi Supabase + SMTP integráció, 11/11 acceptance, 11/11 éles smoke és éles böngészőteszt sikeres.
- Éles build: `a8vRNUE08vVsQx6HsAzAP`.
- Rollback: `.next_before_drop_email_hold_20260801_191621`.
- Éles kezelő: `https://license.dimpro.hu/drive/drop`.

## 2026-08-01 – DIMPRO Drop hozzáférési terek alapozása – DROP 0.3.0 staged

- Javítva lett az adminindító Drop kártya szövegkontrasztja világos és sötét módban.
- A kártya új megnevezése: **Drop hozzáférési tér**.
- Elkészült a licencgazda → Drop tér → tagságok → csomagok → projektkapcsolat domainmodell.
- A külső meghívottak külön fizetős licenc nélkül használhatják a térgazda licenckeretét.
- Öt szerepkör és 18 részletes jogosultság készült.
- A fizető licenc lejárata minden térlejárati módban felső korlát.
- Elkészült a Door/Dock projektkapcsolat és a másolat nélküli Drive-archiválás adatmodellje.
- Staged SQL készült négy új táblával és visszafelé kompatibilis `drop_packages` bővítéssel.
- Az SQL még nincs alkalmazva, a `DROP_SPACES_ENABLED` flag zárva maradt.
- DROP 0.3.0 preflight 4/4 PASS; meglévő DROP acceptance és éles smoke 11/11 PASS.
- Éles build: `o25oO2K7KLQKEwYb4Ix7V`.
- Rollback: `.next_before_drop_spaces_phase1_20260801_201938`.


## 2026-08-01 – DIMPRO Drop aktív hozzáférési térkezelő – DROP 0.3.0

- A DROP 0.3.0 Supabase migráció sikeresen alkalmazva lett.
- Aktiválva: `DROP_SPACES_ENABLED=true`.
- Elkészült a licencadmin-hitelesített térlista és térlétrehozó API.
- Az admin felületen 2 másodperces nyomva tartással hozható létre új Drop tér.
- A térrel együtt automatikusan létrejön az aktív tulajdonosi tagság és opcionálisan a projektkapcsolat.
- A térlista megjeleníti a licencalapú érvényességet, runtime módot, tag-, projekt-, csomag- és tárhelykeretet.
- A külső vendég továbbra sem igényel külön fizetős licencet.
- Valós Supabase-integráció, candidate API-integráció, 6/6 tér-preflight, 11/11 DROP acceptance, 11/11 éles smoke és böngészőteszt sikeres.
- Fájlfeltöltés és Object Storage továbbra is tiltott.
- Éles build: `IE8AbgSsaJrB5olBGmDiJ`.
- Rollback: `.next_before_drop_spaces_crud_20260801_211605`.
- Hardlinkes build-deduplikáció: 736,39 MiB megtakarítás.

## 2026-08-01 – DIMPRO Drop tagsági meghívás és vendégmunkatér – DROP 0.3.1

- Elkészült az e-mailes tértagsági meghívás és az egyszer használható elfogadólink.
- Újraküldéskor a korábbi meghívó automatikusan érvénytelenné válik.
- Elfogadás után Secure/HttpOnly/SameSite=Lax vendégmunkamenet indul.
- Elkészült a nyilvános meghívóoldal és a szerepköralapú vendégmunkatér.
- A közreműködő külön fizetős licenc nélkül használhatja a térgazda licenckeretét.
- Valódi SMTP-, Supabase-, API- és éles böngészőteszt sikeres.
- Éles build: `d-5x1MUMZDqkV9GbgE7dP`.
- Rollback: `.next_before_drop_v031_invites_20260801_214915`.

## 2026-08-01 – DIMPRO Drop saját tércsomag előkészítés – DROP 0.3.2 pre-SQL

- A meglévő atomi csomagmotor tér-, tagság- és kiválasztott tag megosztással bővült.
- Elkészült a vendégmunkatér csomaglistája és saját csomag létrehozópanelje.
- A feature flag és az API a DROP 0.3.2 SQL alkalmazásáig zárva marad.
- Pre-SQL preflight 6/6, meglévő acceptance 11/11, candidate smoke 11/11 PASS.
- Candidate build: `mnB5mJ6_3LW4lwj27yMER`.
- SQL: `supabase/DIMPRO_DROP_032_SPACE_PACKAGES_BOOTSTRAP.sql`.

## 2026-08-01 – DIMPRO Drop saját tércsomag-készítés – DROP 0.3.2

- A DROP 0.3.2 Supabase migráció aktiválta az atomi tércsomag-készítést.
- A közreműködő külön fizetős licenc nélkül saját csomagot készíthet a térgazda licencterében.
- A csomag megosztható minden aktív tértaggal, kiválasztott tagokkal vagy privátként.
- A létrehozó és a jogosultságok szerveroldali vendégsessionből származnak.
- A tér-, tagság-, szerepkör-, licencidő-, projekt- és csomaglimit egy tranzakcióban ellenőrződik.
- A PIN és a hozzáférési linkek egyszer jelennek meg; nyers hitelesítő adat nem kerül adatbázisba.
- Post-SQL preflight 7/7, legacy acceptance 11/11, candidate és éles smoke 11/11 PASS.
- Candidate és éles HTTPS böngészőteszt sikeres, fájlrekord nem jött létre.
- Éles build: `X9Jxtcs2lSP1Y6ynq6dKf`.
- Rollback: `.next_before_drop_v032_20260801_230325`.
- Valódi fájlfeltöltés továbbra is tiltott.

## 2026-08-01 – DIMPRO Drop privát Storage Core előkészítés – DROP 0.3.3 pre-SQL

- Elkészült a valódi, webrooton kívüli privát streaming tárhelyadapter.
- Elkészült a térsessiones és capability-linkes karanténfeltöltés.
- Elkészült az atomi kvótafoglalás, SHA-256, MIME- és ZIP-biztonsági ellenőrzés.
- Elkészült a többfájlos progress UI és a feltöltési e-mail-címzettkör.
- Víruskereső hiányában a fájlok letöltése és biztonságos kiadása tiltott marad.
- Pre-SQL preflight 7/7, candidate smoke 11/11 és böngészőteszt PASS.
- Candidate build: `LucQT03AEvrKCrs-08Psm`.
- SQL: `supabase/DIMPRO_DROP_033_PRIVATE_STORAGE_BOOTSTRAP.sql`.

## 2026-08-02 – DIMPRO Drop privát karanténfeltöltés – DROP 0.3.3

- Aktiválva lett a valódi, privát streaming fájlfeltöltés.
- A feltöltés tértagságból és közvetlen capability-linkből is működik.
- A fájlok SHA-256, MIME-, kiterjesztés- és ZIP-biztonsági ellenőrzés után karanténba kerülnek.
- A kvótafoglalás és a megszakított feltöltés visszagörgetése atomi.
- Víruskereső hiányában a fájlok nem tölthetők le és nem kerülnek kész állapotba.
- Az első éles limit 9 MB/fájl a Drop host 10 MB-os Nginx korlátja miatt.
- Post-SQL preflight 7/7, candidate/éles smoke 11/11 és éles HTTPS feltöltés PASS.
- Éles build: `CqdDLmk_TTMiuN1VGJLQo`.
- Rollback: `.next_before_drop_v033_20260802_003654`.

## 2026-08-02 – DIMPRO Drop nagyfájlos multipart előkészítés – DROP 0.3.4 pre-SQL

- Elkészült az 500 MB-os teljes fájlkorlát és a 64 MB-os darabolási modell.
- Elkészült a megszakítás után folytatható kliens- és szerveroldali feltöltés.
- A rendszer újrapróbáláskor csak a hiányzó részeket küldi újra.
- Elkészült a részenkénti SHA-256, az idempotens részkezelés, az összefűzés és a teljes SHA-256 ellenőrzés.
- Elkészült a Hetzner Object Storage S3-kompatibilis adapterének előkészítése.
- A Hetzner endpoint, bucket és kulcsok még nincsenek konfigurálva.
- A 0.3.4 feature flag és a multipart API a kézi SQL alkalmazásáig zárva marad.
- Pre-SQL preflight 7/7, candidate smoke 11/11, DROP 0.3.3 regresszió 7/7 PASS.
- Candidate build: `nDFH9It3S1XJ4NS7o4NHO`.
- SQL: `supabase/DIMPRO_DROP_034_RESUMABLE_MULTIPART_BOOTSTRAP.sql`.

## 2026-08-02 – DIMPRO Drop 500 MB-os folytatható multipart feltöltés – DROP 0.3.4

- A DROP 0.3.4 Supabase migráció aktiválta a folytatható multipart feltöltési modellt.
- A maximális fájlméret 9 MB-ról 500 MB-ra emelkedett.
- A böngésző a fájlt 64 MB-os részekre bontja, a Nginx kizárólag a részfeltöltési útvonalon 70 MB-ot enged.
- Megszakítás után ugyanazon fájl újbóli kiválasztásával csak a hiányzó részek töltődnek fel.
- A folytatási session legfeljebb 24 óráig él, de a csomag vagy meghívó korábbi lejárata felső korlát.
- Részenkénti és teljes SHA-256-, MIME-, kiterjesztés- és ZIP-biztonsági ellenőrzés működik.
- A Next.js Proxy 10 MB-os body-klónozása alól csak a pontos streaming részútvonal kapott kivételt; a route külön host-engedélylistát és bearer tokent követel.
- Elkészült a verziózott feltöltési szabályzat (`DIMPRO-DROP-UPLOAD-HU-1.0`) és a kötelező elfogadás.
- Elfogadás nélkül a fájlválasztás és a feltöltési session inicializálása is tiltott.
- Az elfogadás és a folytatáskor történő megerősítés auditnaplóba kerül.
- A felület rövid információs kártyákon mutatja a korlátot, folytathatóságot, hozzáférésvédelmet és megőrzést.
- A felület roadmap-jelzésként megjeleníti: „Hamarosan: akár 2 GB / fájl”.
- A Hetzner Object Storage S3-kompatibilis adapter előkészítve, de a tárhely még nincs bekötve.
- Víruskereső hiányában minden fájl privát karanténba kerül és nem tölthető le.
- Post-SQL preflight: 9/9 PASS; legacy regresszió: PASS; candidate és éles smoke: 11/11 PASS.
- Éles HTTPS + TLS + Nginx teszt: 65 MB fájl, 64 MB + 1 MB rész, megszakítás/folytatás és teljes SHA-256 PASS.
- Éles build: `6T1br1RsNy0bI7MGOb-UB`.
- Rollback: `.next_before_drop_v034_20260802_002440`.
- Fejlesztési / License Központ rekord: `version_9fd09863-b28`, állapot: `released`.


### 2026-08-02 – PROJEKTKAPU 0.1.0 – Hibrid projektmunkatér

- Elkészült az összecsukható bal projektmenü és keskeny ikonsáv mód.
- Elkészült az összecsukható, aktív modulhoz igazodó jobb projektkontextus-panel.
- A panelállapotok helyileg megmaradnak; bezáráskor nő a középső munkafelület.
- Tablet nézetben drawer, mobilon alapból zárt kontextuspanel és alsó D6 navigáció működik.
- Célzott ESLint, TypeScript és production build: PASS.
- API/route smoke: 10/10 PASS.
- Reszponzív világos/sötét és panel-interakciós ellenőrzés: 6/6 PASS.
- Buildazonosító: `94ppEE481KqDfMFQMWeOo`.
- Rollback: `.next_before_projectgate_hybrid_20260802_064417`.
- A DIMPRO Drop aktív forrása nem módosult.

## 2026-08-02 – PROJEKTKAPU 0.2.0 – PostgreSQL Project Core pre-SQL

- Repository façade és explicit `file` / `supabase` provider-választás.
- File-backed adapter megőrizve rollback célra.
- Supabase/PostgreSQL repository és séma-health elkészült.
- Öt védett Project Core tábla és öt tranzakciós RPC előkészítve.
- Licencadmin file-state bootstrap API elkészült.
- Fail-closed működés: hiányzó séma esetén Supabase provider 503, automatikus file fallback nélkül.
- SQL contract 19/19 PASS; pre-SQL integráció 10/10 PASS; ESLint, TypeScript és build PASS.
- Éles provider továbbra is `file`; kézi Supabase SQL futtatás szükséges.
- A DIMPRO Drop forrása nem változott.

### PROJEKTKAPU 0.2.0 pre-SQL kiadási pont

- Éles build: `lRoQwnfuoomK-LKmG8DaA`.
- Rollback: `.next_before_projectgate_v020_presql_20260802_071625`.
- Éles provider: `file` (változatlan).
- Éles HTTPS/API regresszió: 10/10 PASS.
- Következő kézi lépés: `supabase/project_core_v020_bootstrap.sql` futtatása a Supabase SQL Editorban.

## 2026-08-02 – PROJEKTKAPU 0.2.0 – Supabase Project Core aktiválva

- A Project Core 0.2.0 SQL sikeresen lefutott a Supabase-ben.
- Séma-health: 5/5 tábla PASS, sémajelző `0.2.0`, migration count `1`.
- File-state bootstrap: 1 projekt, 3 tagság és 1 eredeti auditbejegyzés átemelve.
- Projekt- és tagsági rekordegyezőség: PASS.
- Candidate Supabase tranzakciós teszt: 11/11 PASS.
- Éles Supabase provider teszt: 13/13 PASS.
- Az ideiglenes tesztprojektek automatikusan törlésre kerültek.
- Aktív provider: `supabase`.
- Környezeti rollback: `.env.local.before_project_core_supabase_20260802_085929`.
- Éles build: `lRoQwnfuoomK-LKmG8DaA`.
- A DIMPRO Drop forrása nem változott.

## 2026-08-02 – PROJEKTKAPU 0.3.0 – DRIVE Core pre-SQL

- Elkészült a PostgreSQL-alapú DRIVE Core repository.
- Új projektmappa-, dokumentum-, dokumentumverzió-, változáskurzor- és desktop szinkron API.
- A DRIVE modul tényleges, responsive dokumentumtár-munkaterületet kapott.
- A Project Core audit új DRIVE entitástípusokkal bővült.
- Tárolási mód: `METADATA_ONLY`; valós fájlfeltöltés letiltva.
- A legacy `/api/drive` és a DIMPRO Drop forrás változatlan.
- SQL contract 24/24 PASS; candidate API 13/13 PASS; vizuális ellenőrzés 4/4 PASS; célzott ESLint, TypeScript és production build PASS.
- Candidate build: `FcmPQ0sk4IunWJtjGAvsY`.
- Rollback: `.next_before_projectgate_drive_v030_20260802_093637`.
- Következő lépés: a `DIMPRO_PROJEKTKAPU_DRIVE_CORE_V030_BOOTSTRAP.sql` kézi Supabase-futtatása.

### PROJEKTKAPU 0.3.0 éles pre-SQL állapot

- Az éles Projektkapu buildje: `FcmPQ0sk4IunWJtjGAvsY`.
- Éles pre-SQL HTTPS/API smoke: 11/11 PASS.
- A DRIVE Core írási és olvasási műveletei a séma hiányában fail-closed módon 503 választ adnak.
- A felület hitelesített munkamenetben a kézi SQL-lépést jelzi, fájlírást nem enged.
- Dev Center: kézi SQL-futtatásig blokkolt, az időmérés leállítva.

### PROJEKTKAPU 0.3.0 – post-SQL aktiválás és conflict hotfix előkészítés

- A DRIVE Core `0.3.0` adatbázisséma sikeresen aktiválódott.
- A D6 projekt 10 alapmappája idempotensen létrejött.
- Candidate és éles elkülönített CRUD/verzió/szinkron teszt: 15/15 PASS mindkét környezetben.
- A tesztek minden ideiglenes projekt-, tagság-, audit-, mappa-, dokumentum-, verzió-, change-event és sync-cursor rekordot töröltek.
- PostgreSQL `40001` Supabase timeout ok feltárva.
- API-s verzióelőellenőrzés élesítve, elavult verziónál `409 Conflict`.
- Minimális adatbázis-hotfix elkészült: `DIMPRO_PROJEKTKAPU_DRIVE_CORE_V030_CONFLICT_HOTFIX.sql`.
- Éles build: `aARmb6-NbQ6kkS1PZaIZj`.
- Következő lépés: conflict-hotfix SQL kézi futtatása, majd közvetlen RPC ütközésteszt és végleges kiadás.

### PROJEKTKAPU 0.3.1 – olvashatósági tipográfia

- A `dimpro.hu` élő bemutatóoldal számított minimum betűmérete alapján a Projektkapu abszolút minimuma 12 px lett.
- A túl kicsi 7–11 px-es feliratok megszűntek a projektlistában és a közös Projektkapu modul-shellben.
- Az általános leíró szövegek jellemzően 14 px-re, az űrlap- és listaelemek 12–13 px-re nőttek.
- Érintett modulok: DOCK, DRIVE, DROP, DIALOG, DECIDE, DIARY.
- Statikus CSS minimum-audit: PASS.
- Célzott ESLint és TypeScript: PASS.
- Production build: PASS.
- Számított böngészős audit projektlista + 6 modul × desktop/tablet/mobil: 21/21 PASS.
- Legkisebb megfigyelt betűméret: 12 px.
- Oldal-szintű vízszintes túlcsordulás: nincs.
- Build: `MtxrFuo2ZJgmg0S7we12s`.
- Rollback: `.next_before_projectgate_typography_v031_20260802_115210`.

### PROJEKTKAPU 0.4.0 – DRIVE privát objektumtárhely, pre-SQL

- Külön Object Storage réteg készült a stabil DRIVE Core 0.3.0 fölé.
- Rövid életű signed PUT/GET URL, Project Core jogosultság és szerveroldali tárhelytitok-kezelés.
- Feltöltési munkamenet, pontos méretellenőrzés, atomikus dokumentum-/verzió-véglegesítés, audit és takarítás.
- Tárolási módok: disabled, quarantine, active.
- Új webes feltöltőhely és dokumentumonkénti letöltési művelet.
- Drive Desktop 0.4.0 kézi szinkron API-szerződés.
- A tárhely-séma és S3-konfiguráció hiányában csak a fájlbájt-műveletek záródnak le; a mappa- és metaadatmotor működik.
- SQL/API szerződés: 29/29 PASS.
- Pre-SQL API: 8/8 PASS.
- DRIVE Core regresszió: 15/15 PASS.
- Tipográfiai audit: 21/21 PASS, minimum 12 px.
- Object Storage vizuális audit: 4/4 PASS.
- Candidate build: `NLd9YjuDlnE-7mgzGLwbo`.
- Rollback: `.next_before_projectgate_drive_v040_20260802_122014`.
- Következő lépés: `DIMPRO_PROJEKTKAPU_DRIVE_OBJECT_STORAGE_V040_BOOTSTRAP.sql` futtatása.

### PROJEKTKAPU 0.4.0 – post-SQL állapot és tárhelyaktiválási kapu

- Object Storage 0.4.0 PostgreSQL-séma aktív.
- Izolált adatbázis/RPC integráció: 20/20 PASS.
- Health állapot pontosítva: SQL kész, külön privát S3-konfiguráció szükséges.
- Drive Desktop szerződés: `storage-config-required`, adatbázisséma `active-0.4.0`.
- Szerveroldali bucket preflight készült írás–olvasás–checksum–törlés teszttel.
- Candidate API: 8/8 PASS.
- Candidate DRIVE Core regresszió: 15/15 PASS.
- Candidate Object Storage vizuális teszt: 4/4 PASS.
- Candidate Projektkapu tipográfia: 21/21 PASS, minimum 12 px.
- Candidate build: `iRuPjYutaXIPYKp3-80w2`.
- Rollback: `.next_before_projectgate_drive_v040_postsql_20260802_124557`.
- A fájlbájt-feltöltés és letöltés privát tárhelykonfiguráció hiányában továbbra is fail-closed.

### PROJEKTKAPU 0.4.1 – DRIVE Quarantine Review, pre-SQL

- Új `document.approve` jogosultság OWNER, PROJECT_MANAGER és REVIEWER szerepkörhöz.
- Karanténverzió auditálható APPROVE/REJECT döntése.
- Elutasításhoz kötelező indoklás.
- Tartós, újrapróbálható objektumtakarítási feladat.
- Review és cleanup API, health állapot és Drive Desktop szerződés.
- Review állapotkártya, verzióstátusz és jóváhagyás/elutasítás művelet a DRIVE felületen.
- SQL/API szerződés: 29/29 PASS.
- Candidate API: 8/8 PASS.
- DRIVE Core regresszió: 15/15 PASS.
- Vizuális audit: 4/4 PASS.
- Projektkapu tipográfia: 21/21 PASS, minimum 12 px.
- Build: `_6_2LE4-r3SXAzNY9YOYm`.
- Rollback: `.next_before_projectgate_drive_v041_errorcode_20260802_131506`.

### PROJEKTKAPU 0.4.1 – Quarantine Review post-SQL

- A `drive-quarantine-review` 0.4.1 séma aktív.
- Review/RPC/API integráció: 16/16 PASS.
- Jóváhagyás, elutasítás, idempotencia, audit és cleanup újrapróbálás igazolva.
- Drive Desktop szerződés: `active-0.4.1`.
- Cleanup végrehajtás külön privát tárhely-konfigurációig zárt.

### DRIVE tárhelyaktiválás elhalasztva

- A PROJEKTKAPU DRIVE 0.4.0–0.4.1 kód-, adatbázis-, review- és cleanup-rétege elkészült.
- A külön privát S3-kompatibilis bucket és hozzáférési kulcs aktiválása későbbi fejlesztési körre halasztva.
- Néhány további Projektkapu-fejlesztés után ismét döntést kell kérni arról, hogy indulhat-e a tárhelyaktiválás és a valós fájlbájt-teszt.

### PROJEKTKAPU 0.5.0 – Project Calendar Core, pre-SQL

- Közös, projektazonosítóra épülő naptár- és határidőmotor a DOCK számára.
- DIALOG, DECIDE, DIARY és DRIVE forráskapcsolat előkészítve.
- Új `calendar.read` és `calendar.write` jogosultságok.
- Hat eseménytípus, négy prioritás és auditált állapotműveletek.
- Optimista verzióvédelem és aktív forrásügy-duplikáció elleni védelem.
- Heti nézet, 90 napos közelgő lista, szűrők és eseményűrlap.
- SQL/API/UI szerződés: 58/58 PASS.
- Candidate API: 10/10 PASS.
- DRIVE regresszió: 15/15 PASS.
- Vizuális audit: 4/4 PASS.
- Tipográfia: 21/21 PASS, minimum 12 px.
- Build: `50gMYrXlP48Oyi9coWiYP`.
- Rollback: `.next_before_projectgate_calendar_v050_20260802_140202`.

### PROJEKTKAPU 0.5.0 – Project Calendar Core, post-SQL candidate

- Project Calendar Core 0.5.0 séma aktív.
- Teljes esemény-életciklus, forrásduplikáció-védelem, optimista verzióütközés, teljesítés és visszavonás tesztelve.
- OWNER és CONTRIBUTOR írhat; REVIEWER és VIEWER csak olvashat.
- ISO 8601 szerinti naptári hét nagy, diszkrét számkártyán jelenik meg.
- Hét-szám: desktop/tablet 38 px, mobil 34 px.
- Integráció: 23/23 PASS; API: 10/10 PASS; vizuális audit: 4/4 PASS; tipográfia: 21/21 PASS; DRIVE regresszió: 15/15 PASS.
- Build: `-r06pfwgP5m7mZXcmm6BJ`.
- Rollback: `.next_before_projectgate_calendar_v050_postsql_20260802_150002`.

### PROJEKTKAPU 0.6.0 – DIALOG Communication Core, pre-SQL

- Szakági kérdés, adatkérés, tervészrevétel, kooperációs pont és döntési napló témakártyák.
- Projektenkénti automatikus sorszám, például `RFI-2026-0001`.
- Felelős, résztvevők, szakág, prioritás, dokumentumkapcsolat és válaszadási határidő.
- Automatikus DIALOG → Project Calendar határidőszinkron.
- Auditált hozzászólásfolyam és verzióütközés-védelem.
- Kétpaneles responsive DIALOG munkatér.
- A naptárfejléc új formája: `31. hét | 2026. július 27. – augusztus 02.` egyetlen keretben.
- Hétfelirat: desktop/tablet 23 px, mobil 20 px; külön `NAPTÁRI HÉT` szöveg nélkül.
- SQL/API/UI szerződés: 76/76 PASS.
- Candidate API: 10/10 PASS.
- DIALOG vizuális audit: 4/4 PASS.
- Naptárfejléc audit: 4/4 PASS.
- Tipográfia: 21/21 PASS, minimum 12 px.
- DRIVE regresszió: 15/15 PASS.
- Build: `7qBPqVXVfuk9-mkjJRuo-`.
- Rollback: `.next_before_projectgate_dialog_v060_20260802_152702`.

### PROJEKTKAPU 0.6.0 – DIALOG Communication Core, kiadva

- A DIALOG 0.6.0 adatbázisséma aktív.
- Projektenkénti RFI/ADR/TER/EGY/DNT sorszámozás működik.
- Témakártya-, hozzászólás-, állapot-, verzió-, audit- és Project Calendar-szinkron működik.
- OWNER, PROJECT_MANAGER, CONTRIBUTOR és REVIEWER írhat; VIEWER csak olvashat.
- Integráció: 27/27 PASS; API: 10/10 PASS; aktív vizuális audit: 4/4 PASS.
- Naptárfejléc: `31. hét | 2026. július 27. – augusztus 02.` egyetlen keretben.
- Projektkapu tipográfia: 21/21 PASS; DRIVE regresszió: 15/15 PASS.
- Build: `7qBPqVXVfuk9-mkjJRuo-`.
- Rollback: `.next_before_projectgate_dialog_v060_20260802_152702`.

### PROJEKTKAPU 0.7.0 – DECIDE Workflow Core, pre-SQL

- Terv-, termékkiváltási, költség-, határidő- és műszaki döntési kérelmek.
- Projektenkénti `DEC-ÉÉÉÉ-NNNN` sorszámozás.
- Soros és párhuzamos `ALL`/`ANY` jóváhagyási szakaszok.
- Kijelölt jóváhagyó és aktuális szakasz adatbázis-szintű ellenőrzése.
- Jóváhagyás, elutasítás és kötelező indoklásos módosításkérés.
- Költség- és határidőhatás, dokumentum- és DIALOG-kapcsolat.
- Project Calendar határidő- és állapotszinkron.
- Auditált döntési megjegyzések.
- Responsive kétpaneles DECIDE munkatér.
- SQL/API/UI szerződés: 82/82 PASS.
- Candidate API: 12/12 PASS.
- DECIDE vizuális audit: 4/4 PASS.
- DIALOG integráció: 27/27 PASS.
- Naptárfejléc audit: 4/4 PASS.
- Tipográfia: 21/21 PASS; DRIVE regresszió: 15/15 PASS.
- Build: `li4-q_9LK3roC-1Ah_YGo`.
- Rollback: `.next_before_projectgate_decide_v070_20260802_162314`.

### PROJEKTKAPU 0.7.0 – DECIDE Workflow Core, kiadva

- A DECIDE 0.7.0 adatbázisséma aktív.
- Projektenkénti `DEC-ÉÉÉÉ-NNNN` sorszámozás működik.
- Soros és párhuzamos `ALL`/`ANY` jóváhagyási szakaszok működnek.
- A rendszer ellenőrzi a projektjogosultságot, a kijelölt jóváhagyót és az aktuális szakaszt.
- Jóváhagyás, elutasítás, módosításkérés, visszavonás és verzióütközés-védelem működik.
- Költség-, határidő-, dokumentum-, DIALOG-, Project Calendar- és auditkapcsolat aktív.
- Integráció: 36/36 PASS; API: 13/13 PASS; aktív vizuális audit: 4/4 PASS.
- DIALOG integráció: 27/27 PASS; naptárfejléc: 4/4 PASS.
- Projektkapu tipográfia: 21/21 PASS; DRIVE regresszió: 15/15 PASS.
- Build: `li4-q_9LK3roC-1Ah_YGo`.
- Rollback: `.next_before_projectgate_decide_v070_20260802_162314`.

### PROJEKTKAPU 0.8.0 – DIARY Project Log Core, pre-SQL

- Napi projektnaplók projektenként és dátumonként egyedi bejegyzéssel.
- Projektenkénti, évenkénti `NAP-ÉÉÉÉ-NNNN` sorszámozás.
- Időjárás, hőmérséklet, létszám, munkavégzés, akadály, munkavédelem és ellenőrzés.
- Automatikus `NAP-.../E-NNN` eseménykód.
- Események felelőssel, súlyossággal, határidővel, dokumentum-, DIALOG- és DECIDE-kapcsolattal.
- Project Calendar eseményszinkron.
- Külön `diary.close` vezetői jogosultság.
- Auditált létrehozás, módosítás, lezárás, visszavonás és eseménymegoldás.
- Nem helyettesíti a hivatalos e-építési naplót.
- Szerződés: 89/89 PASS; API: 14/14 PASS; vizuális audit: 4/4 PASS.
- DIALOG: 27/27; DECIDE: 36/36; naptárfejléc: 4/4; tipográfia: 21/21; DRIVE: 15/15.
- `/account/modules` átirányítás változatlanul PASS.
- Build: `0aKwUFQl39FnPH3yPi9_A`.
- Rollback: `.next_before_projectgate_diary_v080_20260802_195716`.

### Projektkapu `/account/modules` átirányítási hotfix

- A `projektkapu.dimpro.hu/account/modules` többé nem íródik át nem létező `/projektkapu/account/modules` útvonalra.
- Kanonikus átirányítás: HTTP 307 → `https://projektkapu.dimpro.hu/`.
- Hitelesített gyökéroldal: HTTP 200.
- Hotfix build: `bukfsXs9u3Z03oZcKRXrF`; a javítás a DIARY 0.8.0 buildben is megmaradt.

### PROJEKTKAPU 0.8.0 – DIARY Project Log Core, kiadva

- A DIARY 0.8.0 PostgreSQL-séma aktív.
- Működik a projektenkénti `NAP-ÉÉÉÉ-NNNN` napi sorszámozás és a projektenkénti dátumegyediség.
- Működik az időjárás-, hőmérséklet-, létszám-, munkavégzés-, akadály-, munkavédelmi és ellenőrzési adatkezelés.
- Működik a `NAP-.../E-NNN` eseménykód, a felelős, súlyosság, határidő, dokumentum-, DIALOG- és DECIDE-kapcsolat.
- Működik a Project Calendar szinkron, a verzióütközés-védelem, az eseménymegoldás, visszavonás és vezetői lezárás.
- OWNER és PROJECT_MANAGER zárhat, CONTRIBUTOR írhat, REVIEWER és VIEWER csak olvashat.
- A felület állandóan jelzi, hogy nem helyettesíti a hivatalos e-építési naplót.
- Integráció: 39/39 PASS; API: 14/14 PASS; vizuális audit: 4/4 PASS.
- DIALOG: 27/27; DECIDE: 36/36; naptárfejléc: 4/4; tipográfia: 21/21; DRIVE: 15/15.
- Build: `0aKwUFQl39FnPH3yPi9_A`.
- Rollback: `.next_before_projectgate_diary_v080_20260802_195716`.

### PROJEKTKAPU 0.8.1 – DRIVE Private S3 Activation, előkészítés

- Elkészült az interaktív, rejtett secretbevitelt használó S3-konfiguráló.
- Elkészült a `.env.local` 600-as jogosultságú mentése és a korlátozott rollback-eszköz.
- Elkészült a bucket HEAD/PUT/HEAD/GET/checksum/DELETE preflight.
- Elkészült a Projektkapu-originre korlátozott PUT/GET/HEAD CORS beállítás és visszaolvasás.
- Elkészült a titokmentes readiness jelentés.
- A három Hetzner végpont VPS-ről mért teljes TLS ideje alapján `fsn1` az alapértelmezett.
- A DRIVE külön bucketet és külön credentialt kap; a DROP tárhelyét nem használja.
- Provideroldali külön privát bucket és S3 credential még szükséges.

### PROJEKTKAPU 0.8.1 – DRIVE Private S3 Quarantine Pilot

- A külön Hetzner Object Storage bucket és szerveroldali credential konfigurálva.
- Bucket preflight: HEAD/PUT/HEAD/GET/checksum/DELETE PASS.
- CORS kizárólag a Projektkapu originre beállítva.
- A DRIVE `quarantine` módban működik: feltöltés engedélyezett, letöltés globálisan tiltott.
- Valós signed PUT → HEAD → atomikus véglegesítés → review → cleanup E2E: 31 ellenőrzés PASS.
- APPROVE és REJECT ág fizikailag is ellenőrzött.
- S3- és adatbázis-tesztadatok teljesen törölve, D6 tiszta.
- Az `active` letöltési mód vírusellenőrző/biztonsági gate mögött marad.

### DROP 0.4.0 – Private S3 Storage Core, pre-SQL

- Elkészült a DROP és DRIVE credential-izoláció.
- Elkészült a közvetlen böngésző–S3 multipart feltöltés signed part URL-lel.
- Partonként Web Crypto SHA-256 és szerveroldali ListParts/ETag/méretellenőrzés működik.
- A végleges integritás `PART_MANIFEST_SHA256`; nem kerül hamis teljes fájl-SHA a nyilvántartásba.
- Elkészült az idempotens S3 complete utáni újrapróbálás és a véglegesített fájl cancel-védelme.
- Elkészült a tartós DELETE_OBJECT / ABORT_MULTIPART cleanup-sor.
- A 0.3.4 helyi adapter, 65 MB-os megszakítás/folytatás és karantén regressziója sikeres.
- Statikus szerződés 70/70 PASS, lint és TypeScript PASS.
- Az SQL és a külön DROP bucket/credential még kézi aktiválási lépés.

### DROP 0.4.0 – post-SQL ellenőrzés

- A DROP 0.4.0 migráció sikeresen telepítve.
- Aktív az integritásmanifest és a tartós objektumtakarítás adatmodellje.
- Repository/RPC integráció 12/12 PASS.
- Anon RLS és RPC jogosultságvédelem PASS.
- Aktív 0.4.0 sémával a helyi 65 MB-os HTTPS multipart regresszió PASS.
- A külön DROP Hetzner bucket és credential még kézi aktiválásra vár.

### DROP 0.4.0 – Hetzner S3 quarantine pilot kiadva

- Külön DROP bucket és külön credential aktív.
- DRIVE credential újrahasználata runtime szinten tiltott.
- Valós 65 MB-os, két részes signed multipart feltöltés sikeres.
- Resume, ETag, part SHA-256, HEAD, manifest-integritás, karantén, cleanup és abort sikeres.
- Tesztobjektum-, multipart- és adatbázis-maradvány: 0.
- Public download továbbra is tiltott; `active` mód nincs engedélyezve.

### DROP 0.5.0 – Malware Scan, Retention Worker és Biztonságos Letöltés, pre-SQL

- ClamAV 1.5.3 `INSTREAM` motor és automatikus definíciófrissítés telepítve.
- Clean és EICAR streamteszt sikeres.
- Teljes fájl SHA-256, bérelt worker queue és fertőzött objektum tartós törlése elkészült.
- Retention worker a végleges PDF-riport kiküldéséig blokkolja a fizikai törlést.
- Tokenhez, csomaglejárathoz és clean állapothoz kötött signed download kapu elkészült.
- Worker nyilvános hoston 404, localhoston secret nélkül 401, pre-SQL állapotban secrettel 503.
- Pre-SQL szerződés 86/86 PASS, TypeScript és ESLint PASS.
- Candidate build: `zqRWYKjKkFpxQl7Yr_dEl`.
- Projektkapu buildközi chunkhibája helyreállítva; kötelező elkülönített build és atomikus deploy szabály dokumentálva.
- A systemd worker timer az SQL és a valós post-SQL tesztekig kikapcsolva marad.

### DROP 0.5.0 – végleges éles kiadás

- Végleges build: `MytO_BxO69Vg1bSK-VX99`.
- Aktív release: `.next-v050-release-final`.
- DROP 0.5.0 séma, `active` S3 mód, ClamAV és biztonságos signed download élesítve.
- Valós clean és EICAR S3 E2E, objektumtörlés, teljes fájl-SHA-256, letöltési audit és retention riportkapu PASS.
- Adatbázis- és S3-tesztmaradvány: 0.
- Systemd worker timer engedélyezve; kézi és első időzített ciklus PASS.
- Projektkapu, DROP, statikus asset, PM2, Nginx és 12 pontos HTTP/API regresszió PASS.
- Release-pointeres, elkülönített build/deploy és dokumentált rollback működik.


### IDENTITY CORE 0.1.0 – live Supabase aktiválás és acceptance

- Root-only közvetlen PostgreSQL/Supabase admin kapcsolat beállítva a VPS-en; DB-jelszó nem kerül a repóba vagy `.env.local`-ba.
- Migráció előtti `public` séma custom dump és schema-only mentés SHA-256 ellenőrzéssel elkészült.
- A háromlépcsős `DIMPRO_IDENTITY_CORE_V010_BOOTSTRAP.sql` live Supabase-ben PASS.
- Preflight: 12/12 központi tábla elérhető, `ready: true`, schema marker `migration_count=3`.
- Live SQL acceptance: 24/24 PASS, a tesztadatok `ROLLBACK`-kel eltávolítva.
- Legacy account/company/membership/subscription/product-access híd 1/1 PASS; Project Core projekt bridge 2/2 PASS.
- A 4 demo Project Core tagság szöveges demo user ID miatt szándékosan nincs automatikusan kanonikus userhez kötve.
- Security contract: 16/16 PASS; TypeScript PASS; célzott ESLint 0 hiba.
- Final validation build: `pHDlwdSLfwJ6gW2OYtxft`, exit code 0.
- `DIMPRO_IDENTITY_CORE_ENABLED` továbbra is false a Drop fogyasztói E2E és kontrollált integráció végéig.

## 2026-08-08 – PROJEKTKAPU UI 0.9.0 – DIMPRO Workspace Design System

- Projektkapu shell átállítva világos enterprise kék/navy Design Systemre.
- Fix 58 px navy navigation rail elkészült.
- 226 px projekt/modul board lebegő `fixed` overlayként működik, a munkateret nem szűkíti.
- Egységes projektfejléc, helyi toolbar és kék aktív navigáció elkészült.
- Korábbi állandó alsó D6 gyorselérés megszűnt; `Ctrl+Alt+M` modulváltó paletta készült Tab/Shift+Tab/nyíl/Enter/Esc/1–6 vezérléssel.
- Mobilon megmaradt az alsó D6 navigáció.
- Projektlista vizuális tokenjei is az új rendszerre álltak át.
- Drive referenciaforrások read-only maradtak.
- Candidate build: `9DRYJaEiKsIcG_OoGd0fu`.
- Élő release: `.next-projectgate-drive-ui-20260808-release-final`.
- ESLint PASS; TypeScript PASS; desktop vizuális összevetés PASS; 12/12 élő acceptance PASS; DROP 1.2.4 health regresszió PASS; PM2 online.

## 2026-08-08 – PROJEKTKAPU UI 0.9.1 – Ctrl+Alt+M magyar billentyűzet hotfix

- A D6 modulváltó gyorsbillentyűje már a fizikai `KeyboardEvent.code === "KeyM"` értéket is figyeli, ezért magyar/AltGr jellegű kiosztásnál sem függ a generált karaktertől.
- Ismételt keydown (`event.repeat`) nem váltogatja a palettát.
- Candidate és élő böngészőteszt: AltGr-szerű `key != "m"`, `code = "KeyM"`, `Ctrl + Alt` kombináció PASS; normál `Ctrl + Alt + M` PASS.
- Release: `.next-projectgate-shortcut-v0901-release-final`, build `GrPJbz-YcYUZGNiVbTn60`.
