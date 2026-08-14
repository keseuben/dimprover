# 204 — BENJADMIN Terminal Hub P2.5 · output security, idle és lifetime

Dátum: 2026-08-14
Környezet: DEV feature worktree
Baseline: `6aa7437`
Állapot: OUTPUT SECURITY KÓDOLVA · PROCESS ADAPTER TOVÁBBRA IS FAIL-CLOSED

## Elkészült

- 30 perces idle timeout;
- 4 órás maximális terminal session lifetime;
- timeout után session `CLOSED` állapot és best-effort adapter cleanup;
- session list/get előtt automatikus prune;
- RAW output ring buffer változatlanul csak admin-autholt terminál útvonalhoz;
- külön SANITIZED output nézet;
- külön AUDIT output nézet;
- SANITIZED a közös BENJADMIN secret-scanner/data-policy eredményét használja;
- AUDIT nem tartalmaz raw output szöveget;
- AUDIT chunk csak maszkolt audit nézet SHA-256 hashét, byte méretét, finding darabszámot, sequence-t és időpontot tartalmaz;
- mindkét biztonságos nézet sequence filtert támogat;
- mindkét endpoint jelenleg admin-only.

## Biztonsági adatút

`RAW -> SANITIZED -> AUDIT`

RAW:
- emberi, jogosult Terminal Core stream;
- AI vagy audit útvonal közvetlenül nem használhatja.

SANITIZED:
- meglévő `scanSensitiveText` + terminal data policy;
- későbbi AI-visible terminál kontextus alapja.

AUDIT:
- raw szöveg nélkül;
- maszkolt nézet hash + metaadat.

## Ellenőrzés

- TypeScript: PASS;
- célzott ESLint: PASS;
- output security contract: **11/11 PASS**;
- `git diff --check`: PASS.

## Következő lépés

- Managed Command integráció a meglévő B3.1 Control Plane queue-val;
- PTY process adapter külön security boundary;
- teljes P2 acceptance és candidate build.
