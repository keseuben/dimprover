import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

function safeHttpsOrigin(value: string | undefined) {
  const candidate = value?.trim();
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" ? url.origin : null;
  } catch {
    return null;
  }
}

function resolveDropObjectStorageUploadOrigin() {
  const endpointOrigin = safeHttpsOrigin(
    process.env.DIMPRO_DROP_S3_ENDPOINT || process.env.DROP_STORAGE_ENDPOINT,
  );
  if (!endpointOrigin) return null;
  const forcePathStyle = (process.env.DIMPRO_DROP_S3_FORCE_PATH_STYLE || process.env.DROP_STORAGE_FORCE_PATH_STYLE)
    ?.trim()
    .toLowerCase() === "true";
  if (forcePathStyle) return endpointOrigin;
  const bucket = (process.env.DIMPRO_DROP_S3_BUCKET || process.env.DROP_STORAGE_BUCKET || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/.test(bucket)) return null;
  try {
    const uploadUrl = new URL(endpointOrigin);
    uploadUrl.hostname = `${bucket}.${uploadUrl.hostname}`;
    return uploadUrl.origin;
  } catch {
    return null;
  }
}

const dropObjectStorageOrigin = resolveDropObjectStorageUploadOrigin();

function applyDropSecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("X-Frame-Options", "DENY");
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=()",
  );
  response.headers.set(
    "Content-Security-Policy",
    `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; worker-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:${dropObjectStorageOrigin ? ` ${dropObjectStorageOrigin}` : ""}; font-src 'self' data:; connect-src 'self'${dropObjectStorageOrigin ? ` ${dropObjectStorageOrigin}` : ""}; object-src 'none'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'`,
  );
  response.headers.set("Cache-Control", "no-store, max-age=0");
  return response;
}

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({
    request,
  });

  const pathname = request.nextUrl.pathname;
  const hostHeader = request.headers.get("host") ?? "";
  const host = hostHeader.replace(/:\d+$/, "");
  const isLoginPage = pathname.startsWith("/login");
  const isLegacyMeetingAssistantPath = pathname.startsWith("/jegyzokonyvek/ertekezleti-kisero");
  const isDevEnvironment = host === "dev.dimpro.hu" || host === "dev.dimprover.hu" || host.endsWith(".dev.dimpro.hu");
  const isDimproAppHost = host === "app.dimpro.hu" || host === "www.app.dimpro.hu" || host === "app.dev.dimpro.hu";
  const isDimproHost = host === "dimpro.hu" || host === "www.dimpro.hu";
  const isDimproPublicHome = isDimproHost && pathname === "/";
  const isDimproLegalPage = pathname === "/adatvedelem" || pathname === "/felhasznalasi-feltetelek";
  const isDimproGazdaSegedMarketing = isDimproHost && pathname.startsWith("/gazdaseged");
  const isDimproRenovationCalculator = isDimproHost && pathname.startsWith("/felujitasi-gyorskalkulator");
  const isDimproPropertySurvey = isDimproHost && pathname.startsWith("/ingatlanfelmero");
  const isDimproCostDatabase = isDimproHost && pathname.startsWith("/koltsegadatbazis");
  const isDropHost = host === "drop.dimpro.hu" || host === "www.drop.dimpro.hu" || host === "drop.dev.dimpro.hu";
  const isLocalInternalHost = host === "127.0.0.1" || host === "localhost";
  const isDropInternalWorkerApi = isLocalInternalHost && pathname === "/api/drop/worker/run";
  const isProjectGateHost = host === "projektkapu.dimpro.hu" || host === "www.projektkapu.dimpro.hu" || host === "projektkapu.dev.dimpro.hu";
  const isProjectGateBrandHost = host === "door.dimpro.hu" || host === "www.door.dimpro.hu";
  let projectGateRewriteUrl: URL | null = null;
  const isDropPublicPage =
    pathname === "/" ||
    pathname === "/open" ||
    pathname === "/send" ||
    pathname === "/bekuldes" ||
    pathname.startsWith("/bekuldes/") ||
    pathname.startsWith("/u/") ||
    pathname.startsWith("/p/") ||
    pathname.startsWith("/d/") ||
    pathname.startsWith("/report/") ||
    pathname.startsWith("/join/") ||
    pathname.startsWith("/space/");
  const isDropIdentityPublicApiRoute =
    pathname === "/api/dimpro-identity/health" ||
    pathname === "/api/dimpro-identity/send/verify" ||
    pathname === "/api/dimpro-identity/send/projects" ||
    pathname === "/api/dimpro-identity/send/contacts" ||
    pathname === "/api/dimpro-identity/projects/verify-code";
  const isDropPublicApiRoute =
    pathname === "/api/drop/health" ||
    pathname === "/api/drop/features" ||
    pathname === "/api/drop/access/open" ||
    pathname === "/api/drop/access/pin-recovery" ||
    pathname === "/api/drop/access/token" ||
    pathname === "/api/drop/access/groups" ||
    pathname.startsWith("/api/drop/access/files/") ||
    pathname.startsWith("/api/drop/access/uploads/") ||
    pathname.startsWith("/api/drop/public/") ||
    pathname.startsWith("/api/drop/spaces/") ||
    pathname.startsWith("/api/drop/uploads/") ||
    pathname.startsWith("/api/drop/downloads/file/") ||
    pathname === "/api/drop/downloads/package/zip" ||
    pathname === "/api/drop/downloads/package/report" ||
    pathname === "/api/drop/downloads/package/text";
  const isDropInternalPage = pathname === "/drop" || pathname.startsWith("/drop/");
  const isDropInternalRewrite = request.headers.get("x-dimpro-drop-internal") === "1";
  const isDropBlockedRewrite = request.headers.get("x-dimpro-drop-blocked") === "1";
  const isAruterHost = host === "aruter.dimpro.hu" || host === "www.aruter.dimpro.hu" || host === "aruter.dev.dimpro.hu";
  const isGazdaSegedHost = host === "gazdaseged.dimpro.hu" || host === "www.gazdaseged.dimpro.hu";
  const isEventHost = host === "esemeny.dimpro.hu" || host === "www.esemeny.dimpro.hu";
  const isLicenseHost = host === "license.dimpro.hu" || host === "license.dev.dimpro.hu";
  const isBenjadminHost = host === "admin.dimpro.hu" || host === "admin.dev.dimpro.hu" || host === "admin.stag.dimpro.hu";
  const isDevHost = new Set([
    "dev.dimpro.hu",
    "admin.dev.dimpro.hu",
    "dev.dimprover.hu",
  ]).has(host);
  const isLicenseAdminArea = (isLicenseHost || isDevHost || isBenjadminHost) && (
    pathname === "/" ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/") ||
    pathname.startsWith("/adminlog") ||
    pathname === "/customer" ||
    pathname.startsWith("/customer/")
  );
  const isDimproFajlmuhelyReleasePage = pathname.startsWith("/releases/dimpro-fajlmuhely");
  const isDrivePage = pathname === "/drive" || pathname.startsWith("/drive/");
  const isAruterSubdomainPage = isAruterHost && pathname.startsWith("/aruter");
  const isEventPublicPage = pathname.startsWith("/esemeny") || pathname.startsWith("/torta") || pathname.startsWith("/events/torta") || pathname.startsWith("/api/events/");
  const isProtectedReleaseDownloadPage = pathname.startsWith("/download/");
  const isPublicStaticDownload = pathname.startsWith("/downloads/");
  const isPublicApiRoute =
    pathname.startsWith("/api/dev/") ||
    pathname.startsWith("/api/downloads/") ||
    pathname.startsWith("/api/releases/") ||
    pathname.startsWith("/api/drive/") ||
    pathname === "/api/drop/health" ||
    pathname === "/api/drop/features" ||
    pathname.startsWith("/api/drop/access/") ||
    pathname.startsWith("/api/drop/admin/") ||
    pathname.startsWith("/api/notifications") ||
    pathname.startsWith("/api/projects") ||
    pathname.startsWith("/api/events/") ||
    pathname.startsWith("/api/aruter/") ||
    pathname.startsWith("/api/dimpro-account/") ||
    pathname.startsWith("/api/dimpro-auth/") ||
    pathname.startsWith("/api/dimpro-identity/") ||
    pathname.startsWith("/api/license/") ||
    pathname.startsWith("/api/hage-ai/") ||
    pathname.startsWith("/api/meeting-assistant/") ||
    pathname.startsWith("/api/renovation-energy-certificate") ||
    pathname.startsWith("/api/property-survey/") ||
    pathname.startsWith("/api/calendar/events") ||
    pathname.startsWith("/api/calendar/integrations/status") ||
    pathname.startsWith("/api/calendar/integrations/outlook") ||
    pathname.startsWith("/api/calendar/integrations/google") ||
    isDropInternalWorkerApi;
  const isPublicAruterPage = pathname === "/aruter/kovacs-kerteszet";
  const isTeamsMeetingAssistantPage = pathname.startsWith("/teams/meeting-assistant");

  if (isBenjadminHost && pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  if (isProjectGateBrandHost) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "projektkapu.dimpro.hu";
    url.port = "";
    return NextResponse.redirect(url, 301);
  }

  if (isProjectGateHost && pathname === "/account/modules") {
    return NextResponse.redirect(new URL("/", "https://projektkapu.dimpro.hu"), 307);
  }

  if (isProjectGateHost && !pathname.startsWith("/api/") && !isLoginPage) {
    const url = request.nextUrl.clone();
    if (pathname === "/") url.pathname = "/projektkapu";
    else if (!pathname.startsWith("/projektkapu")) url.pathname = `/projektkapu${pathname}`;
    projectGateRewriteUrl = url;
  }

  if (isDropInternalRewrite && isDropInternalPage) {
    const internalResponse = isDropBlockedRewrite
      ? NextResponse.next({ request, status: 404 })
      : response;
    return applyDropSecurityHeaders(internalResponse);
  }

  if (isDropHost) {
    if (pathname.startsWith("/api/")) {
      if (!isDropPublicApiRoute && !isDropIdentityPublicApiRoute) {
        return applyDropSecurityHeaders(
          NextResponse.json({ ok: false, error: "Ez az API nem érhető el a DIMPRO Drop nyilvános hostján." }, { status: 404 }),
        );
      }
      return applyDropSecurityHeaders(NextResponse.next({ request }));
    }

    const url = request.nextUrl.clone();
    const rewriteHeaders = new Headers(request.headers);
    rewriteHeaders.set("x-dimpro-drop-internal", "1");

    if (!isDropPublicPage) {
      url.pathname = "/drop/unavailable";
      rewriteHeaders.set("x-dimpro-drop-blocked", "1");
      return applyDropSecurityHeaders(
        NextResponse.rewrite(url, { status: 404, request: { headers: rewriteHeaders } }),
      );
    }

    url.pathname = pathname === "/" ? "/drop" : `/drop${pathname}`;
    return applyDropSecurityHeaders(
      NextResponse.rewrite(url, { request: { headers: rewriteHeaders } }),
    );
  }

  if (isAruterHost) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = isDevEnvironment ? "app.dev.dimpro.hu" : "app.dimpro.hu";
    url.port = "";
    url.pathname = pathname === "/" ? "/aruter" : pathname;
    return NextResponse.redirect(url);
  }

  if (isGazdaSegedHost) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "app.dimpro.hu";
    url.pathname = pathname === "/" ? "/gazdaseged" : pathname;
    return NextResponse.redirect(url);
  }

  if (isLegacyMeetingAssistantPath) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = isDevEnvironment ? "app.dev.dimpro.hu" : "app.dimpro.hu";
    url.port = "";
    url.pathname = "/ertekezleti-kisero";
    return NextResponse.redirect(url);
  }

  if (isDimproHost && isLoginPage) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "app.dimpro.hu";
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isEventHost && (pathname === "/" || pathname.startsWith("/login"))) {
    const url = request.nextUrl.clone();
    url.pathname = "/esemeny/torta";
    return NextResponse.redirect(url);
  }

  if (isLicenseHost && pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  if (isDimproFajlmuhelyReleasePage && !isDevEnvironment) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "license.dimpro.hu";
    url.port = "";
    url.pathname = "/admin/fajlmuhely-verziok";
    return NextResponse.redirect(url);
  }

  if (isDrivePage && !isLicenseHost && !isDevEnvironment) {
    const url = request.nextUrl.clone();
    url.protocol = "https:";
    url.hostname = "license.dimpro.hu";
    url.port = "";
    return NextResponse.redirect(url);
  }

  if (isEventHost && !isEventPublicPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/esemeny/torta";
    return NextResponse.redirect(url);
  }

  if (
    isLoginPage ||
    isPublicApiRoute ||
    isProtectedReleaseDownloadPage ||
    isPublicStaticDownload ||
    isLicenseAdminArea ||
    (isLicenseHost && isDrivePage) ||
    isPublicAruterPage ||
    isDimproPublicHome ||
    isDimproLegalPage ||
    isDimproGazdaSegedMarketing ||
    isDimproRenovationCalculator ||
    isDimproPropertySurvey ||
    isDimproCostDatabase ||
    isAruterSubdomainPage ||
    isEventPublicPage ||
    isTeamsMeetingAssistantPage
  ) {
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );

          response = NextResponse.next({
            request,
          });

          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  let isLoggedIn = false;
  let loggedInEmail = "";

  try {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    isLoggedIn = !!user;
    loggedInEmail = user?.email?.trim().toLowerCase() || "";
  } catch (error) {
    console.warn(
      "Supabase auth ellenőrzési hiba a proxyban:",
      error instanceof Error ? error.message : "Ismeretlen auth hiba",
    );
    isLoggedIn = false;
  }

  if (isLoggedIn && isDimproAppHost) {
    const allowedEmails = (process.env.DIMPRO_APP_ALLOWED_EMAILS || "keseruben90@gmail.com")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean);

    if (!loggedInEmail || !allowedEmails.includes(loggedInEmail)) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("access", "blocked");
      return NextResponse.redirect(url);
    }
  }

  if (!isLoggedIn && !isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (isLoggedIn && isLoginPage) {
    const url = request.nextUrl.clone();
    url.pathname = isProjectGateHost ? "/projektkapu" : "/account/modules";
    return NextResponse.redirect(url);
  }

  if (projectGateRewriteUrl) {
    const rewritten = NextResponse.rewrite(projectGateRewriteUrl, { request: { headers: request.headers } });
    response.cookies.getAll().forEach((cookie) => rewritten.cookies.set(cookie));
    return rewritten;
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!api/drop/uploads/[^/]+/parts/[0-9]+/?$|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|JPG|JPEG|gif|webp|css|js|mjs|webmanifest|ico)$).*)",
  ],
};
