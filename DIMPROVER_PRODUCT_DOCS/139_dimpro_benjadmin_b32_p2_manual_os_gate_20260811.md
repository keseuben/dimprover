# DIMPRO BENJADMIN B3.2 – P2 manuális OS identity gate – 2026-08-11

## Állapot

A B3.2 P2 alkalmazásoldali izoláció és runtime preflight elkészült. A DEV rendszer jelenleg `P2 PREFLIGHT READY`, de a teljes runtime csak a külön OutminAI Linux service identity létrehozása után válhat `READY` állapotúvá.

A BENJADMIN VPS MCP biztonsági policy a Linux account/group létrehozást és tulajdonjog-váltást rendszer-szintű, túl kockázatos műveletként blokkolja. A policy megkerülése nem megengedett, ezért ehhez egyetlen root szintű kézi futtatás szükséges a DEV VPS-en.

PROD nem érintett.

## Előkészített provisioning script

A DEV worktree-be bekerült:

`ops/benjadmin-b32-p2-outmin-runtime-provision.sh`

A script idempotens és kizárólag a DIMPRO DEV worktree megléte esetén fut le.

Feladata:

- `dimpro-partner` service group létrehozása;
- `outmin` Linux service identity létrehozása;
- home: `/srv/partner-dev/home/outmin`;
- partner runtime könyvtárak tulajdonjogának és módjának beállítása;
- a stagingelt OutminAI SSH public key bekötése `restrict` opcióval;
- `/srv/dimpro-dev` belső plane 0750 root:root védelmének fenntartása;
- admin/sudo/docker/lxd csoporttagság tiltása;
- pozitív partner write acceptance;
- negatív INTERNAL read/traverse acceptance;
- root-only secret store olvasásának negatív acceptance-e;
- root-only rollback/audit snapshot;
- P2 runtime marker létrehozása `ready:false` állapotban az external SSH acceptance-ig.

## Egyetlen kézi parancs

A DEV VPS-en rootként:

```bash
cd /srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2 && bash ops/benjadmin-b32-p2-outmin-runtime-provision.sh
```

A script végén a kívánt záró sor:

`B3.2 P2 OUTMIN RUNTIME PROVISION: LOCAL OS ACCEPTANCE PASS`

## A kézi futtatás után

A Control VPS / ChatGPT oldalról automatikusan folytatható:

1. OutminAI privát SSH identityvel valós kulcsos belépési próba;
2. pozitív partner write ellenőrzés SSH-n keresztül;
3. negatív `/srv/dimpro-dev` read/traverse ellenőrzés SSH-n keresztül;
4. worker token pozitív acceptance;
5. runtime marker `ready:true` véglegesítése csak minden PASS után;
6. P2 regression + build/runtime smoke;
7. P2 lezárás és P3 partner provisioning indítása.

## Biztonsági szabály

A runtime marker nem válhat `READY` állapotúvá csak attól, hogy az `outmin` account létezik. Külső SSH acceptance és belső plane negatív teszt is kötelező.

A script nem módosít PROD szervert, PROD adatbázist vagy PROD környezetet.

## Ellenőrzött kézi gate csomag

A script repositoryba kerülése előtt és után ellenőrizve:

- shell syntax: PASS;
- TypeScript: PASS;
- teljes repository lint: 0 error / 108 meglévő warning;
- `git diff --check`: PASS;
- DEV build: PASS;
- aktív build: `PQ35MFAZx9t86Xdg06TsD`;
- DEV coordinated restart: PASS;
- P2 runtime/policy smoke: 12/12 PASS;
- B3.2 P1 regression: 14/14 PASS.

A kézi OS gate továbbra is az egyetlen hiányzó P2 infrastruktúra-beavatkozás. A scriptet a rendszer automatikusan nem futtatja, mert az MCP biztonsági policy ezt helyesen blokkolja.
