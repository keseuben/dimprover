import { dimproIdentityErrorResponse, dimproIdentityJson } from "@/app/lib/identity-core/api";
import { getDimproIdentitySchemaHealth } from "@/app/lib/identity-core/repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  try {
    const health = await getDimproIdentitySchemaHealth();
    return dimproIdentityJson({
      ok: health.ready,
      service: "dimpro-identity-core",
      version: health.marker?.schemaVersion || "0.2.0",
      ...health,
    }, health.ready ? 200 : 503);
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
