"use client";

import { LogOut } from "lucide-react";
import { createClient } from "@/app/lib/supabase/client";

type Props = {
  className?: string;
  iconSize?: number;
};

export default function HeaderLogoutIconButton({ className = "", iconSize = 18 }: Props) {
  async function handleLogout() {
    try {
      await fetch("/api/project-gate/dev-access/session", {
        method: "DELETE",
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      // A DEV hozzáférési cookie törlése best-effort; az auth kijelentkezés ettől még folytatódik.
    }

    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // Ha nincs aktív Supabase session, a helyi / DEV kijelentkezés továbbra is érvényes.
    }

    localStorage.removeItem("dimprover_login_started_at");
    window.location.href = "/login";
  }

  return (
    <button
      type="button"
      className={className}
      onClick={() => void handleLogout()}
      title="Kijelentkezés"
      aria-label="Kijelentkezés"
    >
      <LogOut size={iconSize} />
    </button>
  );
}
