import type { DeveloperWeeklySummary } from "./developer-console";

export const WEEKLY_REPORT_VERSION = "BENJADMIN_WEEKLY_REPORT_V2_0" as const;

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function statusLabel(status: DeveloperWeeklySummary["managementSummary"]["status"]) {
  if (status === "critical") return "BEAVATKOZÁS";
  if (status === "watch") return "FIGYELENDŐ";
  return "STABIL";
}

function durationLabel(minutes: number | null) {
  if (minutes === null || !Number.isFinite(minutes)) return "—";
  const safe = Math.max(0, Math.round(minutes));
  if (safe < 60) return `${safe} perc`;
  const hours = Math.floor(safe / 60);
  const rest = safe % 60;
  return rest ? `${hours} óra ${rest} perc` : `${hours} óra`;
}

function trendDelta(item: DeveloperWeeklySummary["flowAnalytics"]["trend"]["metrics"][number]) {
  const absolute = `${item.delta > 0 ? "+" : ""}${item.delta}`;
  if (item.deltaPercent === null) return `${absolute} · új`;
  return `${absolute} · ${item.deltaPercent > 0 ? "+" : ""}${item.deltaPercent}%`;
}

export function safeWeeklyReportFileName(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 120) || "benjadmin-weekly-report";
}

export function weeklyReportBaseName(summary: DeveloperWeeklySummary) {
  const project = summary.projectId ? `-${safeWeeklyReportFileName(summary.projectId)}` : "-all-projects";
  return `BENJADMIN-heti-vezeto-riport-${summary.period.weekKey}${project}`;
}

export function weeklyReportJson(summary: DeveloperWeeklySummary) {
  return {
    reportVersion: WEEKLY_REPORT_VERSION,
    generatedAt: new Date().toISOString(),
    productionAccess: "DENY" as const,
    summary,
  };
}

export function renderWeeklyManagementReportHtml(summary: DeveloperWeeklySummary) {
  const management = summary.managementSummary;
  const flow = summary.flowAnalytics;
  const status = statusLabel(management.status);
  const positives = management.positives.length
    ? management.positives.map((item) => `<li>${escapeHtml(item)}</li>`).join("")
    : "<li>Nincs külön kiemelt pozitív jelzés.</li>";
  const risks = management.risks.length
    ? management.risks.map((item) => `<article class="risk ${escapeHtml(item.severity)}"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span></article>`).join("")
    : '<p class="empty">Nincs kiemelt heti kockázati jelzés.</p>';
  const actions = management.nextActions.map((item, index) => `<li><b>${index + 1}.</b> ${escapeHtml(item)}</li>`).join("");
  const trend = flow.trend.available
    ? flow.trend.metrics.map((item) => `<tr><td>${escapeHtml(item.label)}</td><td>${item.previous}</td><td>${item.current}</td><td class="${escapeHtml(item.tone)}">${escapeHtml(trendDelta(item))}</td></tr>`).join("")
    : '<tr><td colspan="4">Az előző heti összevetés nem áll rendelkezésre.</td></tr>';
  const workers = flow.workerLoad.length
    ? flow.workerLoad.map((worker) => `<tr><td><strong>${escapeHtml(worker.code)}</strong></td><td>${worker.activityCount}</td><td>${worker.contextCount}</td><td>${worker.loadSharePercent}%</td><td>${escapeHtml(worker.signal.toUpperCase())}</td><td>${worker.waitCount + worker.blockerCount}</td></tr>`).join("")
    : '<tr><td colspan="6">Nincs worker-terhelési adat.</td></tr>';
  const blockers = flow.blockers.length
    ? flow.blockers.slice(0, 8).map((item) => `<article class="blocker"><strong>${escapeHtml(item.label)}</strong><span>${escapeHtml(item.detail)}</span><small>${escapeHtml(item.workerCode || "RENDSZER")}</small></article>`).join("")
    : '<p class="empty">Nincs rögzített elakadási ok.</p>';

  return `<!doctype html>
<html lang="hu">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${escapeHtml(weeklyReportBaseName(summary))}</title>
<style>
  @page { size: A4; margin: 12mm 12mm 14mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #172033; background: #fff; font-family: "Segoe UI", Arial, sans-serif; font-size: 10px; line-height: 1.42; }
  header.report-head { border-bottom: 2px solid #176b87; padding-bottom: 8px; margin-bottom: 10px; display: flex; align-items: end; justify-content: space-between; gap: 12px; }
  .brand { display: grid; gap: 1px; }
  .brand b { font-size: 18px; letter-spacing: .04em; color: #0f607c; }
  .brand span { color: #556278; font-size: 8px; letter-spacing: .08em; }
  .meta { text-align: right; color: #667085; font-size: 8px; }
  h1 { margin: 0 0 3px; font-size: 18px; color: #152238; }
  h2 { margin: 0; font-size: 11px; color: #0f607c; }
  p { margin: 0; }
  .hero { border: 1px solid #cbd8df; border-radius: 10px; padding: 10px; margin-bottom: 8px; background: #f8fbfc; }
  .hero-top { display: flex; justify-content: space-between; gap: 10px; align-items: start; }
  .status { min-width: 112px; border: 1px solid #9cb8c5; border-radius: 999px; padding: 5px 8px; text-align: center; font-weight: 800; color: #0f607c; background: #fff; }
  .hero[data-status="watch"] .status { color: #995f00; border-color: #d9b36c; background: #fffaf0; }
  .hero[data-status="critical"] .status { color: #a72a2a; border-color: #dfa0a0; background: #fff5f5; }
  .score { font-size: 24px; font-weight: 800; color: #0f607c; }
  .hero[data-status="watch"] .score { color: #995f00; }
  .hero[data-status="critical"] .score { color: #a72a2a; }
  .narrative { margin-top: 4px; color: #536076; }
  .indicators { margin-top: 8px; display: grid; grid-template-columns: repeat(5, 1fr); gap: 5px; }
  .indicator { border: 1px solid #d7e0e5; border-radius: 7px; padding: 5px; background: #fff; }
  .indicator b { display: block; color: #172033; font-size: 12px; }
  .indicator span { color: #6b7485; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; }
  .grid3 { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; margin-bottom: 8px; }
  .card { border: 1px solid #d7e0e5; border-radius: 8px; padding: 7px; break-inside: avoid; }
  .card h2 { margin-bottom: 5px; }
  ul, ol { margin: 0; padding-left: 17px; }
  li { margin: 2px 0; }
  .risk, .blocker { display: grid; gap: 1px; border-left: 3px solid #d3a249; padding: 3px 5px; margin: 3px 0; background: #fffaf2; }
  .risk.high { border-left-color: #c84949; background: #fff6f6; }
  .risk span, .blocker span { color: #596579; }
  .blocker small { color: #788397; }
  .section { margin: 9px 0; break-inside: avoid; }
  .section > h2 { border-bottom: 1px solid #d9e3e8; padding-bottom: 3px; margin-bottom: 5px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid #e4e9ed; padding: 4px 5px; text-align: left; vertical-align: top; }
  th { color: #536076; font-size: 7px; text-transform: uppercase; letter-spacing: .04em; background: #f7f9fa; }
  td.positive { color: #28734a; font-weight: 700; }
  td.negative { color: #9b4d28; font-weight: 700; }
  .flow-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 5px; }
  .flow-cell { border: 1px solid #d7e0e5; border-radius: 7px; padding: 5px; }
  .flow-cell b { display: block; font-size: 13px; color: #172033; }
  .flow-cell span { font-size: 7px; color: #6b7485; }
  .empty { color: #788397; font-style: italic; }
  footer { margin-top: 12px; padding-top: 5px; border-top: 1px solid #d8e0e5; display: flex; justify-content: space-between; gap: 8px; color: #7a8494; font-size: 7px; }
</style>
</head>
<body>
<header class="report-head">
  <div class="brand"><b>DIMPROVER</b><span>BENJADMIN · WEEKLY DEVELOPMENT FLOW</span></div>
  <div class="meta"><div>${escapeHtml(summary.period.label)}</div><div>${escapeHtml(summary.projectId || "Összes projekt")}</div><div>Generálva: ${escapeHtml(new Date().toLocaleString("hu-HU", { timeZone: "Europe/Budapest" }))}</div></div>
</header>
<section class="hero" data-status="${escapeHtml(management.status)}">
  <div class="hero-top"><div><h1>${escapeHtml(management.headline)}</h1><p class="narrative">${escapeHtml(management.narrative)}</p></div><div><div class="status">${status}</div><div class="score">${management.score}/100</div></div></div>
  <div class="indicators">
    <div class="indicator"><b>${management.indicators.completed}</b><span>Lezárt task</span></div>
    <div class="indicator"><b>${management.indicators.failures}</b><span>Hiba / elakadás</span></div>
    <div class="indicator"><b>${management.indicators.waiting}</b><span>Várakozás</span></div>
    <div class="indicator"><b>${management.indicators.activeWorkers}</b><span>Aktív worker</span></div>
    <div class="indicator"><b>${escapeHtml(durationLabel(management.indicators.handoffGapMinutes))}</b><span>Max átadás</span></div>
  </div>
</section>
<div class="grid3">
  <section class="card"><h2>Pozitívumok</h2><ul>${positives}</ul></section>
  <section class="card"><h2>Figyelmet igényel</h2>${risks}</section>
  <section class="card"><h2>Következő vezetői teendő</h2><ol>${actions}</ol></section>
</div>
<section class="section"><h2>Heti fejlesztési mutatók</h2><div class="flow-grid">
  <div class="flow-cell"><b>${summary.stats.activities}</b><span>AKTIVITÁS</span></div>
  <div class="flow-cell"><b>${summary.stats.contexts}</b><span>MUNKARÉSZ</span></div>
  <div class="flow-cell"><b>${flow.handoffs}</b><span>WORKER ÁTADÁS</span></div>
  <div class="flow-cell"><b>${flow.buildLockWaits + flow.waitingForWorker}</b><span>VÁRAKOZÁS</span></div>
</div></section>
<section class="section"><h2>Előző héthez képest</h2><table><thead><tr><th>Mutató</th><th>Előző</th><th>Aktuális</th><th>Eltérés</th></tr></thead><tbody>${trend}</tbody></table></section>
<section class="section"><h2>Worker terhelés</h2><table><thead><tr><th>Worker</th><th>Aktivitás</th><th>Munkarész</th><th>Megoszlás</th><th>Jelzés</th><th>Várakozás / blocker</th></tr></thead><tbody>${workers}</tbody></table></section>
<section class="section"><h2>Átadás / lead-time</h2><div class="flow-grid">
  <div class="flow-cell"><b>${escapeHtml(durationLabel(flow.handoffTiming.averageGapMinutes))}</b><span>ÁTLAGOS ÁTADÁSI RÉS</span></div>
  <div class="flow-cell"><b>${escapeHtml(durationLabel(flow.handoffTiming.medianGapMinutes))}</b><span>MEDIÁN ÁTADÁSI RÉS</span></div>
  <div class="flow-cell"><b>${escapeHtml(durationLabel(flow.handoffTiming.maxGapMinutes))}</b><span>LEGHOSSZABB ÁTADÁS</span></div>
  <div class="flow-cell"><b>${escapeHtml(durationLabel(flow.handoffTiming.buildLockWaitMinutes))}</b><span>BUILD-LOCK VÁRAKOZÁS</span></div>
</div></section>
<section class="section"><h2>Elakadási okok</h2>${blockers}</section>
<footer><span>${escapeHtml(WEEKLY_REPORT_VERSION)} · Europe/Budapest</span><strong>DEV ONLY · PROD DENY</strong></footer>
</body>
</html>`;
}
