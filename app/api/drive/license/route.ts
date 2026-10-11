import { type NextRequest, NextResponse } from "next/server";
import { resolveProjectCoreAuth } from "@/app/lib/project-core/auth";
import { listAccessibleProjects } from "@/app/lib/project-core/store";
import { hasPersonalDriveAccess } from "@/app/lib/dimpro-auth/repository";
import { authQuery } from "@/app/lib/dimpro-auth/db";
import { classifyDriveAccessGrant } from "@/app/lib/drive-core/driveLicenseCore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = { "cache-control": "private, no-store" };

type DriveGrantRow = {
  role_code: string;
  role_name: string;
  scope: string;
  project_id: string | null;
  external_project_id: string | null;
  valid_from: Date | string;
  valid_until: Date | string | null;
  revoked_at: Date | string | null;
};

/**
 * Read-only, user-scoped Drive license/account overview.
 *
 * Central AUTH grants are access rights, NOT paid licenses. Never invent an
 * active subscription, paid plan, expiry, billing status or a quota based on a
 * technical role. The legacy Identity Core license admin is not user-facing.
 */
export async function GET(request: NextRequest) {
  const access = await resolveProjectCoreAuth(request);
  if (!access.ok) {
    return NextResponse.json({ ok: false, error: access.error }, { status: access.status, headers });
  }

  try {
    const [grants, personalDrive, accessibleProjects] = await Promise.all([
      authQuery<DriveGrantRow>(
        `SELECT role.code AS role_code, role.name AS role_name,
                CASE WHEN g.project_id IS NOT NULL THEN 'PROJECT' ELSE 'PERSONAL_OR_GLOBAL' END AS scope,
                g.project_id::text AS project_id,
                proj.external_project_id,
                g.valid_from, g.valid_until, g.revoked_at
           FROM public.auth_access_grants g
           JOIN public.auth_roles role ON role.id = g.role_id
           JOIN public.auth_products product ON product.id = g.product_id
           LEFT JOIN public.auth_projects proj ON proj.id = g.project_id
          WHERE g.user_id = $1::uuid AND product.code = 'DRIVE'
          ORDER BY g.created_at DESC, g.id DESC LIMIT 100`,
        [access.actor.userId],
      ),
      hasPersonalDriveAccess(access.actor.userId),
      listAccessibleProjects(access.actor.userAliases),
    ]);

    const now = Date.now();
    return NextResponse.json({
      ok: true,
      user: { email: access.actor.email, displayName: access.actor.displayName },
      personalDrive: { enabled: personalDrive },
      projects: accessibleProjects.map((project) => ({
        id: project.id, name: project.name, code: project.code || null,
        status: project.status, access: project.membership.role,
      })),
      grants: grants.rows.map((row) => ({
        roleCode: row.role_code, roleName: row.role_name,
        scope: row.scope, externalProjectId: row.external_project_id,
        validFrom: row.valid_from, validUntil: row.valid_until,
        status: classifyDriveAccessGrant(row, now),
      })),
      subscription: {
        status: "UNLINKED" as const,
        planCode: null, paidUntil: null, billingStatus: null,
        explanation: "A központi AUTH jogosultságok és a Licencközpont előfizetései közötti hiteles összerendelés még nincs aktiválva.",
      },
    }, { headers });
  } catch {
    return NextResponse.json({
      ok: false,
      error: "A DIMPRO Drive licenc- és jogosultsági adatai jelenleg nem tölthetők be.",
    }, { status: 503, headers });
  }
}
