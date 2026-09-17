# BENJADMIN Developer Grid v0.1.41 – Central Core Source Proof + READY recovery

Dátum: 2026-09-16
Környezet: DEV ONLY · PROD DENY

## Probléma
A ChatGPT worker Launch Packetje korábban már `TASK_BOUND` Dev Center session mellett kimehetett. Emiatt a worker olyan worktree/scope preflightot próbált saját ChatGPT környezetből ellenőrizni, amelyhez nem volt közvetlen VPS mountja, miközben a task-specifikus branch, worktree, scope-lock és worktree lease még nem állt READY állapotban. Ez `CLARIFICATION_REQUIRED / DEV_WORKTREE_UNAVAILABLE` blokkolást okozhatott.

## Új kötelező sorrend
1. explicit worker routing;
2. Dev Center session + task binding;
3. determinisztikus `worker/<worker>/<task>` branch és `/srv/dimpro-dev/worktrees/worker-...` task-worktree;
4. `BRANCH_BOUND → WORKTREE_BOUND → READY`;
5. atomi scope-lock + worktree lease;
6. exact Git provenance és Dev Center `write` execution gate ellenőrzés;
7. `CENTRAL_CORE_SOURCE_PROOF` SHA-256 rögzítés;
8. csak ezután mehet ki a `TASK_LAUNCH_V3`;
9. BOOT ACK visszaadja a proof SHA-256 értéket;
10. backend ACK-kor újraellenőrzi a proof integritását, provenance-t, lockot és lease-t.

## Recovery
Az `INDÍTÁS FOLYTATÁSA` a már létrejött, de korábban blokkolt taskot helyben javítja. Nem hoz létre új taskot. A meglévő Dev Center sessiont READY állapotig viszi, friss source proofot állít elő, a régi proof nélküli BOOT ACK-ot nem validálja újra, hanem friss Launch Packetet küld ugyanabba a rögzített worker-csevegésbe.

## Biztonsági elvek
- DEV ONLY · PROD DENY változatlan.
- A ChatGPT saját sandboxból hiányzó `/srv` mount nem azonos source mismatch-sel.
- `SOURCE_BASELINE_MISMATCH` csak Central Core proof/provenance eltérés.
- Végrehajtó eszköz hiánya külön `EXECUTION_TOOL_UNAVAILABLE`.
- Launch Packet proof nélkül fail-closed.
- BOOT ACK proof hash, active scope-lock és active worktree lease nélkül fail-closed.

## v0.1.41 release worktree provenance
A Windows package/release wrapper explicit `BENJADMIN_DEV_CANONICAL_ROOT` és `BENJADMIN_DEV_CANONICAL_BRANCH` DEV környezeti értéket fogadhat, hogy új Developer Grid feature/release branchből is szabályosan csomagolható legyen. A root kizárólag `/srv/dimpro-dev/worktrees/*`, a common Git repository kizárólag `/srv/dimpro-dev/repositories/dimprover.git`, a host továbbra is `dimpro-dev`; tiszta worktree, exact HEAD/branch, BUILD_ID és PROD DENY változatlanul kötelező.

## v0.1.41 Release Artifact Engine source-policy javítás
A Release Artifact Engine ugyanazt az explicit `BENJADMIN_DEV_CANONICAL_ROOT`, `BENJADMIN_DEV_CANONICAL_BRANCH` és `BENJADMIN_DEV_CANONICAL_GIT` source-policyt használja, mint a package/release wrapper. Korábban a wrapper helyesen validálta az új release worktree-t, de az engine `main()` még a v0.1.40 történeti worktree-jét vizsgálta. Az engine most csak `/srv/dimpro-dev/worktrees/*` rootot, a canonical `/srv/dimpro-dev/repositories/dimprover.git` bare repót és érvényes Git branchet fogad el. A default v0.1.40 értékek backward compatibility miatt megmaradnak, de explicit v0.1.41 release-policy esetén az engine az exact megadott worktree-t auditálja.
