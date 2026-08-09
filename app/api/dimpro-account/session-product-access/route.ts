import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createSessionClient } from "@/app/lib/supabase/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProductAccessStatus = "ACTIVE" | "TRIAL" | "SUSPENDED" | "EXPIRED";
type ProductAccessRole = "OWNER" | "ADMIN" | "MANAGER" | "USER" | "GUEST";

type AccountUserRow = {
  id: string;
  auth_user_id: string | null;
  email: string | null;
  full_name: string | null;
};

type ProductAccessRow = {
  product_code: string;
  role: ProductAccessRole;
  status: ProductAccessStatus;
  valid_until: string | null;
};

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

function getServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || key.includes("<") || key.includes(">")) return null;
  return key;
}

function maskEmail(email: string | null | undefined) {
  if (!email || !email.includes("@")) return "-";
  const [name, domain] = email.split("@");
  const [domainName, ...domainRest] = domain.split(".");
  return `${name.slice(0, 2)}***@${domainName.slice(0, 2)}***${domainRest.length ? `.${domainRest.join(".")}` : ""}`;
}

function isAccessActive(access: ProductAccessRow | null) {
  if (!access) return false;
  if (!["ACTIVE", "TRIAL"].includes(access.status)) return false;
  if (!access.valid_until) return true;

  const validUntil = new Date(access.valid_until);
  if (Number.isNaN(validUntil.getTime())) return false;
  return validUntil.getTime() >= Date.now();
}

export async function GET() {
  const productCode = "ARUTER";
  const sessionClient = await createSessionClient();
  const { data: sessionData, error: sessionError } = await sessionClient.auth.getUser();
  const sessionUser = sessionData.user;

  if (sessionError || !sessionUser) {
    return NextResponse.json({
      ok: true,
      mode: "planning",
      productCode,
      hasSession: false,
      emailMasked: "-",
      accountUser: null,
      access: null,
      allowed: false,
      message: "Nincs aktív Supabase session. Kijelentkezett állapotban csak a login oldal érhető el.",
    });
  }

  const serviceRoleKey = getServiceRoleKey();
  if (!serviceRoleKey) {
    return NextResponse.json({
      ok: true,
      mode: "planning",
      productCode,
      hasSession: true,
      authUserId: sessionUser.id,
      emailMasked: maskEmail(sessionUser.email),
      accountUser: null,
      access: null,
      allowed: true,
      message: "Van session, de nincs service role kulcs. Planning módban a modulok nem záródnak le.",
    });
  }

  const adminClient = createSupabaseClient(getSupabaseUrl(), serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  let accountUser: AccountUserRow | null = null;
  let linkedByEmailFallback = false;
  let authLinkUpdated = false;

  const { data: userByAuth } = await adminClient
    .from("dimpro_account_users")
    .select("id, auth_user_id, email, full_name")
    .eq("auth_user_id", sessionUser.id)
    .maybeSingle();

  accountUser = userByAuth as AccountUserRow | null;

  if (!accountUser && sessionUser.email) {
    const { data: userByEmail } = await adminClient
      .from("dimpro_account_users")
      .select("id, auth_user_id, email, full_name")
      .eq("email", sessionUser.email)
      .maybeSingle();

    accountUser = userByEmail as AccountUserRow | null;
    linkedByEmailFallback = Boolean(accountUser);
  }

  if (accountUser && !accountUser.auth_user_id) {
    const { data: updatedUser } = await adminClient
      .from("dimpro_account_users")
      .update({ auth_user_id: sessionUser.id })
      .eq("id", accountUser.id)
      .is("auth_user_id", null)
      .select("id, auth_user_id, email, full_name")
      .maybeSingle();

    if (updatedUser) {
      accountUser = updatedUser as AccountUserRow;
      authLinkUpdated = true;
    }
  }

  if (!accountUser) {
    return NextResponse.json({
      ok: true,
      mode: "planning",
      productCode,
      hasSession: true,
      authUserId: sessionUser.id,
      emailMasked: maskEmail(sessionUser.email),
      accountUser: null,
      access: null,
      allowed: false,
      message: "Van Supabase session, de nincs hozzá DIMPRO account user rekord.",
    });
  }

  const { data: accessData } = await adminClient
    .from("dimpro_product_access")
    .select("product_code, role, status, valid_until")
    .eq("user_id", accountUser.id)
    .eq("product_code", productCode)
    .maybeSingle();

  const access = accessData as ProductAccessRow | null;
  const allowed = isAccessActive(access);

  return NextResponse.json({
    ok: true,
    mode: "planning",
    productCode,
    hasSession: true,
    authUserId: sessionUser.id,
    emailMasked: maskEmail(sessionUser.email),
    accountUser: {
      id: accountUser.id,
      fullName: accountUser.full_name,
      emailMasked: maskEmail(accountUser.email),
      authLinked: Boolean(accountUser.auth_user_id),
      linkedByEmailFallback,
      authLinkUpdated,
    },
    access,
    allowed,
    message: allowed
      ? "ARUTER product access aktív planning módban."
      : "Nincs aktív ARUTER product access. Planning módban ez még csak figyelmeztetés.",
  });
}
