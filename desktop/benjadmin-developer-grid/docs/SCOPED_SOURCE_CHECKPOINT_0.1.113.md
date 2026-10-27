# Központi Git-mentés – 0.1.113

Az új fejlesztési feladat indításakor a kezelő pontos fájlkört jelölhet ki, és külön bekapcsolhatja a fejlesztési fázis végén készülő központi Git-mentést. Ez a task indulásakor rögzített szerződés része. Régi feladat és régi idempotencyKey engedélyei nem bővíthetők vele.

A 2→3 PASS fázisváltás minden korábbi execution request COMPLETED állapotát megköveteli. A Central Core ellenőrzi az aktív DEV task/session/worker/worktree/branch kötést, a READY jogosultságot, a forrásigazolást és az eredetileg kijelölt fájlokat. Csak ezek módosítása vagy új fájlként létrehozása menthető. Staged változás, törlés, átnevezés, symlink, másik fájl módosítása és tisztázatlan végrehajtási napló esetén megáll.

A mentő saját Git-indexet készít, a tényleges UTF-8 fájlbájtokat menti, és tartós műveleti tervet rögzít. A branch compare-and-swap művelettel halad előre. Ismétléskor ugyanaz a rögzített commit fejeződik be. A task forrásállapota, a központi forrásigazolás és a kijelölt fájlokra adott írási jóváhagyás együtt frissül. A desktop csak az eredeti taskhoz és csevegéshez kötött DEV-engedélyét kötheti az új igazoláshoz.

A következő fázisutasítás magyarul közli az új HEAD-et és a friss forrásigazolást. A worker nem indít közvetlen commitot vagy pusht. A Git-mentés nem ad új build-, kihelyezési vagy PROD-jogosultságot.

Ellenőrzések: 16 valódi Git-munkakönyvtáras eset, köztük öt megszakítási pont; 19 központi jogosultsági, desktop és fázisváltási eset. A teljes desktop regresszió és a TypeScript ellenőrzés külön fut.

Korlátok: a folyamat első, sikeres 2→3 átmenetét kezeli. Review/build utáni javítási körök új mentési átmenete még külön munka. A folyamatközi Git-napló a művelet megismétlésével folytatható; a meglevő task-operation lock váratlan processzhalál utáni kézi feloldási szabálya változatlan. A tesztek nem bizonyítják a teljes ChatGPT → BUILD01 → DEV kihelyezési E2E-t; ehhez új, megfelelően engedélyezett feladattal Windows-próba szükséges.
