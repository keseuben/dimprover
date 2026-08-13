# 184 — BENJADMIN Külső AI Worker V1.1 — valós M.Forge workspace handshake

Dátum: 2026-08-13  
Környezet: DEV  
Kapcsolódó dokumentumok: 180–183  
Normatív forrás: `05_DIMPRO_BENJADMIN_Kulso_AI_Worker_V1_fejlesztoi_kiegeszites_v2_2026-08-12.pdf`

## Cél

A V1.1 következő gate-je annak bizonyítása, hogy az új M.Forge-AI worker nem kap külön, párhuzamos task/worktree/lock rendszert, hanem a már meglévő B3 Development Center motoron keresztül képes biztonságosan eljutni READY állapotig.

A próba **tranziens acceptance**: a session, scope lock, worktree lease, fizikai Git worktree és acceptance branch a teszt végén felszabadul/törlődik. Külső AI provider továbbra sem indul.

## Trusted baseline frissítés

A korábbi V1.1b acceptance és commit után a trusted DEV baseline explicit `--advance` művelettel előrelépett:

`refs/heads/integration/benjadmin-dev -> 93a3357d99f8757a74854f88ea0a37887989ccb4`

A frissítés előtt backup készült:

`/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2/.dimprover/backups/trusted-baseline-20260813T072224878Z`

A baseline readiness utána 7/7 PASS maradt. Provider és natív executor továbbra sincs konfigurálva, ezért a globális executor readiness helyesen fail-closed.

## Fizikai workspace service

Új modul:

`app/lib/dev-center/ai-worker/external-workspace.ts`

Feladata kizárólag DEV worker workspace létrehozás/takarítás.

Biztonsági ellenőrzések:

- csak `MFORGE` vagy `VGUARD` worker code;
- branch kizárólag `worker/mforge/...` vagy `worker/vguard/...` formátum;
- worktree útvonalnak pontosan a BENJADMIN által számított `/srv/dimpro-dev/worktrees/...` útvonalnak kell lennie;
- trusted baseline commit csak 40 karakteres Git commit hash;
- baseline commitnak léteznie kell a DEV bare repositoryban;
- meglévő branch vagy worktree esetén fail-closed;
- létrehozás után branch + HEAD commit visszaellenőrzés;
- cleanup során worktree remove, branch delete és worktree prune.

A Git műveletek `execFile` argumentumlistával futnak, nem shell-string összefűzéssel.

## Scope confidence hardening

Az automatikus analyzer verziója `1.1.1` lett.

A korábbi discovery biztonságos volt, de egyes generikus kifejezések — például `versions`, `documents`, `review` — alacsony bizonyosságú, távoli fájlokat is GREEN jelöltként hozhattak.

Új szabály:

GREEN auto-write scope csak akkor marad automatikusan engedett, ha legalább az egyik igaz:

- erős modulútvonal-egyezés van;
- legalább két releváns scope hint található a pathban;
- a fájl közvetlen importfüggősége egy erős találatnak.

Egyébként az eredetileg GREEN fájl YELLOW / `NEEDS_REVIEW` lesz ezzel az indokkal:

`Alacsony scope-bizonyosság ... automatikus write helyett BENJADMIN review szükséges.`

Ennek eredményeként például egy Projektkapu dokumentumverzió feladatnál a távoli Meeting Assistant vagy általános versions dokumentáció nem kerül automatikusan írható scope-ba.

## Valós B3 handshake acceptance

A teljes tranziensteszt a következő láncot hajtotta végre:

1. Külső AI Worker task létrehozása;
2. automatikus scope analyzer;
3. YELLOW elemek biztonságos kizárása;
4. V1.1 preflight + checkpoint + context meta;
5. Development Center session megnyitása;
6. Ben-AI hozzárendelés;
7. `worker_mforge` kötés;
8. explicit task claim az atomi orchestration RPC-vel;
9. worker branch binding;
10. valódi Git worktree létrehozása a trusted baseline-ról;
11. meglévő B3 worktree validation;
12. meglévő `dev_center_acquire_scope_bundle_atomic` használat;
13. globális scope lockok és worktree lease létrejötte;
14. session `READY / active`;
15. M.Forge `write` authorization PASS DEV-en;
16. M.Forge `deploy` authorization technikai DENY;
17. session release;
18. worktree + branch törlés;
19. aktív lock/lease ellenőrzés és worker felszabadítás.

## Fontos architekturális eredmény

A Külső AI Worker V1 **nem kapott saját scope-lock vagy worktree lease motort**.

Ugyanazt használja, mint a meglévő BENJADMIN Development Center:

- `dev_center_worker_sessions`
- `dev_center_scope_locks`
- `dev_center_worktree_leases`
- atomic task claim
- atomic scope bundle acquisition
- B3 worktree validation
- engine operation authorization.

Így az M.Forge munkája ugyanazon repository ID és globális lock-tér alatt ütközik Ármin-AI/Jázmin-AI egyidejű fejlesztéseivel.

## Provider előtti működési szabály

A produktív V1.1 továbbra is csak **workspace tervet** készít preflightkor.

Nem nyitunk tartós M.Forge sessiont és nem szerzünk tartós lockot addig, amíg nincs tényleges provider/executor, amely azonnal elkezdi a futást. Ez megakadályozza a hamis `DOLGOZIK` állapotot és a felesleges scope-foglalást.

A V1.1c acceptance csak bizonyítási célból hozott létre rövid idejű sessiont, majd teljesen kitakarította.

## Acceptance

- V1.1 scope acceptance: **17/17 PASS**;
- V1.1b preflight acceptance: **15/15 PASS**;
- V1.1c valós workspace handshake: **19/19 PASS**;
- M.Forge DEV write authorization: PASS;
- M.Forge deploy DENY: PASS;
- B3 scope lock + worktree lease: PASS;
- release + cleanup: PASS;
- aktív acceptance lock/lease maradvány: 0;
- TypeScript: PASS;
- full lint: 0 error / 104 meglévő warning;
- build: `hcvAsC2nQmXUepFcTCfA1`;
- DEV PM2: online;
- PROD: nem módosult.

## Következő fejlesztési gate — V1.2

A BENJADMIN oldal architektúrája most már képes biztonságosan eljutni a provider indulási pontjáig.

Következő blokk:

1. providerfüggetlen Worker Model Adapter registry;
2. provider capability/probe;
3. szerveroldali secret-kezelés;
4. M.Forge run lifecycle és event stream;
5. token/idő/költség usage ledger;
6. 75/90/100% budget policy + hard stop;
7. context pack tartalom előállítása kizárólag jóváhagyott GREEN scope-ból;
8. output diff/artifact rögzítés;
9. provider futás végén `WORKER_DONE`;
10. ezután V1.3 V.Guard független review.

A V1.2 előtt a provider konfigurációt külön secretként kell bekötni; kliensoldalra provider kulcs nem kerülhet.
