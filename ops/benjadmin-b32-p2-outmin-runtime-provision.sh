#!/usr/bin/env bash
set -euo pipefail

WORKTREE="/srv/dimpro-dev/worktrees/benjadmin-operator-ui-v2"
PARTNER_ROOT="/srv/partner-dev"
INTERNAL_ROOT="/srv/dimpro-dev"
SECRET_ROOT="/root/.dimpro-secrets/benjadmin"
PUBKEY_SOURCE="$SECRET_ROOT/outminai-dev-authorized-key.pub"
TOKEN_HASH="$SECRET_ROOT/outminai-mcp-token.sha256"
GROUP="dimpro-partner"
USER_NAME="outmin"
HOME_DIR="$PARTNER_ROOT/home/$USER_NAME"
MARKER="$PARTNER_ROOT/.outmin-runtime-ready.json"

fail() {
  echo "ERROR: $*" >&2
  exit 1
}

[[ ${EUID:-$(id -u)} -eq 0 ]] || fail "root jogosultság szükséges"
[[ -d "$WORKTREE" ]] || fail "DEV worktree nem található; a script csak a DIMPRO DEV VPS-en futtatható"
[[ -d "$INTERNAL_ROOT" ]] || fail "DEV root nem található"
[[ -d "$PARTNER_ROOT" ]] || fail "Partner runtime preflight root nem található"
[[ -s "$PUBKEY_SOURCE" ]] || fail "OutminAI SSH public key nincs stagingelve"
[[ -s "$TOKEN_HASH" ]] || fail "OutminAI worker token hash nincs stagingelve"

grep -Eq '^[a-f0-9]{64}$' "$TOKEN_HASH" || fail "Érvénytelen worker token hash"
ssh-keygen -lf "$PUBKEY_SOURCE" >/dev/null 2>&1 || fail "Érvénytelen OutminAI SSH public key"

TS=$(date -u +%Y%m%dT%H%M%SZ)
SNAP="$SECRET_ROOT/os-backups/$TS"
mkdir -p "$SNAP"
chmod 0700 "$SECRET_ROOT" "$SECRET_ROOT/os-backups" "$SNAP"
getent passwd > "$SNAP/passwd.getent.before"
getent group > "$SNAP/group.getent.before"
stat -c '%a %U:%G %n' "$INTERNAL_ROOT" "$PARTNER_ROOT" > "$SNAP/runtime-modes.before"
if [[ -f "$HOME_DIR/.ssh/authorized_keys" ]]; then
  cp -a "$HOME_DIR/.ssh/authorized_keys" "$SNAP/authorized_keys.before"
fi

if getent group "$GROUP" >/dev/null; then
  echo "INFO: $GROUP csoport már létezik"
else
  groupadd --system "$GROUP"
  echo "PASS: $GROUP csoport létrehozva"
fi

if id "$USER_NAME" >/dev/null 2>&1; then
  ACTUAL_GROUP=$(id -gn "$USER_NAME")
  ACTUAL_HOME=$(getent passwd "$USER_NAME" | cut -d: -f6)
  [[ "$ACTUAL_GROUP" == "$GROUP" ]] || fail "létező outmin user elsődleges csoportja nem $GROUP"
  [[ "$ACTUAL_HOME" == "$HOME_DIR" ]] || fail "létező outmin user home könyvtára nem $HOME_DIR"
  echo "INFO: $USER_NAME service user már létezik és megfelel"
else
  useradd \
    --system \
    --gid "$GROUP" \
    --home-dir "$HOME_DIR" \
    --create-home \
    --shell /bin/bash \
    --comment "DIMPRO BENJADMIN OutminAI partner worker" \
    "$USER_NAME"
  echo "PASS: $USER_NAME service user létrehozva"
fi

chown root:"$GROUP" "$PARTNER_ROOT"
chmod 0750 "$PARTNER_ROOT"
mkdir -p "$PARTNER_ROOT/home"
chown root:"$GROUP" "$PARTNER_ROOT/home"
chmod 0750 "$PARTNER_ROOT/home"

for rel in repositories worktrees worktrees/outmin integration artifacts logs cache cache/outmin tmp tmp/outmin; do
  target="$PARTNER_ROOT/$rel"
  mkdir -p "$target"
  chown "$USER_NAME":"$GROUP" "$target"
  chmod 0750 "$target"
done

chown "$USER_NAME":"$GROUP" "$HOME_DIR"
chmod 0750 "$HOME_DIR"
install -d -m 0700 -o "$USER_NAME" -g "$GROUP" "$HOME_DIR/.ssh"
{
  printf 'restrict '
  cat "$PUBKEY_SOURCE"
} > "$HOME_DIR/.ssh/authorized_keys"
chown "$USER_NAME":"$GROUP" "$HOME_DIR/.ssh/authorized_keys"
chmod 0600 "$HOME_DIR/.ssh/authorized_keys"

chown root:root "$INTERNAL_ROOT"
chmod 0750 "$INTERNAL_ROOT"

GROUPS=$(id -nG "$USER_NAME")
for forbidden in sudo adm root docker lxd; do
  if tr ' ' '\n' <<<"$GROUPS" | grep -Fxq "$forbidden"; then
    fail "$USER_NAME tiltott kiegészítő csoport tagja: $forbidden"
  fi
done

TEST_FILE="$PARTNER_ROOT/worktrees/outmin/.p2-os-write-$TS"
runuser -u "$USER_NAME" -- touch "$TEST_FILE" || fail "OutminAI nem tud írni a partner worktree-be"
runuser -u "$USER_NAME" -- rm -f "$TEST_FILE" || fail "OutminAI tesztfájl cleanup sikertelen"
echo "PASS: partner write acceptance"

if runuser -u "$USER_NAME" -- test -x "$INTERNAL_ROOT"; then
  fail "OutminAI át tudja járni a belső DIMPRO rootot"
fi
if runuser -u "$USER_NAME" -- test -r "$INTERNAL_ROOT"; then
  fail "OutminAI olvasni tudja a belső DIMPRO rootot"
fi
echo "PASS: internal DIMPRO root read/traverse DENIED"

if runuser -u "$USER_NAME" -- test -r "$TOKEN_HASH"; then
  fail "OutminAI olvasni tudja a root-only secret store-t"
fi
echo "PASS: root secret store DENIED"

cat > "$MARKER" <<JSON
{
  "ready": false,
  "version": "1.0.0",
  "user": "$USER_NAME",
  "group": "$GROUP",
  "internalRootProtected": true,
  "workerTokenReady": true,
  "sshIdentityReady": false,
  "completedAt": "$TS"
}
JSON
chown root:root "$MARKER"
chmod 0600 "$MARKER"

getent passwd "$USER_NAME" > "$SNAP/passwd.outmin.after"
getent group "$GROUP" > "$SNAP/group.partner.after"
stat -c '%a %U:%G %n' \
  "$INTERNAL_ROOT" \
  "$PARTNER_ROOT" \
  "$PARTNER_ROOT/repositories" \
  "$PARTNER_ROOT/worktrees/outmin" \
  "$HOME_DIR" \
  "$HOME_DIR/.ssh" \
  "$HOME_DIR/.ssh/authorized_keys" \
  "$MARKER" > "$SNAP/runtime-modes.after"

printf '\nB3.2 P2 OUTMIN RUNTIME PROVISION: LOCAL OS ACCEPTANCE PASS\n'
printf 'user=%s group=%s home=%s\n' "$USER_NAME" "$GROUP" "$HOME_DIR"
printf 'internal_root=DENY partner_write=ALLOW secret_store=DENY\n'
printf 'ssh_external_acceptance=PENDING\n'
printf 'snapshot=%s\n' "$SNAP"
