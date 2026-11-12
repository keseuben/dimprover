# Grid 0.1.135 – védett lint-futtatás és időkorlát utáni folytatás

A teljes lint legfeljebb600másodpercig futhat, a desktop650másodpercig vár; a DEV APIproxy660másodperces időkeretet kap. A TSC240másodperces korlátja változatlan.

TSC és LINT közös tesztslotot, legalább6GiB igazolt szabad memóriát,4096MiB-os heapet és letiltott core dumpot használ. A kapu hiányában nem indul processz.

Új, igazolt időkorlátos megszakítás FAIL/EXECUTION_COMMAND_TIMEOUT marad, explicit timedOut/timeoutMs/elapsedMs adatokkal. A134korábbi, pontosan240másodpercnél megszakadt LINT-je csak egyezőREQUEST/RESULT, SIGTERM, exitCode1,240–245másodperces szerveres időadat és elfogadottACK mellett újrapróbálható. RövidSIGTERM és valódi diagnosztikai hiba nem oldható fel ezzel.

A kapcsolat-helyreállítás nem futtat tesztet: külön RESOURCE_RETRY_AUTHORIZED naplóeseményt ad ugyanarra a task/session/worker/csevegésre, frissREADYproofra és változatlan Git-diffre. Feloldásig csak olvasás és az engedélyezett AZONOS teszt ismétlése engedett. Az eredetiFAIL/BLOCKED változatlan; csak az újPASS konkrétACK-ja után fogadható el a Git-mentés. Nincs új fájlkör vagy helyi végrehajtási engedély.

Ellenőrzés: long-test-budget-v01115 és resource-retry-v01133 futó kódot ellenőrző regressziók, teljes desktop és TypeScript. ÉlőLINT-újrapróbálás külön bizonyítandó. FILE EXECUTION és DEV DELIVERY E2E két külön kapu. PROD DENY.
