# Drive DEV-kihelyezés – 0.1.122

Új, explicit DIMPRO Drive feladatnál a „Sikeres build után kihelyezés a Drive DEV felületére” beállítás a task/session része. Alapértéke kikapcsolt. Korábbi és lezárt próbafeladat nem kap új jogosultságot.

A 6/6 fázisban a központ az adott task/session/worker/HEAD legutóbbi, sikeres buildjét választja. A buildazonosító és az artifact SHA-256 a kihelyezési rekord megváltoztathatatlan azonosságához tartozik. Újabb hibás build esetén régebbi PASS nem választható ki.

A központi release lock alatt külön, loopback candidate indul. A szerver ellenőrzi az artifact bájtjait, metadata/source/build azonosságát, a szabad tárhelyet, a korábbi DEV környezeti kapcsolók egyezését, a statikus verziófájlt és a HTTP-válaszokat. A régi DEV-runtime megmarad. A kihelyezés kizárólag a Drive DEV-vhost megjelölt részét módosítja.

Megszakítás után a rendszer a mentett rekordot és a tényleges konfigurációt egyezteti. Már futó candidate-et nem indít újra, már beállított útvonalat nem alkalmaz ismét. Más kezelő megváltozott konfigurációját nem írja felül. Kézi szünet a következő új kihelyezési lépést megállítja; a már kihelyezett candidate felügyelete és szükség szerinti visszaállítása folytatódik.

A DEV KIHELYEZÉS lapon a publikus HTTP-ellenőrzéstől külön látható a bejelentkezett böngészős próba. A kezelő a pontos forráshoz, BUILD_ID-hoz és artifact-hashhez kötve rögzíti tényleges megfigyelését. Sikeres rögzítés után az állapot PASS_ASSISTED: ez kezelővel ellenőrzött kihelyezés, nem felügyelet nélküli böngészős E2E. Negatív eredménynél vagy 30 percig elmaradó igazolásnál visszaáll a korábbi DEV-útvonal. Ha a konfiguráció közben külső módosítást kapott, a rendszer BLOCKED állapotot és kezelői visszaállítási igényt jelez.

A DEV-et kérő feladat lezárása külön kaput kapott: build PASS vagy puszta HTTP-megjelenés alapján nem zárható le. A csak buildet kérő feladatok korábbi lezárása változatlan.

Ez a verzió kizárólag a meglévő Drive DEV-környezet kihelyezési profilját tartalmazza. Feltöltési/multipart-kapcsolók aktiválása, adatbázis-migráció, S3-/üzleti adatváltoztatás, PROD-művelet nem része a profilnak. A buildrunnerek kihelyezési jogosultsága továbbra is DENY.

A kilenclépes FILE EXECUTION E2E és a valódi DEV DELIVERY E2E külön elfogadási bizonyíték. A program elkészülése és a 20 izolált elfogadási/megszakítási teszt sikere nem helyettesíti az új verzió Windows- és teljes DEV-próbáját.
