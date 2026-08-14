export type TerminalOsIdentity = {
  label: string;
  uid: number;
  gid: number;
  home: string;
  shell: string;
};

export type TerminalOsIdentityReadiness = {
  ready: boolean;
  identity: TerminalOsIdentity | null;
  blocker: string | null;
};

function positiveInteger(value: string | undefined) {
  const parsed = Number(value?.trim());
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 0;
}

export function getTerminalOsIdentityReadiness(): TerminalOsIdentityReadiness {
  const uid = positiveInteger(process.env.BENJADMIN_TERMINAL_UID);
  const gid = positiveInteger(process.env.BENJADMIN_TERMINAL_GID);
  const label = process.env.BENJADMIN_TERMINAL_OS_LABEL?.trim() || "benjadmin-terminal";
  const home = process.env.BENJADMIN_TERMINAL_HOME?.trim() || "/tmp";
  const shell = process.env.BENJADMIN_TERMINAL_SHELL?.trim() || "/bin/bash";
  if (!uid || !gid) return { ready: false, identity: null, blocker: "A nem-root terminál UID/GID nincs konfigurálva." };
  if (uid === 0 || gid === 0) return { ready: false, identity: null, blocker: "Root UID/GID nem engedélyezett." };
  if (!home.startsWith("/") || !shell.startsWith("/")) return { ready: false, identity: null, blocker: "A terminál HOME/SHELL útvonal nem abszolút." };
  return { ready: true, identity: { label, uid, gid, home, shell }, blocker: null };
}
