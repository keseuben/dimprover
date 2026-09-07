#!/usr/bin/env bash
set -Eeuo pipefail
NODE_ID="${1:-}"
case "$NODE_ID" in prod-vps|db-vps) ;; *) echo "Usage: install-protected-telemetry-agent.sh prod-vps|db-vps" >&2; exit 2;; esac
AGENT_SOURCE="${BENJADMIN_AGENT_SOURCE:-./protected-telemetry-agent.py}"
ENDPOINT="https://admin.dev.dimpro.hu/api/dev/grid/protected-telemetry"
[[ $EUID -eq 0 ]] || { echo "root required" >&2; exit 3; }
[[ -f "$AGENT_SOURCE" ]] || { echo "agent source missing" >&2; exit 4; }
command -v python3 >/dev/null
command -v systemctl >/dev/null
install -d -m 0750 /opt/benjadmin /etc/benjadmin
if [[ -f /opt/benjadmin/protected-telemetry-agent.py ]]; then
  if ! cmp -s "$AGENT_SOURCE" /opt/benjadmin/protected-telemetry-agent.py; then
    echo "An existing agent differs; review it before replacing." >&2; exit 5
  fi
else
  install -m 0755 "$AGENT_SOURCE" /opt/benjadmin/protected-telemetry-agent.py
fi
# The first run requires an admin-issued one-time code entered without shell history.
# A failed enrollment stops before any systemd unit is created or enabled.
/usr/bin/python3 /opt/benjadmin/protected-telemetry-agent.py --node-id "$NODE_ID" --key-file /etc/benjadmin/protected-telemetry.key --endpoint "$ENDPOINT"
test -s /etc/benjadmin/protected-telemetry.key
chmod 0600 /etc/benjadmin/protected-telemetry.key
cat > /etc/systemd/system/benjadmin-protected-telemetry.service <<UNIT
[Unit]
Description=BENJADMIN protected read-only telemetry ($NODE_ID)
After=network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=benjadmin-metrics
DynamicUser=yes
LoadCredential=telemetry.key:/etc/benjadmin/protected-telemetry.key
ExecStart=/usr/bin/python3 /opt/benjadmin/protected-telemetry-agent.py --node-id $NODE_ID --key-file %d/telemetry.key --endpoint $ENDPOINT
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=true
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
PrivateDevices=true
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
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
systemctl show benjadmin-protected-telemetry.timer -p LoadState -p ActiveState -p SubState --no-pager
echo "BENJADMIN_PROTECTED_TELEMETRY_INSTALLED node=$NODE_ID"
