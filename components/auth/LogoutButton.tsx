"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

type LogoutButtonProps = {
  collapsed?: boolean;
};

export default function LogoutButton({
  collapsed = false,
}: LogoutButtonProps) {
  const supabase = createClient();

  async function handleLogout() {
    await supabase.auth.signOut();

    localStorage.removeItem("dimprover_login_started_at");

    window.location.href = "/login";
  }

  return (
    <button
      onClick={handleLogout}
      title="Kijelentkezés"
      className={`flex items-center rounded-xl border border-slate-800 bg-slate-900 text-sm text-slate-200 transition-all hover:border-red-500/40 hover:bg-red-500/10 hover:text-white ${
        collapsed
          ? "justify-center px-3 py-3"
          : "w-full gap-3 px-4 py-3"
      }`}
    >
      <LogOut className="h-4 w-4 shrink-0 text-red-500" />

      {!collapsed && <span>Kijelentkezés</span>}
    </button>
  );
}