"use client";

import { useState } from "react";

export default function InvitationAcceptClient({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function accept() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/dimpro-auth/invitations/accept", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const payload = await response.json().catch(() => null) as { ok?: boolean; nextUrl?: string; message?: string } | null;
      if (!response.ok || !payload?.ok || !payload.nextUrl) throw new Error(payload?.message || "A meghívás elfogadása nem sikerült.");
      window.location.assign(payload.nextUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "A meghívás elfogadása nem sikerült.");
      setBusy(false);
    }
  }

  return <div style={{ display: "grid", gap: 12 }}>
    <button type="button" onClick={accept} disabled={busy} style={{ border: 0, borderRadius: 10, padding: "13px 18px", fontWeight: 800, background: "#111827", color: "white", cursor: busy ? "wait" : "pointer" }}>{busy ? "Elfogadás…" : "Meghívás elfogadása"}</button>
    {error ? <div role="alert" style={{ color: "#b91c1c", fontSize: 14 }}>{error}</div> : null}
  </div>;
}
