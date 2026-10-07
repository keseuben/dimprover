# DIMPRO Build Retention V1

DEV build node retention for `build01` and `build02`. PROD access is denied.

## Goals

- Build worktrees are ephemeral.
- Completed manual fallback builds must not retain full source + `node_modules` + `.next`.
- Old temp bundles are removed only when no current build references them.
- Build-node artifact tarballs are retained until the gateway has verified the exact SHA-256 on DEV and written `DEV_COPY_VERIFIED.json`.
- Audit metadata, results and small logs remain available according to policy.

## Rules

- PASS manual source: eligible after 2 hours, only if result/metadata scope is DEV + PROD DENY, source HEAD matches metadata source commit, source commit exists in the canonical build repository, artifact SHA matches, and no process references the source.
- FAIL manual source: minimum 24 hours. V1 does not require an artifact for FAIL cleanup.
- Detached build worktree: eligible after 2 hours only when matching local artifact metadata/SHA proof exists, the Git worktree is registered, HEAD matches the artifact source commit, no process references it, and no current run is active.
- Temp `.bundle`: eligible after 2 hours when not the current run and no process references it.
- Artifact tarball: eligible after 24 hours only with an exact `DEV_COPY_VERIFIED.json` marker, matching SHA-256 and DEV path. The newest 10 verified artifacts remain on each runner.
- Logs: eligible after 14 days.
- npm cache: report-only at 5 GiB; no automatic prune in V1.
- Any active FULL BUILD lock or `current-run.json` denies the entire apply.

## Storage Governor

- `<35%`: SAFE
- `35–45%`: WATCH
- `45–55%`: AUTO_CLEAN
- `55–65%`: CACHE_PRUNE
- `65–75%`: WAIT
- `75–85%`: DENY
- `>=85%`: CRITICAL

The health script reads these values from `/srv/dimpro-build/config/retention-v1.json`. Missing/invalid config blocks the runner.

## Automation

The repository contains staged `dimpro-build-retention.service` and `dimpro-build-retention.timer` units for the future guarded APPLY executor. They are not enabled on the build nodes while the current chat MCP safety layer blocks destructive apply execution.

The active BUILD01/BUILD02 automation is a `dimproadmin` hourly DRY_RUN monitor at minute 17. It writes `/srv/dimpro-build/state/retention/hourly-latest.json` and appends to `/srv/dimpro-build/logs/retention-v1.log`; it never passes `--apply`.

The staged APPLY service uses an exact config SHA confirmation token, so configuration changes fail closed until the service definition is deliberately updated and re-approved.

## Safety

The engine never touches repositories, toolchains, state results, metadata, user/project data, DEV runtime, PROD content, or an active build. Worktrees are removed only using `git worktree remove --force`; no raw recursive deletion is used for Git worktrees.

## Build dispatch origin rule

A remote FULL BUILD dispatch authoritative originja kizárólag a `dimpro-dev` host. A 2026-10-07 audit bizonyította, hogy a `mcp.dimprover.hu/build-gateway/v1` 403 válaszai a gateway host saját `213.160.68.24` publikus címéről érkeztek, miközben a DEV `213.160.68.32` kérései 200 OK választ kaptak. Ezért `GATEWAY 401/403` esetén automatikus manual build fallback tilos. A művelet fail-closed állapotba kerül, és a dispatchot a DEV authoritative hostról kell újraindítani.

A `remote-build-dispatch.mjs` ezt `BUILD_DISPATCH_WRONG_HOST` guarddal kényszeríti ki. A default expected host `dimpro-dev`; teszt/fixture célra külön környezeti override létezik (`DIMPRO_BUILD_DISPATCH_EXPECTED_HOST`).
