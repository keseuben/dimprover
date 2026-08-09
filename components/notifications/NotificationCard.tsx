"use client";

import Link from "next/link";
import { Archive, Check, ExternalLink, FileText } from "lucide-react";
import type { NotificationWithRecipient } from "@/app/lib/notifications/types";
import { NotificationStatusBadge, notificationPriorityLabel } from "./NotificationStatusBadge";

function formatDateTime(value: string) {
  try {
    return new Intl.DateTimeFormat("hu-HU", {
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

type NotificationCardProps = {
  notification: NotificationWithRecipient;
  selected?: boolean;
  compact?: boolean;
  onSelect?: (notification: NotificationWithRecipient) => void;
  onMarkRead?: (notification: NotificationWithRecipient) => void;
  onArchive?: (notification: NotificationWithRecipient) => void;
};

export default function NotificationCard({
  notification,
  selected = false,
  compact = false,
  onSelect,
  onMarkRead,
  onArchive,
}: NotificationCardProps) {
  return (
    <article
      className={`group relative border bg-white text-left shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50/30 ${
        selected ? "border-cyan-400 ring-2 ring-cyan-100" : notification.isUnread ? "border-slate-300" : "border-slate-200"
      } ${compact ? "p-3" : "p-4"}`}
    >
      <button type="button" onClick={() => onSelect?.(notification)} className="block w-full text-left">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {notification.isUnread && <span className="h-2 w-2 rounded-full bg-red-500" title="Olvasatlan" />}
              <NotificationStatusBadge type={notification.type} priority={notification.priority} />
              <span className="text-[10px] font-black uppercase tracking-[0.12em] text-slate-400">
                {notificationPriorityLabel(notification.priority)}
              </span>
            </div>
            <h3 className={`mt-2 font-black text-slate-950 ${compact ? "text-sm" : "text-base"}`}>{notification.title}</h3>
            <p className={`mt-1 line-clamp-2 font-semibold leading-relaxed text-slate-500 ${compact ? "text-xs" : "text-sm"}`}>{notification.message}</p>
          </div>
          <span className="shrink-0 text-[10px] font-black text-slate-400">{formatDateTime(notification.createdAt)}</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] font-bold text-slate-500">
          {notification.projectName || notification.projectId ? (
            <span className="rounded-full bg-slate-100 px-2 py-1">Projekt: {notification.projectName || notification.projectId}</span>
          ) : null}
          {notification.relatedFileName ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-1"><FileText size={12} /> {notification.relatedFileName}</span>
          ) : null}
          <span className="rounded-full bg-slate-100 px-2 py-1">Forrás: {notification.sourceClient || notification.source}</span>
        </div>
      </button>

      <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
        {notification.actionUrl ? (
          <Link href={notification.actionUrl} className="inline-flex items-center gap-1 rounded-lg border border-cyan-200 bg-cyan-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100">
            Megnyitás <ExternalLink size={12} />
          </Link>
        ) : null}
        {notification.isUnread ? (
          <button type="button" onClick={() => onMarkRead?.(notification)} className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-emerald-800 hover:bg-emerald-100">
            <Check size={12} /> Olvasott
          </button>
        ) : null}
        <button type="button" onClick={() => onArchive?.(notification)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.08em] text-slate-600 hover:bg-slate-50">
          <Archive size={12} /> Archiválás
        </button>
      </div>
    </article>
  );
}
