# Grid 0.1.111 – lejárt kapcsolat helyreállítása

A 0.1.110 megszakítási próba negyedik WRITE eredményét a desktop újraindítás után az eredeti resultId-val elfogadta, ismételt írás nélkül. A tíz percnél hosszabb feloldási várakozás során a Dev Engine session lezárult, zárolásai felszabadultak. A következő READ session-hibáját a route általános HTTP 500-nak adta vissza. A desktop transport retryként megőrizte, amivel a kézi recoveryt is blokkolta.

A javítás megőrzi a DevCenterEngineError saját HTTP státuszát és hibakódját. Kézi recovery előtt csak a nem futó, eredmény nélküli olvasási kérés hagyható el, naplózással és a végrehajtási engedély visszavonásával. Írás, RUN_DEV_COMMAND, futó kérés vagy kézbesítendő/ACK-ra váró eredmény továbbra is blokkol. A szerver teljes source/scope/ownership ellenőrzése megmarad.

A célzott új teszt és teljes desktop npm check PASS. A kiadási build és az élő 0.1.111 ellenőrzés még hiányzik. A teljes automatikus lease-recovery nem igazolt.

Első folytatási feladat: a 0.1.111 kiadása után ugyanazt az Outmin taskot helyreállítani, és a már engedélyezett próba 5–9. lépésével a kommentet a Griden keresztül visszaállítani. A negyedik WRITE nem ismételhető. Outminnak nincs commit/build/deploy engedélye; a Grid saját kiadási buildje ettől külön infrastruktúra-munka.
