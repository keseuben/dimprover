import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { resolveCentralDimproAuthEnvironmentFromHost } from "@/app/lib/dimpro-auth/client-config";
import { getProjectInvitation } from "@/app/lib/dimpro-auth/invitations";
import InvitationAcceptClient from "./InvitationAcceptClient";

export const dynamic = "force-dynamic";

export default async function AuthInvitationPage({ params }: { params: Promise<{ token: string }> }) {
  const headerStore = await headers();
  if (!resolveCentralDimproAuthEnvironmentFromHost(headerStore.get("host"))) notFound();
  const { token } = await params;
  const invitation = await getProjectInvitation(token).catch(() => null);
  if (!invitation) notFound();
  const active = invitation.status === "PENDING";
  return <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", background: "#f4f7f9", padding: 24, fontFamily: "Arial, sans-serif", color: "#172033" }}>
    <section style={{ width: "min(620px, 100%)", background: "white", border: "1px solid #dfe5ec", borderRadius: 16, padding: 30, boxShadow: "0 18px 50px rgba(15,23,42,.08)" }}>
      <div style={{ fontSize: 12, fontWeight: 900, letterSpacing: ".14em", color: "#64748b" }}>DIMPRO</div>
      <h1 style={{ margin: "10px 0 16px", fontSize: 28 }}>Projektmeghívás</h1>
      <p>Meghívást kaptál a(z) <strong>{invitation.projectName}</strong> projekthez.</p>
      <p style={{ color: "#64748b", fontSize: 14 }}>Meghívott e-mail: {invitation.email}</p>
      {active ? <><p>A meghívás elfogadása után a központi DIMPRO beléptetés következik. Csak ehhez a projekthez kapsz hozzáférést; saját Drive-terület csak külön jogosultsággal jár.</p><InvitationAcceptClient token={token}/></> : <p style={{ fontWeight: 700, color: invitation.status === "ACCEPTED" ? "#047857" : "#b91c1c" }}>{invitation.status === "ACCEPTED" ? "Ezt a meghívást már elfogadták." : invitation.status === "EXPIRED" ? "Ez a meghívás lejárt." : "Ez a meghívás már nem aktív."}</p>}
    </section>
  </main>;
}
