# Grid 0.1.136 – megszakított teszt ismételt kapcsolatfrissítése

A 0.1.135 élő Windows-próbájában a korábbi LINT-újrapróbálási engedély már feloldotta a helyi megállást. A másnapi kapcsolatfrissítés új source proofot adott, de a helyi megállás hiánya miatt az engedélyt nem újította meg. Az engedély a régi proofhoz maradt kötve. Az előkészítési ellenőrzés ezt felismerte, ezért új LINT nem indult.

A helyreállítás most az utolsó lezárt, erőforrás/időkorlát jellegű teszthibát újra a szerverrel ellenőrizteti akkor is, ha a helyi megállást egy előző helyreállítás már feloldotta. Az új proofhoz pontosan kötött engedélyig a helyi folyamat megáll. A szerver továbbra is ellenőrzi a konkrét eredményt, elfogadott ACK-t, task/session/worker/csevegés azonosságot, változatlan Git-diffet és memóriakaput; az engedély nem indít tesztet és nem ad helyi végrehajtási jogot.

A futó desktop recovery-függvény regressziós próbája a 0.1.135 forráson reprodukálta az elmaradó második szerverkérést. A javítással két kapcsolatfrissítés után a friss proofhoz tartozik az engedély; a harmadik frissítés szerveres elutasítása ismét megállítja a folyamatot. Az eredeti FAIL változatlan. Teljes desktop regresszió és TypeScript szükséges. Az élő LINT és a teljes Drive DEV-kihelyezés külön bizonyítandó.

PROD DENY. A Drive-feladat és a három módosított fájl változatlan.
