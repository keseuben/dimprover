# Grid 0.1.115 – új feladatok tesztkörnyezete

Az új worker worktree a központi scripts/dimpro-create-dev-worktree.sh segéddel készül. Azonos package-lock esetén valódi, hardlinkelt node_modules jön létre; külső node_modules symlink és eltérő lockú Grid-függőségek átvétele tilos. A már létező task dirty forrását a létrehozás továbbra sem írja át.

Eltérő modul-lockhoz a központi üzemeltető egyszer előkészítheti a tesztkörnyezetet:

    node scripts/developer-grid/task-toolchain.mjs --prepare /srv/dimpro-dev/worktrees/<modulforras>

A művelet maintenance lockkal, tárhelyellenőrzéssel, pontos package/lock/Node ABI/platform/arch azonosítással, npm ci --ignore-scripts telepítéssel fut. Az igazolt cache újra felhasználható. Nincs automatikus felülírás, törlés vagy tetszőleges lokális függőség áthelyezése. Hiányos telepítés nem kap READY jelölést. A worktree segéd az igazolt, pontosan egyező cache-ből is készíthet hardlinkeket.

Ez kizárólag fejlesztési tesztkörnyezet: natív postinstall kód nem fut, teljes build továbbra is BUILD01/BUILD02-n történik. Új modul-lock új előkészítést igényel; a worker nem telepít csomagokat és nem javít Grid-infrastruktúrát. A meglévő taskok és jogosultságok nem bővülnek.

A Drive V0.9.67 teljes típusellenőrzésének mért futása 123 másodperc. A TSC és lint műveleti határideje 240 másodperc, a desktop HTTP-é 300 másodperc; a kiadáshoz a kizárólag Grid API proxy-időkorlátot 330 másodpercre kell állítani. A TSC --noEmit --incremental false opciókkal nem ír inkrementális állományt. A túllépés FAIL, nem hamis PASS.

Elfogadási kapu: izolált filesystem/valódi Git tesztek, tényleges Drive típusellenőrzés, teljes desktop/TSC regresszió, majd új Grid-feladatból végzett tesztelés. A review/build/DEV kihelyezés külön igazolandó; a jelen javítás önmagában nem bizonyítja a teljes DEV deliveryt.
