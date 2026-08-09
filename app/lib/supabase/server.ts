import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function getSupabaseUrl() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  return url;
}

function getSupabaseAnonKey() {
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_ANON_KEY");
  return key;
}

function getSupabasePrivilegedKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key || key.includes("<") || key.includes(">")) return null;
  return key;
}

export async function createClient() {
  const privilegedKey = getSupabasePrivilegedKey();

  if (privilegedKey) {
    return createSupabaseClient(getSupabaseUrl(), privilegedKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  const cookieStore = await cookies();

  return createServerClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Component esetén előfordulhat, nem hiba.
        }
      },
    },
  });
}
