<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

<!-- BEGIN:dimpro-dev-storage-rules -->
# DIMPRO DEV storage / worktree szabály

A `/srv/dimpro-dev` környezetben új fejlesztői worktree létrehozásához elsődlegesen a `scripts/dimpro-create-dev-worktree.sh` segédet használd. Azonos `package-lock.json` esetén a worktree az operator `node_modules` könyvtárából `cp -al` hardlinkelt dependency-fát használ. Külső `node_modules` symlink tiltott, mert a Next/Turbopack a projektgyökéren kívüli symlinket elutasítja. Teljes fizikai dependency-másolat vagy újratelepítés csak valódi lockfile-eltérésnél megengedett.

A koordinált DEV build után a `scripts/dimpro-dev-storage-retention.mjs` automatikusan build-retentiont futtat. Kötelező védelmek:

- aktív PM2 `NEXT_DIST_DIR` és `active-next-release` soha nem törölhető;
- worktree-nként legalább a 3 legfrissebb `.next*` build megmarad;
- backup, artifact és teljes worktree automatikusan nem törölhető;
- `node_modules` automatikusan nem törölhető, csak explicit deep-prune módban clean + merged + inactive gate után;
- minden apply központi `maintenance` / `build` lock alatt történik;
- PROD-ra ez a retention szabály nem alkalmazható.
<!-- END:dimpro-dev-storage-rules -->
