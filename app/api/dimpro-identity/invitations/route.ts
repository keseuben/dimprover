import {
  acceptDimproOrganizationInvitation,
  getDimproOrganizationInvitation,
} from "@/app/lib/identity-core/invitations";
import {
  dimproIdentityErrorResponse,
  dimproIdentityJson,
  readDimproIdentityJsonBody,
} from "@/app/lib/identity-core/api";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const token = new URL(request.url).searchParams.get("token") || "";
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.0",
      invitation: await getDimproOrganizationInvitation(token),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = await readDimproIdentityJsonBody(request);
    return dimproIdentityJson({
      ok: true,
      version: "IDENTITY CORE 0.2.0",
      accepted: await acceptDimproOrganizationInvitation(body.token),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
