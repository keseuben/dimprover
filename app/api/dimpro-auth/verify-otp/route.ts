import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import {
  appendDimproLoginAttempt,
  normalizeDimproEmail,
} from "@/app/lib/dimpro/login-access";
import { linkDimproAuthUser, resolveDimproLoginAuthorization } from "@/app/lib/dimpro/login-authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function createOtpServerClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error("A Supabase OTP szolgáltatás nincs beállítva.");
  const cookieStore = await cookies();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
      },
    },
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const email = normalizeDimproEmail(body && typeof body === "object" ? (body as { email?: unknown }).email : "");
  const token = body && typeof body === "object" && typeof (body as { token?: unknown }).token === "string"
    ? String((body as { token: string }).token).replace(/\D/g, "").slice(0, 6)
    : "";
  const authorization = await resolveDimproLoginAuthorization(email);
  const allowed = authorization.allowed;

  if (!allowed) {
    await appendDimproLoginAttempt(request.headers, {
      email: email || "missing-email",
      allowed: false,
      action: "verify_otp",
      result: "blocked",
      message: `Nincs aktív központi DIMPRO belépési jogosultság: ${authorization.reason}.`,
    });
    return NextResponse.json(
      { ok: false, allowed: false, error: "Ez az e-mail cím jelenleg nem jogosult a DIMPRO használatára." },
      { status: 403, headers: { "cache-control": "no-store" } },
    );
  }

  if (token.length !== 6) {
    await appendDimproLoginAttempt(request.headers, {
      email,
      allowed: true,
      action: "verify_otp",
      result: "invalid_code",
      message: "Nem hatjegyű kód.",
    });
    return NextResponse.json(
      { ok: false, allowed: true, error: "A belépési kódnak hat számjegyből kell állnia." },
      { status: 400, headers: { "cache-control": "no-store" } },
    );
  }

  try {
    const supabase = await createOtpServerClient();
    const { data, error } = await supabase.auth.verifyOtp({ email, token, type: "email" });

    if (error || !data.user) {
      await appendDimproLoginAttempt(request.headers, {
        email,
        allowed: true,
        action: "verify_otp",
        result: "invalid_code",
        message: error?.message?.slice(0, 500) || "A Supabase nem adott vissza felhasználót.",
      });
      return NextResponse.json(
        { ok: false, allowed: true, error: error?.message || "Hibás vagy lejárt belépési kód." },
        { status: 400, headers: { "cache-control": "no-store" } },
      );
    }

    const verifiedEmail = normalizeDimproEmail(data.user.email) || email;
    const verifiedAuthorization = await resolveDimproLoginAuthorization(verifiedEmail);
    if (!verifiedAuthorization.allowed) {
      await supabase.auth.signOut();
      await appendDimproLoginAttempt(request.headers, {
        email: verifiedEmail,
        allowed: false,
        action: "verify_otp",
        result: "blocked",
        message: `A hitelesített fiók központi jogosultsága nem aktív: ${verifiedAuthorization.reason}.`,
      });
      return NextResponse.json(
        { ok: false, allowed: false, error: "A fiók nincs engedélyezve a DIMPRO használatára." },
        { status: 403, headers: { "cache-control": "no-store" } },
      );
    }

    if (verifiedAuthorization.source !== "legacy_allowlist") {
      await linkDimproAuthUser(verifiedEmail, data.user.id);
    }

    await appendDimproLoginAttempt(request.headers, {
      email,
      allowed: true,
      action: "verify_otp",
      result: "otp_verified",
    });

    return NextResponse.json(
      { ok: true, allowed: true, email },
      { headers: { "cache-control": "no-store" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Ismeretlen kódellenőrzési hiba.";
    await appendDimproLoginAttempt(request.headers, {
      email,
      allowed: true,
      action: "verify_otp",
      result: "provider_error",
      message: message.slice(0, 500),
    });
    return NextResponse.json(
      { ok: false, allowed: true, error: message },
      { status: 500, headers: { "cache-control": "no-store" } },
    );
  }
}
