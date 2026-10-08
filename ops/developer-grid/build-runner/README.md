# DIMPRO build runner - DEV storage admission

Scope: DEV only. PROD DENY.

Every FULL BUILD must pass a direct storage admission check against dev.dimpro.hu before source bundle processing.

Policy:
- avail below 15 GiB => DEV_STORAGE_ADMISSION_BLOCKED
- used at or above 90 percent => DEV_STORAGE_ADMISSION_BLOCKED
- SSH/query/parse/host-key/key-file failure => DEV_STORAGE_ADMISSION_UNKNOWN_DENY

Security:
- no hardcoded DEV IP in the runner
- StrictHostKeyChecking=yes
- BatchMode=yes
- IdentitiesOnly=yes
- dedicated key path: /srv/dimpro-build/keys/dev-storage-probe_ed25519
- dedicated known_hosts: /home/dimproadmin/.ssh/known_hosts
- remote account: dimproadmin@dev.dimpro.hu
- remote forced command accepts only dimpro-storage-probe-v1
- remote probe returns only df size/used/avail/pcent for /srv/dimpro-dev

The emergency dev-storage-freeze.json remains a stronger fail-closed override and may be cleared only after DEV has at least 15 GiB free and both live probes are proven operational.

No manual fallback may bypass this gate.


## DEV storage admission source status (2026-10-08)

Implemented in the two identical executor source files:
- ops/developer-grid/build-runner/dimpro-build-runner-executor-v1
- scripts/developer-grid/build-runner-executor-v1.sh

Included a read-only, single-command SSH probe source:
- ops/developer-grid/build-runner/dimpro-dev-storage-probe-v1

Test contracts:
- scripts/developer-grid/remote-build-executor-contract.mjs
- scripts/developer-grid/dev-storage-admission-contract.mjs

The probe script is source-only: it has not been installed or assigned a
dedicated authorized_keys entry. The BUILD nodes have not been redeployed.
The emergency freeze remains ACTIVE on both nodes.

Release prerequisites:
1. Verify a fresh DEV capacity report and the DEV-only PROD DENY boundaries.
2. Provision separate dedicated storage-probe identities with no shell access.
   Apply a forced command pointing at the read-only probe and restrictive SSH
   key options. Verify trusted DEV host key fingerprints out of band.
3. Install the trusted public-key authorization on DEV through the approved
   security process. Never log or commit any private key material.
4. Place each key with restrictive permissions in the configured BUILD key path.
5. Demonstrate both BUILD01 and BUILD02 can query the exact forced command.
   Also verify bad host keys, auth failure and invalid probe reports fail closed.
6. Stage and verify identical executor hashes before a guarded DEV-only release.
   Preserve a fully tested rollback and current active executor.
7. Keep the freeze active until DEV free space is at least 15 GiB, DEV use is
   below 90 percent, both live probes pass, and formal release approval exists.

A failed query, inaccessible identity, bad host key, malformed metrics, storage
below 15 GiB, or at least 90 percent usage must prevent FULL BUILD execution.
Source-only fixture passing is not a successful live admission test.
