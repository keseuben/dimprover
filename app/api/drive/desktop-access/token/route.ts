import { NextRequest, NextResponse } from "next/server";
import { bearerToken, windowsBridgeApiError } from "@/app/lib/dev-center/terminal-hub/windows-bridge-api";
import { authenticateWindowsBridgeDeviceForDriveDesktop } from "@/app/lib/dev-center/terminal-hub/windows-bridge-pairing";
import { issueDriveDesktopAccessToken } from "@/app/lib/drive/desktopAccessToken";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const bridgeToken = bearerToken(request.headers);
    if (!bridgeToken) {
      return NextResponse.json(
        { ok: false, code: "BRIDGE_DEVICE_AUTH_REQUIRED", error: "Windows Bridge device token szükséges." },
        { status: 401, headers: { "cache-control": "no-store" } },
      );
    }
    const { device } = await authenticateWindowsBridgeDeviceForDriveDesktop(bridgeToken);
    const clientId = request.headers.get("x-dimpro-drive-client-id")?.trim() || `drive-desktop-${String(device.id)}`;
    const issued = issueDriveDesktopAccessToken({
      deviceId: String(device.id),
      agentId: String(device.agent_id),
      clientId,
    });
    return NextResponse.json(
      {
        ok: true,
        accessToken: issued.token,
        tokenType: "Bearer",
        expiresAt: issued.expiresAt,
        expiresInSeconds: issued.expiresInSeconds,
        deviceId: issued.claims.deviceId,
        agentId: issued.claims.agentId,
        clientId: issued.claims.clientId,
      },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    return windowsBridgeApiError(error);
  }
}
