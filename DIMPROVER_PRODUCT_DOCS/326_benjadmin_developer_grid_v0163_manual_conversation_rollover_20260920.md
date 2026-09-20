# BENJADMIN Developer Grid v0.1.63 – Manual Conversation Rollover

Dátum: 2026-09-20
Környezet: DEV ONLY · PROD DENY

## Cél

A betelt vagy lecserélendő ChatGPT csevegés folytatása ugyanazon fejlesztési taskon, új task, új session és új TASK_LAUNCH nélkül.

## Fejléc ikonok

A worker cella fázisműveleti sorában a következő három vezérlő kompakt ikongombként jelenik meg:

- Aktuális task: checklist/feladat ikon.
- Kontextus: kapcsolati/kontextus ikon.
- Checkpoint: ellenőrzőpont ikon.

Az ikonok 27 px magasak, megegyeznek a hat fázisgomb vizuális magasságával. Minden ikon title tooltipet és aria-labelt kap.

## Conversation Rollover ikon

A Checkpoint/fázisműveletek után külön kompakt rollover ikon jelenik meg.

Állapotok:

- narancs: nincs friss folytatási csomag; kattintásra előkészítés;
- zöld: Context Snapshot + Handoff Pack + bővített MD elkészült; kattintásra bootstrap prompt másolása;
- kék/cyan várakozó: az új conversation azonosítása megtörtént, rollover ACK-ra vár;
- piros: rollover blokkolt;
- zöld pipa: rollover kész.

A rollover előkészítés nem navigál automatikusan új ChatGPT csevegésre.

## Bootstrap prompt

A zöld rollover ikon a teljes MD helyett rövid, gépileg egyértelmű bootstrap promptot másol a Windows vágólapra.

A bootstrap tartalmazza:

- Task ID;
- Session ID;
- worker;
- előző conversation ID, cím és URL;
- Context Snapshot ID + revision;
- Handoff Pack ID;
- human-readable MD handoff ID + fájlnév;
- branch;
- worktree;
- HEAD;
- source proof;
- stage;
- PROD DENY;
- rövid fallback Context összefoglaló.

Az új AI első feladata az authoritative Central Core azonosság ellenőrzése. A bootstrap nem új TASK_LAUNCH.

## Új conversation biztonságos kötése

A felhasználó ugyanabban a worker cellában kézzel nyit új ChatGPT csevegést, beilleszti és elküldi a bootstrapot.

A Grid csak akkor fogadja el az új conversationt utódként, ha:

1. az új conversation ID eltér az előzőtől;
2. ugyanazon ChatGPT Projecthez tartozik;
3. a USER transcriptben ténylegesen megtalálható a BENJADMIN rollover marker;
4. a befagyasztott Context/Handoff/source identity egyezik.

Ezután a Central Core binding ACK_WAIT állapotba kerül. A meglévő rollover ACK validator READY állapotra zárja a folyamatot.

## Bővített MD átadó

Az előkészítés automatikusan létrehoz egy PARTIAL / CONTINUATION típusú, emberileg olvasható Markdown átadót.

Tartalma:

- 0. következő kötelező lépés;
- task/session/worker;
- Context Snapshot és Handoff Pack;
- branch/worktree/HEAD;
- aktuális stage;
- előző conversation;
- Context Snapshot összefoglaló;
- forrásutasítás;
- utolsó user/assistant kivonat;
- legutóbbi PASS build;
- PASS tesztek;
- módosított fájlok;
- blokkolók;
- continuity és PROD DENY szabályok.

A PARTIAL handoff nem zárja le a taskot.

## Kék MD-letöltő ikon

A rollover ikon mellett külön kék, 27 px magas letöltési ikongomb jelenik meg.

- Tooltip: Teljes MD átadó letöltése.
- Addig disabled, amíg a rollover átadó nem készült el.
- A meglévő natív Windows Mentés másként folyamatot használja.
- A letöltött fájl SHA-256 integritásellenőrzést kap.

## Invariánsok

- ugyanaz a task;
- ugyanaz a session;
- ugyanaz a branch/worktree;
- TASK_LAUNCH nem készül;
- automatikus taskindítás nincs;
- automatikus új ChatGPT chat nyitás nincs;
- successor bind csak transcript-confirmed USER marker után;
- PROD DENY.

## Acceptance

- teljes Desktop regression: PASS;
- Manual Conversation Rollover contract: 21/21 PASS;
- korábbi cross-cell, rebind, auth isolation, startup restore contractok: PASS.

## Következő külön fejlesztési fejezet

Developer Grid / Build Storage Retention:

- régi worktree cache-ek automatikus takarítása;
- node_modules és .next retention;
- régi dist/dist-dev csomagok;
- BUILD01/BUILD02 artifact retention;
- immutable release és rollback védelme;
- Central Core / handoff / evidence adatok kizárása a takarításból;
- storage warning és automatikus cleanup küszöbök;
- auditált cleanup események.

A v0.1.63 fejlesztés közben kézi biztonságos takarítással körülbelül 5,6 GB hely szabadult fel kizárólag újragenerálható DEV cache/build adatokból.
