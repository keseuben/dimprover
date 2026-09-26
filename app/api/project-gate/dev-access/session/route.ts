import { type NextRequest, NextResponse } from "next/server";
import {
  createProjectGateDevAccessToken,
  isDriveDevAccessConfigured,
  isSimpleDevAccessConfigured,
  PROJECT_GATE_DEV_ACCESS_COOKIE,
  projectGateDevAccessCookieOptions,
  requestHasSimpleDevAccess,
  verifyDriveDevAccessPassword,
  verifyProjectGateDevAccessCode,
} from "@/app/lib/project-gate/devAccess";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type AttemptState = { count: number; resetAt: number };
const attempts = new Map<string, AttemptState>();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hostOf(request: NextRequest) {
  return request.headers.get("x-forwarded-host") || request.headers.get("host") || "";
}

function clientKey(request: NextRequest) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown"
  );
}

function noStore(response: NextResponse) {
  response.headers.set("Cache-Control", "no-store, max-age=0");
  response.headers.set("Pragma", "no-cache");
  return response;
}

function rateState(key: string) {
  const now = Date.now();
  const current = attempts.get(key);
  if (!current || current.resetAt <= now) {
    const next = { count: 0, resetAt: now + WINDOW_MS };
    attempts.set(key, next);
    return next;
  }
  return current;
}

export async function GET(request: NextRequest) {
  const host = hostOf(request);
  if (!isSimpleDevAccessConfigured(host)) {
    return noStore(NextResponse.json({ ok: false, code: "PROJECTKAPU_DEV_ACCESS_DISABLED" }, { status: 404 }));
  }
  return noStore(NextResponse.json({ ok: true, authenticated: requestHasSimpleDevAccess(request) }));
}

export async function POST(request: NextRequest) {
  const host = hostOf(request);
  if (!isSimpleDevAccessConfigured(host)) {
    return noStore(NextResponse.json({ ok: false, error: "Az ideiglenes DIMPRO belépés ezen a hoston nem aktív.", code: "PROJECTKAPU_DEV_ACCESS_DISABLED" }, { status: 404 }));
  }

  const key = clientKey(request);
  const state = rateState(key);
  if (state.count >= MAX_ATTEMPTS) {
    return noStore(NextResponse.json({ ok: false, error: "Túl sok hibás próbálkozás. Próbáld újra később.", code: "PROJECTKAPU_DEV_ACCESS_RATE_LIMITED" }, { status: 429 }));
  }

  const body = await request.json().catch(() => null) as { code?: unknown; password?: unknown } | null;
  const driveMode = isDriveDevAccessConfigured(host);
  const validCredential = driveMode
    ? verifyDriveDevAccessPassword(body?.password)
    : verifyProjectGateDevAccessCode(body?.code);
  if (!validCredential) {
    state.count += 1;
    attempts.set(key, state);
    return noStore(NextResponse.json({
      ok: false,
      error: driveMode ? "Hibás jelszó." : "Hibás belépési kód.",
      code: driveMode ? "DRIVE_DEV_PASSWORD_INVALID" : "PROJECTKAPU_DEV_ACCESS_CODE_INVALID",
    }, { status: 401 }));
  }

  attempts.delete(key);
  const session = createProjectGateDevAccessToken();
  const response = NextResponse.json({
    ok: true,
    next: isDriveDevAccessConfigured(host) ? "/drive" : "/projektkapu/projects",
  });
  response.cookies.set(
    PROJECT_GATE_DEV_ACCESS_COOKIE,
    session.token,
    projectGateDevAccessCookieOptions(host, session.maxAge),
  );
  return noStore(response);
}

export async function DELETE(request: NextRequest) {
  const host = hostOf(request);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(PROJECT_GATE_DEV_ACCESS_COOKIE, "", {
    ...projectGateDevAccessCookieOptions(host, 0),
    expires: new Date(0),
  });
  return noStore(response);
}
