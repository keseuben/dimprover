import { dimproIdentityErrorResponse, dimproIdentityJson, readDimproIdentityJsonBody } from "@/app/lib/identity-core/api";
import { recordDimproUploadRulesAcceptance } from "@/app/lib/identity-core/repository";
import { DimproIdentityError } from "@/app/lib/identity-core/types";
import { DROP_UPLOAD_RULES_VERSION } from "@/app/lib/drop/dropUploadRules";
import { authorizeFieldCaptureRequest } from "@/app/lib/field-capture/serverService";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const authorized = await authorizeFieldCaptureRequest(request);
    const body = await readDimproIdentityJsonBody(request);
    if (body.accepted !== true) {
      throw new DimproIdentityError("A feltöltési szabályzat elfogadása szükséges.", "FIELD_CAPTURE_UPLOAD_RULES_NOT_ACCEPTED", 400);
    }
    const requestedVersion = typeof body.rulesVersion === "string" ? body.rulesVersion.trim() : "";
    if (requestedVersion !== DROP_UPLOAD_RULES_VERSION) {
      throw new DimproIdentityError("A feltöltési szabályzat verziója elavult. Frissítsd az oldalt.", "FIELD_CAPTURE_UPLOAD_RULES_VERSION_MISMATCH", 409);
    }
    const updated = await recordDimproUploadRulesAcceptance(authorized.context.entitlement.id, DROP_UPLOAD_RULES_VERSION);
    return dimproIdentityJson({
      ok: true,
      version: "FIELD_CAPTURE_UPLOAD_RULES_V010",
      rulesVersion: String(updated.upload_rules_version || DROP_UPLOAD_RULES_VERSION),
      acceptedAt: String(updated.upload_rules_last_accepted_at || ""),
      acceptanceCount: Number(updated.upload_rules_acceptance_count || 0),
    });
  } catch (error) {
    return dimproIdentityErrorResponse(error);
  }
}
