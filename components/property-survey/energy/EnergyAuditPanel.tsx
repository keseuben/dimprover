"use client";

import { ChevronRight, FileSearch } from "lucide-react";
import type { EnergyEnvelopeGeometryResult } from "@/components/energy/domain/energyGeometryTypes";

function value(value: number, unit: string) {
  return `${value.toLocaleString("hu-HU", { maximumFractionDigits: unit === "1/m" ? 4 : 3 })} ${unit.replace("m2", "m²").replace("m3", "m³")}`;
}

export function EnergyAuditPanel({ result }: { result: EnergyEnvelopeGeometryResult }) {
  return <section className="grid gap-4" data-energy-audit-panel="true">
    <div className="rounded-2xl border border-violet-300 bg-violet-50 p-4 text-violet-950"><div className="flex items-start gap-3"><FileSearch size={22} className="shrink-0" /><div><div className="text-sm font-black">Számítási nyomvonal</div><p className="mt-1 text-xs font-semibold leading-5">Minden sor tartalmazza a bemeneteket, a képletet, a kerekítetlen és kijelzett eredményt, valamint az érintett helyiséget, falszakaszt vagy szintet.</p></div></div></div>
    <div className="grid gap-2" data-energy-trace-list="true">{result.trace.map((item) => <details key={item.id} className="group rounded-xl border border-[var(--survey-border)] bg-[var(--survey-panel-strong)]" data-energy-trace-rule={item.ruleId}><summary className="flex cursor-pointer list-none items-start gap-2 p-3"><ChevronRight size={15} className="mt-0.5 shrink-0 transition group-open:rotate-90" /><span className="min-w-0 flex-1"><span className="block text-xs font-black text-[var(--survey-text)]">{item.label}</span><span className="mt-1 block text-[9px] font-bold text-[var(--survey-muted)]">{item.ruleId} · {item.formula}</span></span><span className="shrink-0 text-xs font-black text-[var(--survey-text)]">{value(item.value, item.unit)}</span></summary><div className="grid gap-3 border-t border-[var(--survey-border)] p-3 text-[10px] font-semibold text-[var(--survey-muted)]"><div><strong className="text-[var(--survey-text)]">Kerekítetlen eredmény:</strong> {item.unroundedValue}</div><div className="overflow-x-auto"><table className="min-w-[420px] w-full"><tbody>{Object.entries(item.inputs).map(([key, inputValue]) => <tr key={key} className="border-b border-[var(--survey-border)]/60"><td className="py-1 pr-3 font-black text-[var(--survey-text)]">{key}</td><td className="py-1">{String(inputValue)}</td></tr>)}</tbody></table></div><div><strong className="text-[var(--survey-text)]">Kapcsolódó elemek:</strong> {item.entityRefs.map((reference) => reference.name).join(" · ") || "Épület"}</div></div></details>)}</div>
  </section>;
}
