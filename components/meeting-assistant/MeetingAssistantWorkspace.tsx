"use client";

import { Archive, BrainCircuit, CameraOff, Check, ClipboardCopy, EyeOff, KeyRound, LockKeyhole, MicOff, MonitorUp, Moon, PhoneOff, RefreshCw, Sun, Users } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import MeetingAssistantPanel from "./MeetingAssistantPanel";
import MeetingAiDocumentStudio from "./MeetingAiDocumentStudio";
import MeetingResizableDualLayout from "./MeetingResizableDualLayout";
import { useMeetingWebTheme } from "./useMeetingWebTheme";
import "./teams-meeting-theme.css";

const PARTICIPANTS = [
  { initials: "KP", name: "Kovács Péter", role: "Projektvezető", className: "from-sky-100 to-sky-200 text-sky-800" },
  { initials: "NL", name: "Nagy László", role: "Műszaki ellenőr", className: "from-slate-100 to-slate-200 text-slate-800" },
  { initials: "TA", name: "Tóth Anna", role: "Tervező", className: "from-violet-100 to-violet-200 text-violet-800" },
  { initials: "SZD", name: "Szabó Dániel", role: "Kivitelező", className: "from-orange-100 to-orange-200 text-orange-800" },
];

export default function MeetingAssistantWorkspace({
  meetingId,
  previewAccessToken,
  participantPreviewAccessToken,
}: {
  meetingId: string;
  previewAccessToken: string;
  participantPreviewAccessToken: string;
}) {
  const [desktopToken, setDesktopToken] = useState("");
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenMessage, setTokenMessage] = useState("");
  const [copied, setCopied] = useState<"token" | "package" | "pairing" | null>(null);
  const [pairingCode, setPairingCode] = useState("");
  const [pairingExpiresAt, setPairingExpiresAt] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [pairingMessage, setPairingMessage] = useState("");
  const [previewMode, setPreviewMode] = useState<"dual" | "teams" | "ai">("dual");
  const { theme, toggleTheme } = useMeetingWebTheme();

  async function createDesktopToken() {
    setTokenLoading(true);
    setTokenMessage("");
    setCopied(null);
    try {
      const response = await fetch("/api/meeting-assistant/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          meetingId,
          issuedTo: "dimpro-fajlmuhely-desktop",
          issuerToken: previewAccessToken,
        }),
      });
      const data = (await response.json().catch(() => null)) as { ok?: boolean; accessToken?: string; error?: string } | null;
      if (!response.ok || !data?.accessToken) throw new Error(data?.error || "A desktop token nem hozható létre.");
      setDesktopToken(data.accessToken);
      setTokenMessage("A lejáró desktop hozzáférési token elkészült.");
    } catch (error) {
      setTokenMessage(error instanceof Error ? error.message : "A desktop token létrehozása sikertelen.");
    } finally {
      setTokenLoading(false);
    }
  }

  async function copyDesktopToken() {
    if (!desktopToken) return;
    await navigator.clipboard.writeText(desktopToken);
    setCopied("token");
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function copyDesktopConnectionPackage() {
    if (!desktopToken) return;
    const connectionPackage = JSON.stringify({
      version: 1,
      type: "DIMPRO_MEETING_CONNECTION",
      baseUrl: window.location.origin,
      meetingId,
      accessToken: desktopToken,
    });
    await navigator.clipboard.writeText(connectionPackage);
    setCopied("package");
    window.setTimeout(() => setCopied(null), 1800);
  }

  async function createTeamsPairingCode() {
    setPairingLoading(true);
    setPairingMessage("");
    setCopied(null);
    try {
      const response = await fetch("/api/meeting-assistant/pairing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "create",
          meetingId,
          issuerToken: previewAccessToken,
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        code?: string;
        expiresAt?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.code || !data.expiresAt) {
        throw new Error(data?.error || "A Teams-párosítókód nem hozható létre.");
      }
      setPairingCode(data.code);
      setPairingExpiresAt(data.expiresAt);
      setPairingMessage("Az egyszer használatos Teams-párosítókód elkészült.");
    } catch (error) {
      setPairingMessage(error instanceof Error ? error.message : "A Teams-párosítókód létrehozása sikertelen.");
    } finally {
      setPairingLoading(false);
    }
  }

  async function copyTeamsPairingCode() {
    if (!pairingCode) return;
    await navigator.clipboard.writeText(pairingCode);
    setCopied("pairing");
    window.setTimeout(() => setCopied(null), 1800);
  }

  return (
    <div className="dimpro-meeting-theme meeting-web-shell min-h-screen bg-[#eef5f3] p-4 sm:p-6" data-theme={theme}>
      <section className="mx-auto mb-4 rounded-2xl border border-teal-200 bg-white p-4 shadow-[0_18px_50px_rgba(15,118,110,0.10)]">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.18em] text-teal-700"><KeyRound size={16} /> Fájlműhely desktop kapcsolat</div>
            <h1 className="mt-2 text-xl font-black text-slate-950">Élő értekezleti munkatér</h1>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">A legbiztonságosabb megoldás a teljes kapcsolati csomag másolása. Ez együtt tartalmazza a szervercímet, a meetingazonosítót és a hozzá tartozó lejáró tokent.</p>
            <div className="mt-2 inline-flex items-center gap-2 rounded-lg border border-teal-200 bg-teal-50 px-3 py-1.5 font-mono text-xs font-bold text-teal-900">Meeting: {meetingId}</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === "dark" ? "Váltás világos módra" : "Váltás sötét módra"}
              aria-label={theme === "dark" ? "Világos mód" : "Sötét mód"}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50"
            >
              {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
              {theme === "dark" ? "Világos mód" : "Sötét mód"}
            </button>
            <Link href="/ertekezleti-kisero" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm font-black text-teal-900 hover:bg-teal-100">
              <Users size={16} /> Projektek és értekezletek
            </Link>
            <Link href="/ertekezletek" className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-3 text-sm font-black text-teal-900 hover:bg-teal-50">
              <Archive size={16} /> Értekezleti archívum
            </Link>
            <button type="button" onClick={createDesktopToken} disabled={tokenLoading} className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-3 text-sm font-black text-white hover:bg-teal-600 disabled:opacity-50">
              <RefreshCw size={16} className={tokenLoading ? "animate-spin" : ""} /> {desktopToken ? "Új token" : "Desktop token létrehozása"}
            </button>
            <button type="button" onClick={copyDesktopConnectionPackage} disabled={!desktopToken} className="inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-40">
              {copied === "package" ? <Check size={16} /> : <ClipboardCopy size={16} />} {copied === "package" ? "Kapcsolati csomag kimásolva" : "Kapcsolati csomag másolása"}
            </button>
            <button type="button" onClick={copyDesktopToken} disabled={!desktopToken} className="inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-teal-50 px-4 py-3 text-sm font-black text-teal-900 hover:bg-teal-100 disabled:opacity-40">
              {copied === "token" ? <Check size={16} /> : <ClipboardCopy size={16} />} {copied === "token" ? "Token kimásolva" : "Csak token másolása"}
            </button>
          </div>
        </div>
        {desktopToken ? <div className="mt-3 break-all rounded-xl border border-slate-200 bg-slate-950 px-4 py-3 font-mono text-[11px] leading-5 text-teal-200">{desktopToken}</div> : null}
        {tokenMessage ? <div className="mt-3 text-sm font-semibold text-slate-600">{tokenMessage}</div> : null}
        {desktopToken ? <div className="mt-2 text-xs font-semibold text-amber-700">A Fájlműhelyben a „Kapcsolati csomag beillesztése” gombot használd. Így a token nem kerülhet másik meetingazonosító mellé.</div> : null}

        <div className="mt-5 border-t border-teal-100 pt-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-xs font-black uppercase tracking-[0.16em] text-indigo-700">Teams jobb oldali panel párosítása</div>
              <p className="mt-1 max-w-3xl text-sm leading-6 text-slate-600">Hozz létre egy egyszer használatos kódot, majd írd be a Teamsben megnyílt DIMPRO konfigurációs ablakba. A kód a tényleges Microsoft Teams-meetinghez kapcsolja a panelt.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={createTeamsPairingCode} disabled={pairingLoading} className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-50">
                <RefreshCw size={16} className={pairingLoading ? "animate-spin" : ""} /> {pairingCode ? "Új párosítókód" : "Teams-párosítókód létrehozása"}
              </button>
              <button type="button" onClick={copyTeamsPairingCode} disabled={!pairingCode} className="inline-flex items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-black text-indigo-900 hover:bg-indigo-100 disabled:opacity-40">
                {copied === "pairing" ? <Check size={16} /> : <ClipboardCopy size={16} />} {copied === "pairing" ? "Kód kimásolva" : "Párosítókód másolása"}
              </button>
            </div>
          </div>
          {pairingCode ? (
            <div className="mt-3 flex flex-col gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="font-mono text-3xl font-black tracking-[0.22em] text-indigo-950">{pairingCode}</div>
              <div className="text-xs font-semibold text-indigo-800">Egyszer használható · lejár: {new Date(pairingExpiresAt).toLocaleTimeString("hu-HU", { hour: "2-digit", minute: "2-digit" })}</div>
            </div>
          ) : null}
          {pairingMessage ? <div className="mt-2 text-sm font-semibold text-slate-600">{pairingMessage}</div> : null}
        </div>
      </section>
      <section className="mx-auto mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-black text-slate-950">Webes értekezletvezető</div>
          <div className="mt-1 text-xs font-semibold text-slate-500">A szervezői munkatér és a résztvevői nézet ugyanazon élő adatokkal működik.</div>
        </div>
        <div className="grid grid-cols-1 gap-1 rounded-xl bg-slate-100 p-1 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => setPreviewMode("dual")}
            className={`rounded-lg px-3 py-2 text-xs font-black transition ${previewMode === "dual" ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            Szervező + résztvevő
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("teams")}
            className={`rounded-lg px-3 py-2 text-xs font-black transition ${previewMode === "teams" ? "bg-white text-teal-700 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            Teams-elrendezés
          </button>
          <button
            type="button"
            onClick={() => setPreviewMode("ai")}
            className={`inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-xs font-black transition ${previewMode === "ai" ? "bg-slate-950 text-teal-300 shadow-sm" : "text-slate-500 hover:text-slate-800"}`}
          >
            <BrainCircuit size={15} /> AI dokumentumműhely
          </button>
        </div>
      </section>

      {previewMode === "dual" ? (
        <section className="mx-auto overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_24px_70px_rgba(15,23,42,0.10)]">
          <header className="border-b border-slate-200 bg-slate-950 px-4 py-3 text-white">
            <div className="text-sm font-black">Kétoldali élő értekezletvezetés</div>
            <div className="mt-1 text-[10px] font-semibold text-slate-300">Bal oldalon a szervező privát munkatere, jobb oldalon a résztvevő számára ténylegesen látható tartalom. Az elválasztó húzható; dupla kattintással visszaáll az alaparány.</div>
          </header>
          <MeetingResizableDualLayout
            organizer={(
              <article className="min-w-0 bg-white">
                <div className="sticky top-0 z-30 border-b border-violet-200 bg-violet-50 px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-violet-800">
                  Szervezői / privát felület
                </div>
                <MeetingAssistantPanel meetingId={meetingId} initialRole="organizer" embedded={false} allowRoleSwitch={false} accessToken={previewAccessToken} />
              </article>
            )}
            participant={(
              <article className="min-w-0 bg-white">
                <div className="sticky top-0 z-30 border-b border-sky-200 bg-sky-50 px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.16em] text-sky-800">
                  Résztvevői felület
                </div>
                <MeetingAssistantPanel meetingId={meetingId} initialRole="participant" embedded={false} allowRoleSwitch={false} accessToken={participantPreviewAccessToken} />
              </article>
            )}
          />
        </section>
      ) : previewMode === "ai" ? (
        <section className="mx-auto">
          <MeetingAiDocumentStudio meetingId={meetingId} accessToken={previewAccessToken} />
        </section>
      ) : (
      <div className="mx-auto overflow-hidden rounded-2xl border border-teal-100 bg-white shadow-[0_24px_70px_rgba(15,118,110,0.14)]">
        <header className="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-3">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-black text-slate-950">DIMPRO Értekezleti Kísérő – Teams panel előnézet</div>
            <div className="mt-1 flex items-center gap-2 text-[10px] font-semibold text-slate-500">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              A jobb oldali DIMPRO-panel aktív · {meetingId}
            </div>
          </div>
          <div className="flex items-center gap-1.5" aria-label="Inaktív Teams vezérlők szemléltetéshez">
            {[CameraOff, MicOff, MonitorUp].map((Icon, index) => (
              <span key={index} className="cursor-not-allowed rounded-xl border border-slate-200 bg-slate-100 p-2.5 text-slate-300" aria-hidden="true">
                <Icon size={17} />
              </span>
            ))}
            <span className="cursor-not-allowed rounded-xl bg-slate-200 p-2.5 text-slate-400" aria-hidden="true">
              <PhoneOff size={17} />
            </span>
          </div>
        </header>

        <div className="grid min-h-[760px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_430px]">
          <main
            className="relative flex min-h-[620px] flex-col overflow-hidden border-r border-slate-200 bg-slate-200 p-3 sm:p-5"
            aria-label="Nem aktív Teams videóterület – csak szemléltetés"
            aria-disabled="true"
          >
            <div className="pointer-events-none absolute inset-0 z-20 bg-slate-500/25 backdrop-grayscale" />
            <div className="pointer-events-none absolute inset-0 z-30 flex items-center justify-center p-6">
              <div className="max-w-md rounded-3xl border border-slate-300 bg-white/95 px-7 py-6 text-center shadow-[0_24px_60px_rgba(15,23,42,0.22)] backdrop-blur">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 text-slate-600">
                  <LockKeyhole size={26} />
                </div>
                <div className="mt-4 text-xs font-black uppercase tracking-[0.22em] text-slate-500">Nem aktív terület</div>
                <h2 className="mt-2 text-xl font-black text-slate-950">Teams videófelület – csak szemléltetés</h2>
                <p className="mt-3 text-sm leading-6 text-slate-600">
                  A DIMPRO nem helyettesíti és nem vezérli a Teams videóablakát. A működő alkalmazás kizárólag a jobb oldali DIMPRO-panel.
                </p>
                <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-4 py-2 text-xs font-bold text-slate-600">
                  <EyeOff size={14} /> Kattintás és vezérlés letiltva
                </div>
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between rounded-xl border border-slate-300 bg-slate-100 px-3 py-2 text-[11px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-2"><Users size={15} /> 4 minta résztvevő</span>
              <span>Inaktív szemléltető nézet</span>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
              {PARTICIPANTS.map((person) => (
                <article key={person.name} className="relative flex min-h-[230px] items-center justify-center overflow-hidden rounded-2xl border border-slate-300 bg-slate-100 shadow-sm grayscale">
                  <div className={`flex h-28 w-28 items-center justify-center rounded-full bg-gradient-to-br text-3xl font-black opacity-60 ${person.className}`}>{person.initials}</div>
                  <div className="absolute inset-x-3 bottom-3 flex items-end justify-between rounded-xl bg-slate-700/80 px-3 py-2 text-white backdrop-blur">
                    <div><div className="text-[11px] font-black">{person.name}</div><div className="text-[9px] text-slate-300">{person.role}</div></div>
                    <MicOff size={14} />
                  </div>
                </article>
              ))}
            </div>
          </main>

          <aside className="min-h-[760px] bg-white ring-2 ring-inset ring-teal-300/30">
            <div className="border-b border-teal-100 bg-teal-50 px-4 py-2 text-center text-[10px] font-black uppercase tracking-[0.18em] text-teal-800">
              Aktív DIMPRO Teams-panel
            </div>
            <MeetingAssistantPanel meetingId={meetingId} initialRole="organizer" embedded={false} allowRoleSwitch accessToken={previewAccessToken} />
          </aside>
        </div>
      </div>
      )}
    </div>
  );
}