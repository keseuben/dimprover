import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  appendDimproLoginAttempt,
  normalizeDimproEmail,
} from "@/app/lib/dimpro/login-access";
import { resolveDimproLoginAuthorization } from "@/app/lib/dimpro/login-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function getSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("A Supabase OTP szolgáltatás nincs beállítva.");
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = normalizeDimproEmail(body && typeof body === "object" ? (body as { email?: unknown }).email : "");
  const authorization = await resolveDimproLoginAuthorization(email);
  const allowed = authorization.allowed;

  if (!allowed) {
    await appendDimproLoginAttempt(request.headers, {
      email: email || "missing-email",
      allowed: false,
      action: "request_otp",
      result: "blocked",
      message: `A központi DIMPRO belépési jogosultság nem aktív: ${authorization.reason}.`,
    });

    return NextResponse.json(
      {
        ok: false,
        allowed: false,
        error: "Ez az e-mail cím jelenleg nem jogosult a DIMPRO használatára. A próbálkozást naplóztuk.",
      },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const supabase = getSupabaseClient();
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { shouldCreateUser: authorization.source !== "legacy_allowlist" },
    });

    if (error) {
      await appendDimproLoginAttempt(request.headers, {
        email,
        allowed: true,
        action: "request_otp",
        result: "provider_error",
        message: error.message.slice(0, 500),
      });
      return NextResponse.json(
        { ok: false, allowed: true, error: error.message },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    await appendDimproLoginAttempt(request.headers, {
      email,
      allowed: true,
      action: "request_otp",
      result: "otp_sent",
    });

    return NextResponse.json(
      { ok: true, allowed: true },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ismeretlen OTP szolgáltatási hiba.";
    await appendDimproLoginAttempt(request.headers, {
      email,
      allowed: true,
      action: "request_otp",
      result: "provider_error",
      message: message.slice(0, 500),
    });
    return NextResponse.json(
      { ok: false, allowed: true, error: message },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
