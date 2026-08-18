import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import { CommerceContextError } from "./server-context";

function env(name: string) {
  return process.env[name]?.trim() || "";
}

export function createCommerceAdminClient(): SupabaseClient {
  const url = env("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceRoleKey || serviceRoleKey.includes("<") || serviceRoleKey.includes(">")) {
    throw new CommerceContextError(
      "A Commerce szerveroldali adatkapcsolat nincs konfigurálva.",
      "COMMERCE_ADMIN_CONFIG_MISSING",
      503,
    );
  }
  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
