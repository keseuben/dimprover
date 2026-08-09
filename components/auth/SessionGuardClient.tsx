"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/app/lib/supabase/client";
import { useSessionTimer } from "./useSessionTimer";

const THIRTY_MINUTES = 30 * 60;

export default function SessionGuardClient() {
  const pathname = usePathname();
  const supabase = createClient();

  const remainingSeconds = useSessionTimer(
    (state) => state.remainingSeconds
  );

  const setRemainingSeconds = useSessionTimer(
    (state) => state.setRemainingSeconds
  );

  useEffect(() => {
    if (pathname.startsWith("/teams/meeting-assistant")) return;

    async function logout() {
      await supabase.auth.signOut();
      localStorage.removeItem("dimprover_login_started_at");
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
  }, [pathname, remainingSeconds, setRemainingSeconds, supabase.auth]);

  return null;
}