# Grid 0.1.114 – központi Git-mentés javítása

A REQUEST és RESULT összerendelése requestHash alapján történik. A DELIVERED, ACKNOWLEDGED és COMPLETED receipt az eredmény resultId/resultSha256 azonosítójához, valamint ugyanazon task/session/worker/request/source proof értékhez kapcsolódik. A megjelenítés nem ACK; kizárólag az ACCEPTED ACK és workflowContinue=true COMPLETED engedi a mentést.

Az előző verzió tévesen requestHash értéket várt a receipt eseményeken is. A javítás a megőrzött, már végrehajtott kérésekből engedi a checkpoint újrapróbálását, fájlművelet ismétlése nélkül. Hibás vagy hiányzó receipt továbbra is blokkol.

A célzott tesztek a tényleges receipt sémát és az eltérő identitású eredmények elutasítását ellenőrzik. A teljes élő 2→3 próba külön igazolandó; a verziószám vagy elkészült EXE nem E2E bizonyíték.

A korábbi 0.1.113 szűk fájlkör, megállás 3/6-nál és PROD DENY korlátozásai változatlanok. A review/build utáni javítási kör és a teljes DEV delivery külön elfogadási kapu.
