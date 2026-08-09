"use client";

import Link from "next/link";
import { Archive, Check, ExternalLink, FileText, Info, X } from "lucide-react";
import type { NotificationWithRecipient } from "@/app/lib/notifications/types";
import { NotificationStatusBadge } from "./NotificationStatusBadge";

function formatFullDateTime(value?: string | null) {
  if (!value) return "-";
  try {
    return new Intl.DateTimeFormat("hu-HU", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function DetailRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="border-b border-slate-100 py-2">
      <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">{label}</div>
      <div className="mt-1 break-words text-sm font-bold text-slate-800">{value || "-"}</div>
    </div>
  );
}

type NotificationDetailPanelProps = {
  notification: NotificationWithRecipient | null;
  onClose?: () => void;
  onMarkRead?: (notification: NotificationWithRecipient) => void;
  onArchive?: (notification: NotificationWithRecipient) => void;
};

export default function NotificationDetailPanel({ notification, onClose, onMarkRead, onArchive }: NotificationDetailPanelProps) {
  if (!notification) {
    return (
      <aside className="h-full border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex h-full min-h-[360px] flex-col items-center justify-center text-center">
          <Info size={34} className="text-slate-300" />
          <h3 className="mt-3 text-base font-black text-slate-800">Nincs kijelölt értesítés</h3>
          <p className="mt-1 text-sm font-semibold text-slate-500">Válassz ki egy értesítést a részletek, projektkapcsolat és olvasottsági állapot megtekintéséhez.</p>
        </div>
      </aside>
    );
  }

  return (
    <aside className="h-full border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <NotificationStatusBadge type={notification.type} priority={notification.priority} />
            {notification.isUnread ? <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-red-700">Olvasatlan</span> : <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700">Olvasott</span>}
          </div>
          <h2 className="mt-3 text-lg font-black leading-tight text-slate-950">{notification.title}</h2>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-600">{notification.message}</p>
        </div>
        {onClose ? (
          <button type="button" onClick={onClose} className="flex h-8 w-8 shrink-0 items-center justify-center border border-slate-200 text-slate-400 hover:bg-slate-50 hover:text-slate-900">
            <X size={15} />
          </button>
        ) : null}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 text-sm">
        <DetailRow label="Projekt" value={notification.projectName || notification.projectId} />
        <DetailRow label="Kapcsolódó fájl" value={notification.relatedFileName || notification.relatedFileId} />
        <DetailRow label="Létrehozva" value={formatFullDateTime(notification.createdAt)} />
        <DetailRow label="Kézbesítve" value={formatFullDateTime(notification.recipient.deliveredAt)} />
        <DetailRow label="Olvasva" value={formatFullDateTime(notification.recipient.readAt)} />
        <DetailRow label="Forrás" value={notification.sourceClient || notification.source} />
      </div>

      <div className="mt-5 flex flex-col gap-2">
        {notification.actionUrl ? (
          <Link href={notification.actionUrl} className="inline-flex items-center justify-center gap-2 border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100">
            Kapcsolódó elem megnyitása <ExternalLink size={15} />
          </Link>
        ) : null}
        {notification.relatedFileName ? (
          <div className="flex items-center gap-2 border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold text-slate-600">
            <FileText size={15} /> {notification.relatedFileName}
          </div>
        ) : null}
        {notification.isUnread ? (
          <button type="button" onClick={() => onMarkRead?.(notification)} className="inline-flex items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-emerald-800 hover:bg-emerald-100">
            <Check size={15} /> Olvasottnak jelölés
          </button>
        ) : null}
        <button type="button" onClick={() => onArchive?.(notification)} className="inline-flex items-center justify-center gap-2 border border-slate-200 bg-white px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-slate-700 hover:bg-slate-50">
          <Archive size={15} /> Archiválás
        </button>
      </div>
    </aside>
  );
}
