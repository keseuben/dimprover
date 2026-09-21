# BENJADMIN Developer Grid v0.1.64 – Conversation Rollover physical hotfix

Dátum: 2026-09-21
Környezet: DEV ONLY · PROD DENY

## Fizikai v0.1.63 hiba

A v0.1.63 Windows fizikai teszten a narancs Conversation Rollover ikonra kattintás után a felhasználó nem látott állapotváltozást sem OutminAI, sem BenjáminAI cellában.

A szerveroldali ellenőrzés szerint:
- nem jött létre új Context Snapshot / Handoff / rollover event;
- nem keletkezett új task, session vagy TASK_LAUNCH;
- backend crash nem történt.

## Gyökérokok

### 1. Legacy VERIFIED source proof kompatibilitás

Régebbi, ma is aktív és VERIFIED worker sessionökben a sourceProvenance teljes és hiteles, de a később bevezetett developmentContext.sourceExecutionProof.sha256 mező még nem létezik.

A v0.1.63 rollover egyszerre követelte a 64 hex source proofot és kizárólag az új mezőből tudta azt feloldani. Emiatt egy régebbi, szabályos session rolloverje nem tudott átmenni.

v0.1.64 szabály:
- az explicit sourceExecutionProof.sha256 továbbra is elsődleges;
- ha nincs explicit proof, csak VERIFIED sourceProvenance esetén engedélyezett determinisztikus kompatibilitási proof;
- a kliens és backend ugyanabból a canonical mezőkészletből SHA-256 hash-t képez:
  repository, worktree, branch, head, worker, taskId, sessionId, verifiedAt, sourceState=VERIFIED;
- bármely hiányzó vagy nem VERIFIED mező fail-closed.

### 2. Megnyitott conversation eltér az authoritative pintől

A BenjáminAI fizikai tesztben a megnyitott ChatGPT conversation nem az aktív task authoritative conversationje volt.

v0.1.64 szabály:
- más ChatGPT Project esetén továbbra is hard fail-closed;
- ugyanazon ChatGPT Projecten belüli eltérésnél natív megerősítő dialógus jelenik meg;
- explicit jóváhagyás után a meglévő authoritative manual rebind motor fut;
- az átkötés nem indít új taskot, sessiont vagy TASK_LAUNCH-ot;
- csak sikeresen igazolt rebind után készülhet rollover átadó.

### 3. Láthatatlan fail-closed UI

A v0.1.63 renderer IPC-hibánál nem rendelkezett catch ággal, a lokális piros gombállapotot pedig a következő live snapshot felülírhatta. Emiatt a felhasználó úgy látta, hogy a gomb semmit sem csinál.

v0.1.64 szabály:
- minden ismert prepare hiba persistent conversationRolloverState=BLOCKED állapotba kerül;
- külön error code és human-readable error tárolódik;
- a rollover ikon tartósan piros marad;
- tooltip tartalmazza a konkrét hibakódot és üzenetet;
- renderer IPC reject esetén is explicit BLOCKED állapotot és toastot ad.

## Conversation pin transition

A normal conversation pin guard a következő rollover transitionök alatt szünetel:
- HANDOFF_SAVED
- NAVIGATING
- CONTINUATION_SENT
- CLIPBOARD_COPIED
- ACK_WAIT

READY vagy BLOCKED után az authoritative állapotgép dönt.

## Biztonsági invariánsok

- Same-task continuation.
- Új task: TILTVA.
- Új session: TILTVA.
- TASK_LAUNCH: TILTVA.
- PROD: DENY.
- Different-project automatic rebind: TILTVA.
- Legacy proof fallback csak VERIFIED source provenance-ból.
- Backend és Desktop ugyanazt a determinisztikus proof algoritmust használja.
- Explicit sourceExecutionProof mindig elsőbbséget élvez.

## Acceptance

- v0.1.64 hotfix contract: 15/15 PASS.
- teljes Desktop regression: PASS.
- v0.1.63 rollover contract továbbra is PASS.
- manual rebind / cross-cell / startup restore / auth isolation regressziók: PASS.
