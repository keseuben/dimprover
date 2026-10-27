# BENJADMIN Grid – végrehajtási megbízhatóság, elfogadási feltételek

Felhasználóval egyeztetett követelmények, 2026-10-27. Ez a dokumentum és a hozzá kapcsolt regressziók nem jelentenek élő E2E PASS-t, és nem hoznak létre új feladatot a BENJADMIN feladattárában.

## Állapotok és eredmények

EXECUTED: a szerver eltárolta a művelet eredményét. DELIVERED: a konkrét, teljes eredmény megjelent a kijelölt worker USER üzenetében. ACKNOWLEDGED: a worker későbbi ASSISTANT válaszában az adott eredményt kifejezetten visszaigazolta. COMPLETED: a Central Core a kézbesítést és a worker ACK-ját elfogadta.

Az ACK kötése: taskId, sessionId, workerCode, requestId, sourceProofSha256, resultId és resultSha256. A resultSha256 a teljes, rendezett JSON eredmény SHA-256 értéke; azonos marker vagy azonos requestId önmagában nem kézbesítési bizonyíték. A forrás és a JSON kódblokkban kerül továbbításra, hogy a Markdown megjelenítés ne változtassa meg a backtick karaktereket.

A protokoll állapotától külön tárolandó a művelet PASS / BLOCKED / FAIL eredménye. COMPLETED + FAIL, BLOCKED vagy REJECTED ACK után új művelet nem indulhat.

## FILE EXECUTION E2E PASS – első elfogadási kapu

1. Minden requesthez pontosan a saját eredménye és worker ACK-ja tartozik. Ismételt esemény nem ismételhet meg fájlműveletet. Bizonytalan kézbesítés nem okozhat üzenetáradatot.
2. Egy feladat elején adott, fájlkörhöz és műveletekhez kötött jóváhagyás után az engedélyezett kilenc lépés emberi beavatkozás nélkül fut végig. Scope-bővítés új jóváhagyást igényel. A technikai ACK a worker feladata.
3. A READ_FILE és WRITE_FILE a tényleges szerveres bájtok fileSha256 és fileBytes értékét adja vissza. A sorszámozott szöveg önmagában nem bizonyít bájtpontos tartalmat. Visszaállításhoz teljes, veszteségmentes rawContent szükséges. A kommentpróba írásai várt tartalomhashhez és előző fájlhashhez is köthetők; eltérésnél írás előtt meg kell állni.
4. Megszakítás után a tartós journal és a szerveres audit alapján folytatható a folyamat. Elveszett írási válasz esetén csak olvasási eredménylekérdezés történhet; ismeretlen kimenetelnél az új írás és a továbblépés blokkolt. Eltárolt ACK után csak az elfogadás újrapróbálható.
5. A kilenc lépés: GIT_STATUS, READ_FILE, LIST_FILES, WRITE_FILE ideiglenes komment, READ_FILE, WRITE_FILE eredeti tartalom, READ_FILE, GIT_STATUS, GIT_DIFF_CHECK. Mindegyik eredmény PASS és COMPLETED; végül tiszta Git, diff-check PASS és az eredeti fájlhash szükséges. Hibánál megállás, hamis siker nélkül.

Próbafájl: az új Outmin munkakönyvtár components/drive/driveBuildInfo.ts állománya. Eredeti SHA-256: 32fcd632a195c53a238e593679cec1f3e0e35f68bff8aa561f6a87ead08aab93. Ideiglenes komment után: f49e66335ecf67286c46339a26854df88519e58922b931854cc1ed967a266c00. Visszaállítás után az eredeti hash szükséges. Nincs commit, build, törlés, DB/S3-, deploy-, restart- vagy PROD-művelet a Drive-próba részeként.

## DEV DELIVERY E2E PASS – külön második kapu

Csak az első kapu igazolása után: tényleges Drive-forrásfejlesztés, tesztelés, koordinált BUILD01, elkülönített DEV candidate, böngészős működésellenőrzés és koordinált DEV-kihelyezés. Ezt külön kell mérni és dokumentálni. A PROD DENY megmarad.

## Bizonyítékok

Automatizált regressziók: execution-reliability-v01110-contract.mjs és execution-receipt-server-v01110-contract.mjs; korábbi kézi vezérlési és scope-biztonsági tesztek is kötelezők. Élő bizonyíték: szerveres REQUEST / RESULT / DELIVERED / ACKNOWLEDGED / COMPLETED audit, worker csevegés, három fájlhash és végső Git-állapot.

Egy sikeresen elkészült EXE, a verziószám vagy az izolált tesztek sikere egyik E2E-kaput sem teljesíti önmagában.
