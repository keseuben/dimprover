"use client";

import { CheckCircle2, ClipboardPaste, KeyRound, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import "./teams-meeting-theme.css";

export default function TeamsMeetingAssistantConfig() {
  const [state, setState] = useState<"loading" | "pairing" | "ready" | "error">("loading");
  const [message, setMessage] = useState("Teams-kontextus előkészítése...");
  const [meetingId, setMeetingId] = useState("");
  const [pairingCode, setPairingCode] = useState("");
  const [pairingLoading, setPairingLoading] = useState(false);
  const [teamsTheme, setTeamsTheme] = useState("default");
  const saveHandlerRegistered = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void import("@microsoft/teams-js")
      .then(async ({ app, pages }) => {
        await app.initialize();
        const context = await app.getContext();
        setTeamsTheme(context.app?.theme || "default");
        app.registerOnThemeChangeHandler((theme) => {
          if (!cancelled) setTeamsTheme(theme || "default");
        });
        const contextMeetingId = context.meeting?.id || context.chat?.id || context.page?.id;
        if (!contextMeetingId) {
          throw new Error("A Teams nem adott át értekezletazonosítót. A DIMPRO Kísérőt folyamatban lévő vagy ütemezett Teams-értekezlethez add hozzá.");
        }
        await pages.config.setValidityState(false);
        if (!cancelled) {
          setMeetingId(contextMeetingId);
          setState("pairing");
          setMessage("Hozz létre egy egyszer használatos párosítókódot a DIMPRO webes Értekezleti Kísérő oldalán, majd írd be ide.");
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setState("error");
          setMessage(error instanceof Error ? error.message : "A Teams konfiguráció nem indítható.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function pasteCode() {
    try {
      const value = await navigator.clipboard.readText();
      setPairingCode(value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8));
    } catch {
      setMessage("A vágólap nem olvasható automatikusan. Illeszd be a kódot a mezőbe Ctrl+V billentyűkkel.");
    }
  }

  async function pairMeeting() {
    const normalizedCode = pairingCode.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    if (!meetingId) {
      setState("error");
      setMessage("Hiányzik a Teams értekezletazonosító.");
      return;
    }
    if (normalizedCode.length !== 8) {
      setMessage("A DIMPRO Teams-párosítókód pontosan 8 karakteres.");
      return;
    }

    setPairingLoading(true);
    setMessage("Párosítókód ellenőrzése és a Teams-panel előkészítése...");
    try {
      const response = await fetch("/api/meeting-assistant/pairing", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          operation: "consume",
          meetingId,
          pairingCode: normalizedCode,
          issuedTo: "teams-organizer-editor",
        }),
      });
      const data = (await response.json().catch(() => null)) as {
        ok?: boolean;
        accessToken?: string;
        organizerAccessToken?: string;
        participantAccessToken?: string;
        workspaceMeetingId?: string;
        error?: string;
      } | null;
      if (!response.ok || !data?.organizerAccessToken || !data?.participantAccessToken) {
        throw new Error(data?.error || "A Teams-párosítás sikertelen.");
      }

      const workspaceMeetingId = data.workspaceMeetingId || meetingId;
      const organizerStorageKey = `dimpro:teams-organizer:${workspaceMeetingId}`;
      window.localStorage.setItem(organizerStorageKey, data.organizerAccessToken);
      window.localStorage.setItem(`dimpro:teams-workspace:${meetingId}`, workspaceMeetingId);

      const { app, pages } = await import("@microsoft/teams-js");
      const origin = window.location.origin;
      const query = `meetingId=${encodeURIComponent(workspaceMeetingId)}&accessToken=${encodeURIComponent(data.participantAccessToken)}`;

      if (!saveHandlerRegistered.current) {
        pages.config.registerOnSaveHandler((saveEvent) => {
          void pages.config
            .setConfig({
              suggestedDisplayName: "DIMPRO Értekezleti Kísérő",
              entityId: `dimpro-meeting-${workspaceMeetingId}`,
              contentUrl: `${origin}/teams/meeting-assistant?${query}`,
              websiteUrl: `https://app.dimpro.hu/ertekezleti-kisero?meetingId=${encodeURIComponent(workspaceMeetingId)}`,
            })
            .then(() => saveEvent.notifySuccess())
            .catch((error) =>
              saveEvent.notifyFailure(
                error instanceof Error ? error.message : "A konfiguráció mentése sikertelen.",
              ),
            );
        });
        saveHandlerRegistered.current = true;
      }

      await pages.config.setValidityState(true);
      app.notifySuccess();
      setState("ready");
      setMessage("A DIMPRO panel sikeresen párosítva. Ezen a gépen szervezői szerkesztőként nyílik meg, a meghívottak csak a résztvevői nézetet kapják. Kattints alul a Teams Mentés gombjára.");
    } catch (error) {
      setState("pairing");
      setMessage(error instanceof Error ? error.message : "A Teams-párosítás sikertelen.");
    } finally {
      setPairingLoading(false);
    }
  }

  return (
    <main className="dimpro-meeting-theme flex min-h-screen items-center justify-center p-5" data-theme={teamsTheme}>
      <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-xl">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-600 to-sky-500 text-xl font-black text-white">D</div>
        <h1 className="mt-4 text-xl font-black text-slate-950">DIMPRO Értekezleti Kísérő</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">Teams meeting side panel konfiguráció</p>

        {state === "pairing" && (
          <div className="mt-5 rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-600 text-white"><KeyRound size={18} /></span>
              <div>
                <div className="text-sm font-black text-indigo-950">Egyszer használatos párosítókód</div>
                <div className="mt-1 text-xs leading-5 text-indigo-800">Nyisd meg böngészőben a DIMPRO Értekezleti Kísérőt, kattints a <b>Teams-párosítókód létrehozása</b> gombra, majd másold ide a 8 karakteres kódot.</div>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <input
                value={pairingCode}
                onChange={(event) => setPairingCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8))}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void pairMeeting();
                }}
                autoFocus
                maxLength={8}
                placeholder="PL. 7K9M2XQH"
                className="min-w-0 flex-1 rounded-xl border border-indigo-300 bg-white px-4 py-3 text-center font-mono text-xl font-black tracking-[0.18em] text-indigo-950 outline-none focus:border-indigo-600"
              />
              <button type="button" onClick={() => void pasteCode()} className="rounded-xl border border-indigo-200 bg-white p-3 text-indigo-700 hover:bg-indigo-100" title="Beillesztés a vágólapról"><ClipboardPaste size={20} /></button>
            </div>
            <button
              type="button"
              onClick={() => void pairMeeting()}
              disabled={pairingLoading || pairingCode.length !== 8}
              className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-black text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              {pairingLoading ? <Loader2 size={17} className="animate-spin" /> : <KeyRound size={17} />}
              Párosítás és Mentés engedélyezése
            </button>
          </div>
        )}

        <div className={`mt-5 flex items-center justify-center gap-2 rounded-xl border p-4 text-sm font-bold ${state === "ready" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : state === "error" ? "border-rose-200 bg-rose-50 text-rose-800" : state === "pairing" ? "border-amber-200 bg-amber-50 text-amber-900" : "border-indigo-200 bg-indigo-50 text-indigo-800"}`}>
          {state === "loading" || pairingLoading ? <Loader2 className="animate-spin" size={18} /> : state === "ready" ? <CheckCircle2 size={18} /> : null}
          {message}
        </div>
        {meetingId && <div className="mt-3 break-all text-[10px] font-semibold text-slate-400">Teams meeting ID: {meetingId}</div>}
      </section>
    </main>
  );
}
