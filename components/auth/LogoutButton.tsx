"use client";

import { LogOut } from "lucide-react";

type LogoutButtonProps = {
  collapsed?: boolean;
};

export default function LogoutButton({
  collapsed = false,
}: LogoutButtonProps) {
  async function handleLogout() {
    const host = window.location.hostname.toLowerCase();
    if (host === "projektkapu.dev.dimpro.hu") {
      await fetch("/api/project-gate/dev-access/session", { method: "DELETE", credentials: "same-origin" }).catch(() => undefined);
    } else if (host === "dimpro.hu" || host.endsWith(".dimpro.hu")) {
      await fetch("/api/dimpro-auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => undefined);
    } else {
      const { createClient } = await import("@/app/lib/supabase/client");
      await createClient().auth.signOut();
    }

    localStorage.removeItem("dimprover_login_started_at");
    localStorage.removeItem("dimpro_login_started_at");
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