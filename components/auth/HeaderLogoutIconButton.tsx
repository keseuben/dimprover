"use client";

import { useState } from "react";
import { Loader2, LogOut } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

type Props = {
  className?: string;
  iconSize?: number;
};

export default function HeaderLogoutIconButton({ className = "", iconSize = 18 }: Props) {
  const [busy, setBusy] = useState(false);

  async function handleLogout() {
    if (busy) return;
    setBusy(true);
    try {
      const response = await fetch("/api/dimpro-auth/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      if (!response.ok) {
        throw new Error("A központi DIMPRO kijelentkezés nem sikerült.");
      }

      try {
        await fetch("/api/project-gate/dev-access/session", {
          method: "DELETE",
          credentials: "same-origin",
          cache: "no-store",
        });
      } catch {
        // Legacy DEV hozzáférési cookie: best-effort takarítás a központi kijelentkezés után.
      }

      try {
        const supabase = createClient();
        await supabase.auth.signOut();
      } catch {
        // Legacy Supabase session: best-effort takarítás, a DIMPRO AUTH session már lezárult.
      }

      localStorage.removeItem("dimprover_login_started_at");
      sessionStorage.removeItem("dimproBenjadminSession");
      window.location.replace("/login");
    } catch (error) {
      console.error("DIMPRO logout failed", error);
      window.alert("A kijelentkezés nem sikerült. Kérlek, próbáld újra.");
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void handleLogout()}
      disabled={busy}
      aria-busy={busy}
      title={busy ? "Kijelentkezés…" : "Kijelentkezés"}
      aria-label={busy ? "Kijelentkezés folyamatban" : "Kijelentkezés"}
    >
      {busy ? <Loader2 size={iconSize} className="animate-spin" /> : <LogOut size={iconSize} />}
    </button>
  );
}
