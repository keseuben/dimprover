#!/usr/bin/env bash
set -Eeuo pipefail
NODE_ID="${1:-}"
case "$NODE_ID" in prod-vps|db-vps) ;; *) echo "Usage: $0 prod-vps|db-vps" >&2; exit 2;; esac
AGENT_SOURCE="${BENJADMIN_AGENT_SOURCE:-./protected-telemetry-agent.py}"
ENDPOINT="${BENJADMIN_TELEMETRY_ENDPOINT:-https://admin.dev.dimpro.hu/api/dev/grid/protected-telemetry}"
[[ $EUID -eq 0 ]] || { echo "root required" >&2; exit 3; }
[[ -f "$AGENT_SOURCE" ]] || { echo "agent source missing" >&2; exit 4; }
install -d -m 0750 /opt/benjadmin /etc/benjadmin
install -m 0755 "$AGENT_SOURCE" /opt/benjadmin/protected-telemetry-agent.py
# First run performs source-IP-bound enrollment (only if no node key exists) and sends the first read-only sample.
/usr/bin/python3 /opt/benjadmin/protected-telemetry-agent.py --node-id "$NODE_ID" --key-file /etc/benjadmin/protected-telemetry.key --endpoint "$ENDPOINT" --enroll-endpoint https://admin.dev.dimpro.hu/api/dev/grid/protected-telemetry/enroll
test -s /etc/benjadmin/protected-telemetry.key
chmod 0600 /etc/benjadmin/protected-telemetry.key
cat > /etc/systemd/system/benjadmin-protected-telemetry.service <<UNIT
[Unit]
Description=BENJADMIN protected read-only telemetry ($NODE_ID)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
ExecStart=/usr/bin/python3 /opt/benjadmin/protected-telemetry-agent.py --node-id $NODE_ID --key-file /etc/benjadmin/protected-telemetry.key --endpoint $ENDPOINT --enroll-endpoint https://admin.dev.dimpro.hu/api/dev/grid/protected-telemetry/enroll
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectSystem=strict
ReadOnlyPaths=/etc/benjadmin
CapabilityBoundingSet=
AmbientCapabilities=
LockPersonality=true
MemoryDenyWriteExecute=true
RestrictSUIDSGID=true
RestrictRealtime=true
RestrictNamespaces=true
SystemCallArchitectures=native
UMask=0077
UNIT
cat > /etc/systemd/system/benjadmin-protected-telemetry.timer <<UNIT
[Unit]
Description=BENJADMIN protected telemetry timer ($NODE_ID)

[Timer]
OnBootSec=45s
OnUnitActiveSec=60s
AccuracySec=10s
RandomizedDelaySec=8s
Persistent=true

[Install]
WantedBy=timers.target
UNIT
systemctl daemon-reload
systemctl enable --now benjadmin-protected-telemetry.timer
systemctl show benjadmin-protected-telemetry.service -p LoadState -p ActiveState -p SubState --no-pager
echo "BENJADMIN_PROTECTED_TELEMETRY_INSTALLED node=$NODE_ID"
