# BENJADMIN Developer Grid v0.1.45 – Stage-1 transcript recovery hotfix

Dátum: 2026-09-17
Környezet: DEV ONLY · PROD DENY

## Cél

A BOOT ACK recovery ne ragadjon `BOOT ACK VÁR` állapotban akkor sem, ha a worker a valid Stage-1 PASS report után már újabb free-form választ adott.

## Működés

A Desktop egységes ACK-jelöltként kezeli a strukturált `BOOT ACKNOWLEDGEMENT` és `BENJADMIN_STAGE_REPORT_V1` üzeneteket. A Conversation Memory és az `INDÍTÁS FOLYTATÁSA` szükség esetén a teljes ChatGPT transcriptből keresi vissza a legutóbbi jelöltet, nem kizárólag a legutolsó asszisztensválaszt vizsgálja.

Stage-1 fallback csak exact worker/task/session/HEAD/Central Core proof/branch/worktree egyezéssel, READY handshake, aktív scope-lock és worktree lease, PROD DENY és `codingAllowed=true` mellett validálható. Negatív evidence vagy source conflict fail-closed.

## Recovery lánc

`Stage-1 PASS a transcriptben → BOOT ACK validáció → authoritative persist → immediate heartbeat → BOOT_ACK_ACCEPTED_V1 → Central Core Execution Bridge V1`

Új task vagy új Launch Packet csak akkor szükséges, ha nincs valid strukturált ACK-jelölt.

## Verzióterv

A Work surface OpenAI first-party adapter a v0.1.45 hotfix miatt v0.1.46-ra tolódik.
