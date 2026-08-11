import type { ReactNode } from "react";

export type DashboardTone = "default" | "ok" | "warning" | "danger" | "info";

export function BenjadminKpiCard({
  icon,
  label,
  value,
  hint,
  tone = "default",
}: {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: DashboardTone;
}) {
  return (
    <div className={`benj-v3-kpi is-${tone}`}>
      <div className="benj-v3-kpi__icon">{icon}</div>
      <div className="benj-v3-kpi__body">
        <span>{label}</span>
        <strong>{value}</strong>
        {hint ? <small>{hint}</small> : null}
      </div>
    </div>
  );
}

export function BenjadminBarChart({
  title,
  subtitle,
  items,
}: {
  title: string;
  subtitle?: string;
  items: Array<{ label: string; value: number; total?: number; tone?: DashboardTone; hint?: string }>;
}) {
  const max = Math.max(1, ...items.map((item) => item.total ?? item.value));
  return (
    <section className="benj-v3-chart-card">
      <header>
        <div>
          <span>ANALITIKA</span>
          <h3>{title}</h3>
        </div>
        {subtitle ? <small>{subtitle}</small> : null}
      </header>
      <div className="benj-v3-bars">
        {items.map((item) => {
          const base = item.total ?? max;
          const percent = Math.max(0, Math.min(100, base > 0 ? (item.value / base) * 100 : 0));
          return (
            <div className="benj-v3-bar-row" key={item.label}>
              <div className="benj-v3-bar-row__top">
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
              <div className="benj-v3-bar-track" aria-label={`${item.label}: ${item.value}`}>
                <span className={`benj-v3-bar-fill is-${item.tone || "info"}`} style={{ width: `${percent}%` }} />
              </div>
              {item.hint ? <small>{item.hint}</small> : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

export function BenjadminSparklineCard({
  title,
  subtitle,
  value,
  valueLabel,
  points,
}: {
  title: string;
  subtitle?: string;
  value: ReactNode;
  valueLabel?: string;
  points: number[];
}) {
  const safePoints = points.length ? points : [0];
  const width = 280;
  const height = 72;
  const padding = 5;
  const max = Math.max(1, ...safePoints);
  const min = Math.min(0, ...safePoints);
  const range = Math.max(1, max - min);
  const coordinates = safePoints.map((point, index) => {
    const x = safePoints.length === 1 ? width / 2 : padding + (index / (safePoints.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point - min) / range) * (height - padding * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <section className="benj-v3-chart-card benj-v3-spark-card">
      <header>
        <div>
          <span>TREND</span>
          <h3>{title}</h3>
        </div>
        {subtitle ? <small>{subtitle}</small> : null}
      </header>
      <div className="benj-v3-spark-value">
        <strong>{value}</strong>
        {valueLabel ? <span>{valueLabel}</span> : null}
      </div>
      <svg className="benj-v3-sparkline" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${title} trend`}>
        <polyline points={coordinates} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="benj-v3-spark-axis"><span>−6 nap</span><span>ma</span></div>
    </section>
  );
}
