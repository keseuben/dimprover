"use client";

import { Bot, Eye, FileText, Maximize2, MessageSquarePlus, Send } from "lucide-react";
import { renderLiveMinutesText } from "@/app/lib/meeting-assistant/live-minutes";
import type { MeetingViewRole, MeetingWorkspace } from "@/app/lib/meeting-assistant/types";
import MeetingSectionShell from "./MeetingSectionShell";

const IMPORTANT_LABELS = [
  "Előzmény / problémafelvetés",
  "Egyeztetés tartalma",
  "Döntés / eredmény",
  "Nyitott kérdések",
  "Megrendelői vélemény / jóváhagyás",
  "Tervezői álláspont",
  "Kivitelezői álláspont",
  "Felelős",
  "Határidő",
  "Privát szervezői megjegyzés",
  "Várható időpont",
];

function lineTone(label: string) {
  if (label.includes("Döntés")) return "border-emerald-200 bg-emerald-50/65";
  if (label.includes("Nyitott")) return "border-amber-200 bg-amber-50/65";
  if (label.includes("Megrendelői")) return "border-sky-200 bg-sky-50/65";
  if (label.includes("Privát")) return "border-violet-200 bg-violet-50/65";
  return "border-teal-100 bg-white/60";
}

function RichMinutesText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1.5 font-sans text-[12px] leading-[1.72] text-slate-700">
      {lines.map((rawLine, index) => {
        const line = rawLine.trim();
        if (!line) return <div key={`space-${index}`} className="h-1.5" />;

        const heading = line.match(/^(#{1,3})\s+(.+)$/);
        if (heading) {
          const level = heading[1].length;
          const title = heading[2];
          if (level === 1) return <h2 key={index} className="border-b border-teal-200 pb-2 text-[16px] font-black tracking-tight text-slate-950">{title}</h2>;
          if (level === 2) return <h3 key={index} className="mt-4 border-b border-teal-200/80 pb-1 text-[13px] font-black text-slate-900 underline decoration-slate-900 decoration-2 underline-offset-4">{title}</h3>;
          return <h4 key={index} className="mt-3 text-[12px] font-black italic text-teal-950">{title}</h4>;
        }

        const metadata = line.match(/^\*\*(.+?):\*\*\s*(.*)$/);
        if (metadata) {
          return (
            <div key={index} className="grid grid-cols-[minmax(112px,auto)_1fr] gap-2 border-b border-teal-100 py-1">
              <strong className="font-black text-slate-900 underline decoration-slate-900 underline-offset-2">{metadata[1]}:</strong>
              <span className="font-semibold text-slate-700">{metadata[2] || "-"}</span>
            </div>
          );
        }

        if (line.startsWith("- ")) {
          const bullet = line.slice(2);
          const boldBullet = bullet.match(/^\*\*(.+?):\*\*\s*(.*)$/);
          return (
            <div key={index} className="flex items-start gap-2 pl-1">
              <span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-teal-600" />
              <div>{boldBullet ? <><strong className="font-black underline decoration-slate-900 underline-offset-2">{boldBullet[1]}:</strong> {boldBullet[2]}</> : bullet}</div>
            </div>
          );
        }

        const important = IMPORTANT_LABELS.map((label) => ({ label, prefix: `${label}:` })).find((item) => line.startsWith(item.prefix));
        if (important) {
          const value = line.slice(important.prefix.length).trim();
          return (
            <div key={index} className={`rounded-md border px-2.5 py-2 ${lineTone(important.label)}`}>
              <strong className="font-black text-slate-900 underline decoration-slate-900 underline-offset-2">{important.label}:</strong>{" "}
              <span className={important.label.includes("Előzmény") ? "italic text-slate-700" : "font-medium text-slate-700"}>{value || "-"}</span>
            </div>
          );
        }

        const plainBold = line.replace(/\*\*(.*?)\*\*/g, "$1");
        const italic = line.startsWith("Az egyeztetés során") || line.startsWith("A témakör") || line.startsWith("A résztvevők");
        return <p key={index} className={italic ? "italic text-slate-600" : "text-slate-700"}>{plainBold}</p>;
      })}
    </div>
  );
}

export default function MeetingLiveMinutesSection({
  workspace,
  role,
  onOpenAi,
  onPublish,
  onOpenFeedback,
  onOpenFullDocument,
}: {
  workspace: MeetingWorkspace;
  role: MeetingViewRole;
  onOpenAi: () => void;
  onPublish: () => void;
  onOpenFeedback: () => void;
  onOpenFullDocument: () => void;
}) {
  const activeSummary = workspace.publishedSummaries.find((item) => item.id === workspace.activePublishedSummaryId && !item.revokedAt);
  const organizerText = renderLiveMinutesText(workspace, true);
  const participantText = activeSummary?.body || renderLiveMinutesText(workspace, false);
  const canSeeLiveDraft = role === "organizer" || role === "editor";

  return (
    <MeetingSectionShell
      scope={role}
      id="meeting-live-minutes"
      title="Élő, összefüggő értekezleti dokumentum"
      icon={FileText}
      accentClass="bg-teal-100 text-teal-900"
      badge={activeSummary ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[8px] font-black text-teal-800">közzétéve v{activeSummary.version}</span> : undefined}
    >
      <div
        className="meeting-notebook-sheet rounded-md border border-teal-200 px-3 py-3 text-slate-800 shadow-inner"
        style={{
          backgroundColor: "#f3faf7",
          backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent 27px, rgba(15,118,110,.075) 28px)",
        }}
      >
        <div className="mb-3 flex items-center justify-between gap-2 border-b border-teal-200 pb-2">
          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.15em] text-teal-800">{role === "organizer" ? "Élő szervezői munkapéldány" : role === "editor" ? "Élő jegyzőkönyv-szerkesztői munkapéldány" : "Közzétett résztvevői összefoglaló"}</div>
            <div className="mt-0.5 text-[12px] font-black text-slate-950 underline decoration-slate-900 underline-offset-2">{workspace.minuteNumber || workspace.documentLabel}</div>
          </div>
          {canSeeLiveDraft ? <Eye size={15} className="text-teal-700" /> : <Send size={15} className="text-teal-700" />}
        </div>
        <div className="max-h-[560px] overflow-y-auto pr-1">
          <RichMinutesText text={canSeeLiveDraft ? organizerText : participantText} />
        </div>
        {role === "participant" && activeSummary && (
          <div className="mt-4 border-t border-teal-200 pt-3">
            <div className="text-[13px] font-black text-teal-950 underline decoration-slate-900 underline-offset-3">{activeSummary.closingTitle}</div>
            <div className="mt-1 whitespace-pre-wrap font-medium leading-6 text-slate-700">{activeSummary.closingMessage}</div>
            {activeSummary.emailNotice && <div className="mt-2 rounded-md border border-teal-100 bg-white/70 p-2 text-[11px] font-semibold italic text-teal-950">{activeSummary.emailNotice}</div>}
            {activeSummary.nextMeetingAt && <div className="mt-2 text-[11px] font-bold"><span className="underline decoration-slate-900 underline-offset-2">Következő várható egyeztetés:</span> {new Date(activeSummary.nextMeetingAt).toLocaleString("hu-HU")} {activeSummary.nextMeetingLocation ? `· ${activeSummary.nextMeetingLocation}` : ""}</div>}
          </div>
        )}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={onOpenFullDocument} className="inline-flex items-center gap-1.5 rounded-md bg-slate-950 px-3 py-2 text-[10px] font-black text-white"><Maximize2 size={13} /> Teljes képernyős élő dokumentum</button>
        {role === "organizer" ? (
          <>
            <button type="button" onClick={onOpenAi} className="inline-flex items-center gap-1.5 rounded-md bg-fuchsia-700 px-3 py-2 text-[10px] font-black text-white"><Bot size={13} /> AI megfogalmazás</button>
            <button type="button" onClick={onPublish} className="inline-flex items-center gap-1.5 rounded-md bg-teal-700 px-3 py-2 text-[10px] font-black text-white"><Send size={13} /> Összefoglaló közzététele</button>
          </>
        ) : role === "participant" && activeSummary ? (
          <button type="button" onClick={onOpenFeedback} className="inline-flex items-center gap-1.5 rounded-md bg-teal-800 px-3 py-2 text-[10px] font-black text-white"><MessageSquarePlus size={13} /> Visszaigazolás vagy észrevétel</button>
        ) : null}
      </div>
    </MeetingSectionShell>
  );
}