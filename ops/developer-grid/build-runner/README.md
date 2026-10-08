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


## 2026-10-08 access and capacity checkpoint

- Source hardening: both executor files identical; the policy independently
  validates free bytes, reported usage percentage, measured used bytes, and
  integer-safe input ranges. Ambiguous or inconsistent reports deny a build.
- Policy fixture test: 20/20 PASS. Main remote-build contract: 33/33 PASS.
- DEV was measured at 99 percent used with 2,284,457,984 available bytes.
- BUILD01 16 percent used; BUILD02 40 percent used; both idle, both emergency
  freeze files still present. No runtime rollout or new FULL BUILD performed.
- New dedicated Ed25519 key pairs exist locally on both BUILD nodes at the
  defined private-key path, mode 0600. No private-key content was retrieved.
- BUILD01 public-key fingerprint:
  SHA256:Eim2hqIfsFvmUM5+3VnicacPZh0+NuZE4zbY+ExDmQM
- BUILD02 public-key fingerprint:
  SHA256:UaEPAPTg+N2zEViMFibBUDma1K85Nq1Qd9hI4eeQN6o
- DEV host fingerprints were checked directly against the existing pinned
  known_hosts on both nodes, with both RSA and Ed25519 matches.
- DEV-side forced-command authorization has NOT been installed or changed:
  the available tool's safety policy blocked access to SSH authorization
  material. Do not bypass the block; use an authorized administration path.
- Approved Safe Delete preview tool actions are not exposed by the ChatGPT
  MCP connector despite being present in the server release.
- A later direct preview attempt ended unsuccessfully before producing the
  requested new report; do NOT consider earlier 65/65 candidate proof fresh.
- PROD remains DENY. No physical retirement, deletion, or freeze release.

Next release step: approved DEV-side forced-command authorization, live
verification from each BUILD node, staged executor with rollback, and fresh
safely approved retirement preview/guarded execution through dedicated MCP
actions only. Do not claim deployment readiness from source tests alone.


## 2026-10-08 read-only DEV disk artifact audit

Authoritative disk check: approximately 99% DEV usage, ~2.28 GB available;
BUILD01 ~16% and BUILD02 ~40%, both idle with emergency FULL BUILD freeze
ACTIVE. PROD DENY.

Read-only file inventory:
- /srv/dimpro-dev/artifacts: 16.477 GiB allocated, complete scan.
- /srv/dimpro-dev/artifacts/build-runs: 11.466 GiB allocated, 130
  existing build-artifact.tar.gz files across 291 run directories.
- Approved V2 manifest includes 65 tarballs / 5,794,594,816 allocated bytes,
  but earlier preflight proof must NOT be treated as fresh APPLY proof.
- Another 65 tarballs / 6,515,343,360 allocated bytes are NOT in the approved
  manifest. No unapproved tarball may be retired.
- Unapproved classification by metadata and existing manifest protections:
  - 47 older/equal to referenced snapshot, offsite proof NOT VERIFIED:
    4,636,237,824 bytes.
  - 3 explicitly hard-protected: 256,237,568 bytes.
  - 7 newer than referenced snapshot: 870,928,384 bytes.
  - 8 lack required metadata/result proof: 751,939,584 bytes.
  An earlier creation date is NOT restic proof or a deletion permission.
- New read-only, non-destructive, immutable-in-place report:
  /srv/dimpro-dev/coordination/maintenance-tools/reports/dev-build-run-tarball-exclusion-inventory-20261008-v1.json
  SHA256: 11066493873fa4a56fd8426b73bb94790b7ce2a7fcd450b206034eba8b2ce768
  The report's category counts/bytes and all 65 deny flags were checked.

Do not directly add the unapproved set to the current manifest: an R5 would
need independent fresh offsite path/size/hash validation, all live reference
guards, full Safe Delete skill verification, immutable manifest approval and
the connector's dedicated guarded apply capability.

The latest direct engine dry-run attempt did not generate a valid fresh
report. MCP v2.3.3 server advertises additional preview/apply actions, but
the ChatGPT connector schema still exposes only its original 8 tools.
Physical deletion through the generic shell tool is forbidden. There was
NO deletion, runtime swap, freeze removal or PROD operation in this audit.

Remaining release blockers: approved SSH forced-command enrollment on DEV,
live probes from BUILD01/02, dedicated MCP preview/apply exposure, capacity
recovery to >=15 GiB free and <90% used, and validated controlled rollout.
