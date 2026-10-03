"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useSessionTimer } from "./useSessionTimer";

const THIRTY_MINUTES = 30 * 60;

export default function SessionGuardClient() {
  const pathname = usePathname();

  const remainingSeconds = useSessionTimer(
    (state) => state.remainingSeconds
  );

  const setRemainingSeconds = useSessionTimer(
    (state) => state.setRemainingSeconds
  );

  useEffect(() => {
    if (pathname.startsWith("/teams/meeting-assistant")) return;

    async function logout() {
      const host = window.location.hostname.toLowerCase();
      if (host === "projektkapu.dev.dimpro.hu") {
        await fetch("/api/project-gate/dev-access/session", {
          method: "DELETE",
          credentials: "same-origin",
        }).catch(() => undefined);
      } else if (host === "dimpro.hu" || host.endsWith(".dimpro.hu")) {
        await fetch("/api/dimpro-auth/logout", {
          method: "POST",
          credentials: "same-origin",
        }).catch(() => undefined);
      } else {
        const { createClient } = await import("@/app/lib/supabase/client");
        await createClient().auth.signOut();
      }
      localStorage.removeItem("dimprover_login_started_at");
      localStorage.removeItem("dimpro_login_started_at");
      window.location.href = "/login";
    }

    function resetTimer() {
      setRemainingSeconds(THIRTY_MINUTES);
    }

    const countdown = setInterval(() => {
      if (remainingSeconds <= 1) {
        logout();
      } else {
        setRemainingSeconds(remainingSeconds - 1);
      }
    }, 1000);

    window.addEventListener("mousemove", resetTimer);
    window.addEventListener("keydown", resetTimer);
    window.addEventListener("click", resetTimer);
    window.addEventListener("scroll", resetTimer);

    return () => {
      clearInterval(countdown);

      window.removeEventListener("mousemove", resetTimer);
      window.removeEventListener("keydown", resetTimer);
      window.removeEventListener("click", resetTimer);
      window.removeEventListener("scroll", resetTimer);
    };
  }, [pathname, remainingSeconds, setRemainingSeconds]);

  return null;
}