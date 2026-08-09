"use client";

import { useEffect, useMemo, useState } from "react";
import {
  BrainCircuit,
  ClipboardCopy,
  Loader2,
  Sparkles,
  WalletCards,
} from "lucide-react";

type AiAction = {
  id: string;
  label: string;
  shortLabel: string;
  description: string;
  tier: "low" | "medium" | "high";
  maxOutputTokens: number;
  estimatedHufMin: number;
  estimatedHufMax: number;
  applyTargets: ApplyTarget[];
};

type AiUsage = {
  dailyEstimatedUsd: number;
  monthlyEstimatedUsd: number;
  dailyLimitUsd: number;
  monthlyLimitUsd: number;
  warningLimitUsd: number;
  remainingDailyUsd: number;
  remainingMonthlyUsd: number;
  callsToday: number;
  callsThisMonth: number;
};

type AiMeta = {
  ok: boolean;
  enabled: boolean;
  configured: boolean;
  model: string;
  actions: AiAction[];
  usage: AiUsage;
  note: string;
  error?: string;
};

type DevNoteAiNote = {
  title: string;
  type: string;
  status: string;
  module: string;
  priority: string;
  summary: string;
  description: string;
  codingInstruction: string;
  aiContext: string;
  source: string;
  tags: string[];
  relatedFiles: string;
  nextStep: string;
  surfaces: string[];
  epic: string;
  relatedNoteIds: string[];
  dependencies: string;
  blockers: string;
  crossChatStatus: string;
  externalAiNote: string;
  handoffSummary: string;
};

type DevNoteLite = {
  id: string;
  title: string;
  module: string;
  type: string;
  status: string;
  priority: string;
  epic: string;
  surfaces: string[];
  updatedAt: string;
};

type ApplyTarget = "aiContext" | "codingInstruction" | "nextStep" | "handoffSummary" | "description";

type AiResult = {
  ok: boolean;
  action?: AiAction;
  output?: string;
  error?: string;
  usage?: AiUsage;
  estimate?: {
    inputTokenEstimate: number;
    maxOutputTokens: number;
    estimatedUsd: number;
    estimatedHuf: number;
    hufRange: string;
  };
  actualUsage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

const targetLabels: Record<ApplyTarget, string> = {
  aiContext: "Átvétel AI kontextusba",
  codingInstruction: "Átvétel kódolási utasításba",
  nextStep: "Átvétel következő lépésbe",
  handoffSummary: "Átvétel átadó összefoglalóba",
  description: "Átvétel részletes leírásba",
};

function tierLabel(tier: AiAction["tier"]) {
  if (tier === "high") return "erősebb";
  if (tier === "medium") return "közepes";
  return "olcsó";
}

function tierClass(tier: AiAction["tier"]) {
  if (tier === "high") return "border-red-300/35 bg-red-300/10 text-red-100";
  if (tier === "medium") return "border-amber-300/35 bg-amber-300/10 text-amber-100";
  return "border-lime-300/35 bg-lime-300/10 text-lime-100";
}

function formatUsd(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return "-";
  return `${value.toFixed(2)} USD`;
}

function costLabel(action: AiAction) {
  return `kb. ${action.estimatedHufMin}–${action.estimatedHufMax} Ft`;
}

export default function DevNotesAiAssistant({
  adminKey,
  note,
  noteId,
  allNotes,
  onApplyToField,
}: {
  adminKey: string;
  note: DevNoteAiNote;
  noteId: string | null;
  allNotes: DevNoteLite[];
  onApplyToField: (target: ApplyTarget, value: string) => void;
}) {
  const [meta, setMeta] = useState<AiMeta | null>(null);
  const [loadingMeta, setLoadingMeta] = useState(false);
  const [runningActionId, setRunningActionId] = useState<string | null>(null);
  const [result, setResult] = useState<AiResult | null>(null);
  const [message, setMessage] = useState("");

  const relatedTitles = useMemo(() => {
    return note.relatedNoteIds
      .map((id) => allNotes.find((item) => item.id === id)?.title)
      .filter(Boolean)
      .slice(0, 4)
      .join(", ");
  }, [allNotes, note.relatedNoteIds]);

  async function loadMeta() {
    const key = adminKey.trim();
    if (!key) return;
    setLoadingMeta(true);
    setMessage("");
    try {
      const response = await fetch("/api/license/dev-notes-ai", {
        headers: {
          "x-dimpro-license-admin-key": key,
          accept: "application/json",
        },
        cache: "no-store",
      });
      const data = (await response.json()) as AiMeta;
      if (!response.ok || !data.ok) {
        setMessage(data.error ?? "Nem sikerült betölteni az AI segéd állapotát.");
        return;
      }
      setMeta(data);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen AI meta hiba.");
    } finally {
      setLoadingMeta(false);
    }
  }

  useEffect(() => {
    if (adminKey.trim()) void loadMeta();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminKey]);

  async function runAction(action: AiAction) {
    const key = adminKey.trim();
    if (!key) {
      setMessage("Hiányzik a licencadmin kulcs.");
      return;
    }

    setRunningActionId(action.id);
    setResult(null);
    setMessage("");
    try {
      const response = await fetch("/api/license/dev-notes-ai", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-dimpro-license-admin-key": key,
        },
        body: JSON.stringify({
          actionId: action.id,
          note: { ...note, id: noteId },
        }),
      });
      const data = (await response.json()) as AiResult;
      if (!response.ok || !data.ok) {
        setResult(data);
        setMessage(data.error ?? "Az AI művelet sikertelen.");
        if ((data as { meta?: AiMeta }).meta) setMeta((data as { meta?: AiMeta }).meta ?? meta);
        return;
      }
      setResult(data);
      if (data.usage && meta) setMeta({ ...meta, usage: data.usage });
      setMessage(`${action.label} elkészült. Nézd át, és csak utána vedd át mezőbe.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Ismeretlen AI futtatási hiba.");
    } finally {
      setRunningActionId(null);
    }
  }

  async function copyOutput() {
    const text = result?.output ?? "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setMessage("AI válasz vágólapra másolva.");
    } catch {
      setMessage("Nem sikerült vágólapra másolni.");
    }
  }

  const actions = meta?.actions ?? [];
  const disabled = !meta?.enabled || Boolean(runningActionId);

  return (
    <section className="rounded-[1.5rem] border border-fuchsia-300/20 bg-fuchsia-300/[0.06] p-4 shadow-[0_24px_80px_rgba(0,0,0,0.14)]">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <BrainCircuit className="text-fuchsia-200" size={22} />
            <p className="text-xs font-black uppercase tracking-[0.18em] text-fuchsia-100/80">AI Kontextussegéd</p>
          </div>
          <h3 className="mt-2 text-2xl font-black tracking-[-0.035em] text-white">Fejlesztési rendszerező, promptkészítő és ellenőrző AI</h3>
          <p className="mt-2 max-w-4xl text-sm font-semibold leading-6 text-slate-300">
            Az AI csak gombnyomásra fut. Minden gombon előre látszik a becsült költség. A válasz előnézetbe kerül, nem írja át automatikusan a bejegyzést.
          </p>
          {relatedTitles ? <p className="mt-2 text-xs font-bold text-cyan-100/80">Kapcsolódó bejegyzések: {relatedTitles}</p> : null}
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-950/55 p-4 text-xs font-bold leading-5 text-slate-300 xl:w-[360px]">
          <div className="mb-2 flex items-center gap-2 text-cyan-100">
            <WalletCards size={16} /> Költségkeret állapot
          </div>
          <p>Modell: <span className="font-mono text-white">{meta?.model ?? "-"}</span></p>
          <p>Mai becsült használat: <span className="text-white">{formatUsd(meta?.usage?.dailyEstimatedUsd)}</span> / {formatUsd(meta?.usage?.dailyLimitUsd)}</p>
          <p>Havi becsült használat: <span className="text-white">{formatUsd(meta?.usage?.monthlyEstimatedUsd)}</span> / {formatUsd(meta?.usage?.monthlyLimitUsd)}</p>
          <p>Mai hívások: <span className="text-white">{meta?.usage?.callsToday ?? 0}</span> · Havi hívások: <span className="text-white">{meta?.usage?.callsThisMonth ?? 0}</span></p>
          <button type="button" onClick={() => void loadMeta()} disabled={loadingMeta} className="mt-3 rounded-xl border border-white/10 px-3 py-2 text-xs font-black text-cyan-100 hover:border-cyan-300/35 disabled:opacity-50">
            {loadingMeta ? "Frissítés..." : "AI keret frissítése"}
          </button>
        </div>
      </div>

      {!meta?.configured ? (
        <div className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-300/10 p-4 text-sm font-bold leading-6 text-amber-100">
          OPENAI_API_KEY még nincs beállítva a szerveren. A teljes AI felület elkészült, de valódi AI futtatás csak az API kulcs és költségkeret beállítása után indul.
        </div>
      ) : null}

      {message ? <div className="mt-4 rounded-2xl border border-cyan-300/25 bg-cyan-300/10 px-4 py-3 text-sm font-black text-cyan-100">{message}</div> : null}

      <div className="mt-5 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            onClick={() => void runAction(action)}
            disabled={disabled}
            className="group rounded-2xl border border-white/10 bg-slate-950/45 p-4 text-left transition hover:border-fuchsia-300/35 hover:bg-fuchsia-300/10 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-black text-white">{action.shortLabel}</p>
                <p className="mt-1 text-xs font-semibold leading-5 text-slate-400">{action.description}</p>
              </div>
              {runningActionId === action.id ? <Loader2 className="shrink-0 animate-spin text-fuchsia-200" size={18} /> : <Sparkles className="shrink-0 text-fuchsia-200" size={18} />}
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${tierClass(action.tier)}`}>{tierLabel(action.tier)}</span>
              <span className="rounded-full border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1 text-[10px] font-black text-cyan-100">{costLabel(action)}</span>
            </div>
          </button>
        ))}
      </div>

      {result?.output || result?.error ? (
        <section className="mt-5 rounded-2xl border border-white/10 bg-slate-950/65 p-4">
          <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-fuchsia-100/80">AI válasz előnézet</p>
              <h4 className="mt-1 text-xl font-black text-white">{result.action?.label ?? "AI művelet"}</h4>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                Becsült költség: {result.estimate ? `${result.estimate.estimatedHuf.toFixed(1)} Ft (${result.estimate.estimatedUsd.toFixed(4)} USD)` : "-"}
                {result.actualUsage?.total_tokens ? ` · Token: ${result.actualUsage.total_tokens}` : ""}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {result.output ? <button type="button" onClick={() => void copyOutput()} className="inline-flex items-center gap-2 rounded-xl border border-cyan-300/35 bg-cyan-300/10 px-3 py-2 text-xs font-black text-cyan-100 hover:bg-cyan-300/15"><ClipboardCopy size={15} /> Másolás</button> : null}
              {result.output && result.action?.applyTargets.map((target) => (
                <button key={target} type="button" onClick={() => onApplyToField(target, result.output ?? "")} className="rounded-xl border border-lime-300/35 bg-lime-300/10 px-3 py-2 text-xs font-black text-lime-100 hover:bg-lime-300/15">
                  {targetLabels[target]}
                </button>
              ))}
            </div>
          </div>
          {result.error ? <p className="rounded-xl border border-red-300/30 bg-red-300/10 p-4 text-sm font-bold text-red-100">{result.error}</p> : null}
          {result.output ? <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl border border-white/10 bg-black/30 p-4 text-xs font-semibold leading-6 text-slate-200">{result.output}</pre> : null}
        </section>
      ) : null}
    </section>
  );
}
