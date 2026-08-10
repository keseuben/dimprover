import { type NextRequest, NextResponse } from "next/server";
import { assertDropFeatureEnabled, getDropFeatureState } from "@/app/lib/drop/dropFeatureFlags";
import { dropErrorResponse, dropNoStoreHeaders } from "@/app/lib/drop/dropApi";
import {
  getDropSpacePackageSchemaHealth,
  listDropSpaceMemberships,
  listVisibleDropSpacePackages,
  resolveDropSpaceSession,
} from "@/app/lib/drop/dropSpaceRepository";
import { createPackageInDropSpace } from "@/app/lib/drop/dropSpacePackageService";
import { sendDropPackageInvitations } from "@/app/lib/drop/dropEmail";
import { getDropGlobalUploadReadiness } from "@/app/lib/drop/storage/dropUploadService";
import { DROP_SPACE_SESSION_COOKIE } from "@/app/lib/drop/dropSpaceSecurity";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import { writeDropEvent } from "@/app/lib/drop/dropRepository";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function missingSession() {
  return NextResponse.json(
    { ok: false, error: "Nincs aktív Drop tér munkamenet.", code: "DROP_SPACE_SESSION_MISSING" },
    { status: 401, headers: dropNoStoreHeaders() },
  );
}

async function resolveRequestSession(request: NextRequest) {
  const rawSession = request.cookies.get(DROP_SPACE_SESSION_COOKIE)?.value?.trim();
  if (!rawSession) return null;
  return resolveDropSpaceSession(rawSession);
}

export async function GET(request: NextRequest) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    const session = await resolveRequestSession(request);
    if (!session) return missingSession();
    const featureState = getDropFeatureState();
    const schema = await getDropSpacePackageSchemaHealth();
    const [packages, memberships, uploadReadiness] = await Promise.all([
      listVisibleDropSpacePackages(session),
      listDropSpaceMemberships(session.space.id),
      getDropGlobalUploadReadiness(),
    ]);
    const activeMembers = memberships
      .filter((member) => member.status === "active")
      .map((member) => ({
        id: member.id,
        displayName: member.displayName,
        email: member.email,
        organizationName: member.organizationName,
        role: member.role,
        isSelf: member.id === session.membership.id,
      }));
    const creationReady = Boolean(
      featureState.flags.spacePackageCreationEnabled
        && featureState.flags.packageEngineEnabled
        && schema.ready
        && session.permissions.includes("package.create")
        && session.runtimeMode === "writable",
    );
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 1.2.12",
        packages,
        activeMembers,
        projects: session.projects.map((project) => ({
          id: project.projectId,
          name: project.projectNameSnapshot,
        })),
        creation: {
          ready: creationReady,
          schemaReady: schema.ready,
          featureEnabled: featureState.flags.spacePackageCreationEnabled,
          permissionGranted: session.permissions.includes("package.create"),
          runtimeMode: session.runtimeMode,
          fileUploadEnabled: uploadReadiness.uploadReady,
          uploadReadiness,
          note: schema.ready
            ? featureState.flags.spacePackageCreationEnabled
              ? uploadReadiness.uploadReady
                ? "A térbeli csomagkészítés és a biztonságos tárhelyfeltöltés aktív."
                : "A térbeli csomagkészítés aktív, de a tárhelyfeltöltés jelenleg nem áll készen."
              : "A térbeli csomagkészítés kapcsolója zárva van."
            : "A tércsomag-adatmodell még nincs alkalmazva.",
        },
      },
      { headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    assertDropFeatureEnabled("spacesEnabled");
    assertDropFeatureEnabled("spacePackageCreationEnabled");
    const schema = await getDropSpacePackageSchemaHealth();
    if (!schema.ready) {
      return NextResponse.json(
        {
          ok: false,
          error: "A DROP 0.3.2 atomi tércsomag-séma még nincs alkalmazva.",
          code: "DROP_SPACE_PACKAGE_SCHEMA_NOT_READY",
        },
        { status: 503, headers: dropNoStoreHeaders() },
      );
    }
    const session = await resolveRequestSession(request);
    if (!session) return missingSession();
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Érvénytelen tércsomag-létrehozási kérés.", code: "DROP_SPACE_PACKAGE_INPUT_INVALID" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    if ((body as Record<string, unknown>).rulesAccepted !== true) {
      return NextResponse.json(
        { ok: false, error: "A csomaglétrehozási és feltöltési szabályok elfogadása kötelező.", code: "DROP_PACKAGE_RULES_ACCEPTANCE_REQUIRED" },
        { status: 400, headers: dropNoStoreHeaders() },
      );
    }
    const created = await createPackageInDropSpace(session, body);
    await writeDropEvent({
      packageId: created.package.id,
      eventType: "package.rules_accepted",
      actorName: session.membership.displayName,
      actorEmail: session.membership.email,
      payload: {
        rulesVersion: DROP_UPLOAD_RULES_VERSION,
        acceptedAt: new Date().toISOString(),
        membershipId: session.membership.id,
      },
    });
    const emailNotification = await sendDropPackageInvitations(created).catch((error) => ({
      enabled: true,
      configured: true,
      kind: "invitation" as const,
      attempted: 0,
      sent: 0,
      failed: 1,
      skipped: 0,
      recipients: [],
      generatedAt: new Date().toISOString(),
      note: error instanceof Error ? error.message : "A csomagmeghívó e-mail küldése sikertelen.",
    }));
    return NextResponse.json(
      {
        ok: true,
        version: "DROP 1.2.12",
        created,
        emailNotification,
        warning: emailNotification.sent > 0
          ? "A hozzáférési adatok e-mailben elküldve a kiválasztott címzetteknek."
          : "A csomag létrejött, de nem történt sikeres e-mailes kézbesítés. Az adminisztratív hozzáférési adatok tartalékként elérhetők.",
      },
      { status: 201, headers: dropNoStoreHeaders() },
    );
  } catch (error) {
    return dropErrorResponse(error);
  }
}
