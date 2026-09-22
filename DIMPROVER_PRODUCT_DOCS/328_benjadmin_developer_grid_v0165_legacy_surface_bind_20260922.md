# BENJADMIN Developer Grid v0.1.65 – Legacy Surface Bind

Dátum: 2026-09-22
Környezet: DEV ONLY · PROD DENY

## Cél

A régebbi, de továbbra is aktív és VERIFIED Developer Grid sessionök conversation rolloverének támogatása akkor is, ha a session létrejöttekor még nem tároltunk authoritative ChatGPT conversation ID-t.

## Fizikai hiba, amely ezt szükségessé tette

A v0.1.64 fizikai tesztben a JázminAI task aktív és VERIFIED volt, BOOT ACK-je VALIDATED, source proofja érvényes, de sem surfaceConversationId, sem chatConversationId nem szerepelt a legacy session developmentContext mezőiben.

A rollover RAW transcript mentése emiatt RAW_CONVERSATION_MISMATCH hibával fail-closed állapotba került: a jelenlegi ChatGPT /c/... conversation azonosító nem egyezhetett az üres authoritative conversation azonosítóval.

## v0.1.65 megoldás

A rollover előkészítés felismeri a legacy sessiont, ha aktív task/session létezik, de authoritative conversation ID még nincs.

Ilyenkor a rendszer nem lazítja fel a RAW transcript ellenőrzést, hanem előbb egyszeri Legacy Surface Bind műveletet hajt végre:

- natív felhasználói megerősítést kér;
- csak EXISTING_CHAT + CHATGPT surface engedélyezett;
- BOOT ACK = VALIDATED és codingAllowed=true szükséges;
- source provenance = VERIFIED szükséges;
- a kliens source HEAD + source proof értékét a backend byte-pontosan összeveti az authoritative aktív sessionnel;
- már létező authoritative conversation esetén a legacy bind tiltott;
- PROD hozzáférés DENY marad;
- a Central Core esemény típusa CONVERSATION_LEGACY_SURFACE_BIND;
- az engine bridge target RUNNING marad.

Sikeres bind után a RAW transcript conversation ID ellenőrzése változatlanul strict. Csak ezután készülhet Context Snapshot, Handoff Pack és a human-readable MD átadó.

## Multi-worker Conversation Memory javítás

A RAW transcript mentés authority többé nem a globális singleton state.task rekordhoz kötött. Négy párhuzamos worker esetén az authority az exact aktív session:

- sessionId;
- taskId;
- workerCode;
- endedAt = null;
- developmentContext.taskId egyezés.

Ez megszünteti azt a hibás feltételezést, hogy csak a globális primary task rendelkezhet Conversation Memory-val.

## Biztonsági invariánsok

- új task: TILTVA;
- új session: TILTVA;
- TASK_LAUNCH: TILTVA;
- legacy bind csak hiányzó authoritative conversation esetén;
- stale source identity fail-closed;
- eltérő source HEAD vagy proof fail-closed;
- RAW conversation identity bind után továbbra is strict;
- PROD DENY.

## UX

Legacy task első rollover-kísérleténél a felhasználó natív megerősítő ablakot kap:

Régi task csevegésének rögzítése

Elsődleges művelet:

Jelenlegi csevegés rögzítése

Sikeres rögzítés után ugyanaz a rollover prepare folytatódik; nincs külön új taskindítási workflow.

## Acceptance

- Legacy Surface Bind contract: 20/20 PASS.
- Teljes Desktop regresszió: PASS.
- v0.1.63 és v0.1.64 rollover invariánsok megmaradtak.
- Work first-party surface aktiválási célja v0.1.66.
