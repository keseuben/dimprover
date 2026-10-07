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
