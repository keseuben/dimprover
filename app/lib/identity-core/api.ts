import { NextResponse } from "next/server";
import { DimproIdentityError } from "./types";

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, private",
  Pragma: "no-cache",
  Expires: "0",
  "X-Content-Type-Options": "nosniff",
} as const;

export function dimproIdentityJson(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: NO_STORE_HEADERS,
  });
}

export function dimproIdentityErrorResponse(error: unknown) {
  if (error instanceof DimproIdentityError) {
    return dimproIdentityJson({
      ok: false,
      error: error.message,
      code: error.code,
    }, error.status);
  }
  return dimproIdentityJson({
    ok: false,
    error: "A DIMPRO központi jogosultsági szolgáltatás átmenetileg nem érhető el.",
    code: "DIMPRO_IDENTITY_INTERNAL_ERROR",
  }, 500);
}

export async function readDimproIdentityJsonBody(request: Request) {
  const contentType = request.headers.get("content-type")?.toLowerCase() || "";
  if (!contentType.includes("application/json")) {
    throw new DimproIdentityError(
      "A kérés csak JSON formátumban küldhető.",
      "DIMPRO_IDENTITY_JSON_REQUIRED",
      415,
    );
  }
  const contentLength = Number(request.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > 16 * 1024) {
    throw new DimproIdentityError(
      "A kérés túl nagy.",
      "DIMPRO_IDENTITY_REQUEST_TOO_LARGE",
      413,
    );
  }
  try {
    const value = await request.json();
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("invalid body");
    }
    return value as Record<string, unknown>;
  } catch {
    throw new DimproIdentityError(
      "A kérés JSON-tartalma érvénytelen.",
      "DIMPRO_IDENTITY_JSON_INVALID",
      400,
    );
  }
}
