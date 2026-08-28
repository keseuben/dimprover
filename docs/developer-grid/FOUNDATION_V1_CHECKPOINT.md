# BENJADMIN Developer Grid V1 – Foundation checkpoint

## Scope

DEV-only first Central Core checkpoint for task `dev-task-benjadmin-developer-grid-v1-night-20260827`.

Implemented foundation:
- authoritative development context resolver: explicit Task context > same-task activity > task inference > presence fallback;
- stale worker presence cannot override explicit current Task context;
- fail-closed source provenance verification for branch/worktree/HEAD/canonical HEAD/clean state;
- in-process bounded event store with cursor-based delta reads, no full-snapshot polling contract;
- build-node registry abstraction with `build01` / `build02` defaulting to `NOT_CONNECTED` and canonical DEV fallback executor;
- shared Developer Grid domain types for five agents and sanitized activity/event kinds.

## Runtime constraints

- DEV ONLY; PROD DENY.
- ChatGrid v0.3.x remains untouched fallback/reference.
- This checkpoint does not perform build, restart, migration, release or cutover.
- The event store is a foundation abstraction, not yet the persistent/realtime production implementation. A later checkpoint must connect it to the Central Core persistence and SSE/WebSocket fan-out layer.

## Acceptance

Run:

`node --experimental-strip-types --experimental-specifier-resolution=node scripts/benjadmin-developer-grid-v1-foundation-acceptance.mjs`

Expected: `FOUNDATION_ACCEPTANCE_PASS 12/12`.

Additional gates before checkpoint commit:
- `git diff --check`
- `npx tsc --noEmit`
- targeted ESLint on `app/lib/dev-center/developer-grid/*.ts`
