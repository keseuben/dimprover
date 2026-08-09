import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";
import { getDropWorkerConfig } from "./dropWorkerConfig";

const ALLOWED_WORKER_HOSTS = new Set([
  "127.0.0.1",
  "localhost",
  "license.dimpro.hu",
  "projektkapu.dimpro.hu",
  "door.dimpro.hu",
]);

function requestHost(request: NextRequest) {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return (forwarded || request.headers.get("host") || "")
    .replace(/:\d+$/, "")
    .toLocaleLowerCase("en-US");
}

export function isDropWorkerHostAllowed(request: NextRequest) {
  return ALLOWED_WORKER_HOSTS.has(requestHost(request));
}

export function isDropWorkerAuthorized(request: NextRequest) {
  const config = getDropWorkerConfig();
  const provided = request.headers.get("x-dimpro-drop-worker-secret")?.trim() || "";
  if (!config.enabled || !provided || provided.length !== config.secret.length) return false;
  return timingSafeEqual(Buffer.from(provided, "utf8"), Buffer.from(config.secret, "utf8"));
}
