# BENJADMIN Developer Grid v0.1.66 – Authoritative Source Proof Priority

Dátum: 2026-09-23
Környezet: DEV ONLY · PROD DENY

## Fizikai hiba

A v0.1.65 legacy surface bind párbeszédablaka helyesen megjelent, de a „Jelenlegi csevegés rögzítése” után a backend fail-closed állapotban elutasította a bindet:

DEVELOPER_GRID_LEGACY_BIND_SOURCE_MISMATCH

JázminAI authoritative Central Core session:
- source HEAD: 117915263210cbe9d0cdcd728e070221e560e161
- authoritative source proof: 778282e7d407da6e06a4c79351af3e78ce04f0835b6793ba15717c2448a19a2c
- source state: VERIFIED
- BOOT ACK: VALIDATED

A Desktop resolvedExecutionProofSha256() nem olvasta a live task sourceProofSha256 mezőjét. Emiatt a hiteles proof helyett determinisztikus provenance fallbacket generált:
51184d409eae7b1a66dc00b4a31ad6d31c61cf64a76bac3ca7bf417810f37ca1

A két hash nem egyezett, ezért a backend helyesen blokkolt.

## Javítás

A proof feloldási prioritás v0.1.66-ban:

1. explicit caller override;
2. authoritative live task.sourceProofSha256;
3. task.sourceExecutionProof.sha256 kompatibilitási mező;
4. helyi task-launch record proof fallback;
5. determinisztikus VERIFIED provenance fallback.

A helyi/stale task-launch record többé nem írhatja felül a Central Core live task authoritative proofját.

## Biztonsági invariánsok

- Source identity ellenőrzés nem lett lazítva.
- Legacy Surface Bind továbbra is exact HEAD + proof egyezést követel.
- RAW transcript conversation ID ellenőrzése strict marad.
- Új task/session/TASK_LAUNCH nem készül.
- PROD DENY.
- Derived proof kizárólag fallback.

## Acceptance

- Authoritative Proof Priority contract: 10/10 PASS.
- Teljes Desktop regresszió: PASS.
- v0.1.65 Legacy Surface Bind: 20/20 PASS.
- Work first-party surface aktiválási cél: v0.1.67.
