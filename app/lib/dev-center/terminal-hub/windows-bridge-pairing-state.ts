export type WindowsBridgePairingStatus = "pending" | "claimed" | "completed" | "expired" | "locked" | "cancelled";
export type WindowsBridgeDeviceStatus = "pending" | "approved" | "active" | "revoked" | "blocked";

const PAIRING_TRANSITIONS: Record<WindowsBridgePairingStatus, readonly WindowsBridgePairingStatus[]> = {
  pending: ["claimed", "expired", "locked", "cancelled"],
  claimed: ["completed", "expired", "cancelled"],
  completed: [],
  expired: [],
  locked: [],
  cancelled: [],
};

const DEVICE_TRANSITIONS: Record<WindowsBridgeDeviceStatus, readonly WindowsBridgeDeviceStatus[]> = {
  pending: ["approved", "revoked", "blocked"],
  approved: ["active", "revoked", "blocked"],
  active: ["revoked", "blocked"],
  revoked: ["pending"],
  blocked: ["pending"],
};

export function canWindowsBridgePairingTransition(from: WindowsBridgePairingStatus, to: WindowsBridgePairingStatus) {
  return PAIRING_TRANSITIONS[from].includes(to);
}

export function canWindowsBridgeDeviceTransition(from: WindowsBridgeDeviceStatus, to: WindowsBridgeDeviceStatus) {
  return DEVICE_TRANSITIONS[from].includes(to);
}
