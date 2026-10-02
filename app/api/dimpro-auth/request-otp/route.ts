import { after, NextRequest, NextResponse } from "next/server";
import { getDimproAuthConfig } from "@/app/lib/dimpro-auth/config";
import { sendDimproAuthOtpEmail } from "@/app/lib/dimpro-auth/email";
import { issueLoginOtp } from "@/app/lib/dimpro-auth/repository";
import {
  createDimproAuthOtpCode,
  getDimproAuthRequestIp,
  getDimproAuthUserAgent,
  isValidDimproAuthEmail,
  newDimproAuthCorrelationId,
  normalizeDimproAuthEmail,
  validateSameOriginMutation,
} from "@/app/lib/dimpro-auth/security";
import { DimproAuthError } from "@/app/lib/dimpro-auth/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const PUBLIC_OK = "Ha az e-mail-címhez aktív DIMPRO-fiók tartozik, elküldtük a hatjegyű belépési kódot.";

export async function POST(request: NextRequest) {
  const correlationId = newDimproAuthCorrelationId(request.headers);
  if (!validateSameOriginMutation(request.headers)) {
    return NextResponse.json({ ok: false, error: "A kérés eredete nem engedélyezett.", correlationId }, { status: 403, headers: { "cache-control": "no-store" } });
  }
  const body = await request.json().catch(() => null);
  const email = normalizeDimproAuthEmail(body && typeof body === "object" ? (body as { email?: unknown }).email : "");
  if (!isValidDimproAuthEmail(email)) {
    return NextResponse.json({ ok: false, error: "Érvényes e-mail-cím szükséges.", correlationId }, { status: 400, headers: { "cache-control": "no-store" } });
  }

  try {
    const code = createDimproAuthOtpCode();
    const challenge = await issueLoginOtp({
      email,
      code,
      ip: getDimproAuthRequestIp(request.headers),
      userAgent: getDimproAuthUserAgent(request.headers),
      correlationId,
    });
    if (challenge.user) {
      const delivery = {
        email: challenge.user.email,
        displayName: challenge.user.displayName,
        code,
        expiresMinutes: Math.ceil(getDimproAuthConfig().otpTtlSeconds / 60),
      };
      after(async () => {
        try {
          await sendDimproAuthOtpEmail(delivery);
        } catch (error) {
          console.error("DIMPRO AUTH OTP e-mail kézbesítési hiba", correlationId, error instanceof Error ? error.message : error);
        }
      });
    }
    return NextResponse.json({ ok: true, message: PUBLIC_OK, correlationId }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    if (error instanceof DimproAuthError && ["AUTH_OTP_COOLDOWN", "AUTH_OTP_RATE_LIMIT"].includes(error.code)) {
      return NextResponse.json({ ok: false, error: error.publicMessage, code: error.code, correlationId }, { status: error.status, headers: { "cache-control": "no-store" } });
    }
    console.error("DIMPRO AUTH request-otp hiba", correlationId, error instanceof Error ? error.message : error);
    return NextResponse.json({ ok: false, error: "A belépési kód küldése jelenleg nem érhető el.", correlationId }, { status: 503, headers: { "cache-control": "no-store" } });
  }
}
