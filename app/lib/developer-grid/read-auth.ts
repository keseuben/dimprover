"server-only";

import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { isChatGridDeviceAuthorized } from "@/app/lib/dev-center/chatgrid-device-auth";

/**
 * Developer Grid read plane authorization.
 *
 * Mutations still use the existing Dev Center mutation subject gates.
 * A paired ChatGrid/Developer Grid desktop device is intentionally READ ONLY
 * and can only consume the new Developer Grid state/event/foundation APIs.
 */
export async function isDeveloperGridReadAuthorized(headers: Headers) {
  if (await isDevCenterAuthorized(headers, true)) return true;
  return isChatGridDeviceAuthorized(headers);
}
