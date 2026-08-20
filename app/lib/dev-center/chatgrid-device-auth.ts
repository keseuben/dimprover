import { authenticateWindowsBridgeDevice } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";

const CHATGRID_DEVICE_HEADER = "x-benjadmin-chatgrid-device-token";

export function getChatGridDeviceToken(headers: Headers) {
  return headers.get(CHATGRID_DEVICE_HEADER)?.trim() || "";
}

export function isChatGridAgentId(value: string) {
  return /^chatgrid-[a-f0-9-]{16,80}$/i.test(value.trim());
}

export async function isChatGridDeviceAuthorized(headers: Headers) {
  const token = getChatGridDeviceToken(headers);
  if (!token) return false;
  try {
    const { device } = await authenticateWindowsBridgeDevice(token);
    return isChatGridAgentId(String(device.agent_id || ""));
  } catch {
    return false;
  }
}
