"use client";

import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function BenjadminDataWorkspace({
  eyebrow,
  title,
  description,
  actions,
  metrics,
  toolbar,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  metrics?: ReactNode;
  toolbar?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="benjadmin-data-page">
      <section className="benjadmin-data-workspace">
        <header className="benjadmin-data-header">
          <div className="benjadmin-data-header__copy">
            <p>{eyebrow}</p>
            <h1>{title}</h1>
            {description ? <small>{description}</small> : null}
          </div>
          {actions ? <div className="benjadmin-data-header__actions">{actions}</div> : null}
        </header>
        {metrics ? <div className="benjadmin-data-metrics">{metrics}</div> : null}
        {toolbar ? <div className="benjadmin-data-toolbar">{toolbar}</div> : null}
        <section className="benjadmin-data-table-shell">{children}</section>
        {footer ? <footer className="benjadmin-data-footer">{footer}</footer> : null}
      </section>
    </main>
  );
}

export function BenjadminMetric({ label, value, tone = "default" }: { label: string; value: ReactNode; tone?: "default" | "ok" | "warning" | "danger" }) {
  return (
    <div className={`benjadmin-data-metric is-${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function BenjadminStatusPill({ children, tone = "default" }: { children: ReactNode; tone?: "default" | "ok" | "warning" | "danger" | "info" }) {
  return <span className={`benjadmin-data-status is-${tone}`}>{children}</span>;
}

export function BenjadminPagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizes = [25, 50, 100],
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizes?: number[];
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(page, totalPages));
  const start = total === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);

  return (
    <div className="benjadmin-data-pagination">
      <span>{total === 0 ? "0 találat" : `${start}–${end} / ${total}`}</span>
      <label>
        Sor / oldal
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {pageSizes.map((size) => <option key={size} value={size}>{size}</option>)}
        </select>
      </label>
      <div>
        <button type="button" onClick={() => onPageChange(Math.max(1, safePage - 1))} disabled={safePage <= 1} aria-label="Előző oldal"><ChevronLeft size={16} /></button>
        <strong>{safePage} / {totalPages}</strong>
        <button type="button" onClick={() => onPageChange(Math.min(totalPages, safePage + 1))} disabled={safePage >= totalPages} aria-label="Következő oldal"><ChevronRight size={16} /></button>
      </div>
    </div>
  );
}
