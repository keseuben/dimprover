# Grid 0.1.133 – memória-előellenőrzés utáni folytatás

A TSC memóriahiány miatti BLOCKED eredménye változatlan, teljes eredmény/ACK-előzménnyel megmarad. A kapcsolat helyreállítása külön szerveres RESOURCE_RETRY_AUTHORIZED eseményt hozhat létre, ugyanazon task/session/worker/csevegés és friss READY forrásigazolás mellett.

Elfogadási feltételek:
- Csak az el sem indult TSC igazolt EXECUTION_TEST_MEMORY_UNAVAILABLE eredménye oldható fel; ismeretlen kimenetel, elutasított ACK és tényleges teszthiba blokkolva marad.
- A 6 GiB kapu az engedélyezéskor és a tényleges futáskor is érvényes.
- A Git-diff lenyomata az engedélyezés és az új kérés között egyezik. Ismeretlen, nem követett fájl mellett az újrapróbálás blokkol.
- Új requestId szükséges. Az ismételt kérés csak megőrzött eredményt ad vissza, nem futtat új tesztet.
- A feloldásig csak olvasás és ugyanannak a TSC-nek az ismétlése engedett; fájlírás vagy más parancs nem.
- Git-mentéshez az új PASS eredmény konkrét task/session/worker/request/result/proof azonossága és elfogadott ACK-ja kell. Megjelenítés nem jelent ACK-t.
- A desktop kizárólag a szerver igazolt engedélye alapján oldja fel a megállást. Nem bővíti a fájlkört, és nem ad helyi végrehajtási engedélyt.

Ellenőrzés: resource-retry-v01133-contract.mjs, teljes desktop regresszió és TypeScript. Az automatizált tesztek izolált fixture-ök; az élő Outmin-folytatás külön bizonyítandó.

A FILE EXECUTION E2E PASS és a DEV DELIVERY E2E PASS külön elfogadási kapu. A sikeres EXE-csomagolás egyiket sem bizonyítja. A Drive meglévő három módosított fájlja, feladata és munkamenete megőrzendő; PROD DENY.
