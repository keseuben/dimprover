import { createClient } from "@/app/lib/supabase/server";
import { getAruterRepositoryMode } from "./repositoryFactory";

export type AruterSupabaseReadiness = {
  repositoryMode: string;
  hasSupabaseUrl: boolean;
  hasAnonKey: boolean;
  hasServiceRoleKey: boolean;
  canCreateClient: boolean;
  canReadPublicReservations: boolean;
  publicReservationCount: number | null;
  missing: string[];
  errors: string[];
};

export async function checkAruterSupabaseReadiness(): Promise<AruterSupabaseReadiness> {
  const missing: string[] = [];
  const errors: string[] = [];
  const hasSupabaseUrl = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL?.trim());
  const hasAnonKey = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim());
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const hasServiceRoleKey = Boolean(serviceRoleKey && !serviceRoleKey.includes("<") && !serviceRoleKey.includes(">"));

  if (!hasSupabaseUrl) missing.push("NEXT_PUBLIC_SUPABASE_URL");
  if (!hasAnonKey) missing.push("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  if (!hasServiceRoleKey) missing.push("SUPABASE_SERVICE_ROLE_KEY");

  let canCreateClient = false;
  let canReadPublicReservations = false;
  let publicReservationCount: number | null = null;

  if (hasSupabaseUrl && hasAnonKey) {
    try {
      const supabase = await createClient();
      canCreateClient = true;
      const { count, error } = await supabase
        .from("aruter_public_reservations")
        .select("id", { count: "exact", head: true });

      if (error) {
        errors.push(error.message);
      } else {
        canReadPublicReservations = true;
        publicReservationCount = count ?? 0;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Ismeretlen Supabase kapcsolódási hiba.");
    }
  }

  return {
    repositoryMode: getAruterRepositoryMode(),
    hasSupabaseUrl,
    hasAnonKey,
    hasServiceRoleKey,
    canCreateClient,
    canReadPublicReservations,
    publicReservationCount,
    missing,
    errors,
  };
}
