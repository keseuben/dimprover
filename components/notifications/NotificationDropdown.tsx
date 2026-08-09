"use client";

import Link from "next/link";
import { Bell, ExternalLink, RefreshCcw } from "lucide-react";
import type { NotificationWithRecipient } from "@/app/lib/notifications/types";
import NotificationList from "./NotificationList";

type NotificationDropdownProps = {
  notifications: NotificationWithRecipient[];
  unreadCount: number;
  loading?: boolean;
  error?: string | null;
  onRefresh?: () => void;
  onSelect?: (notification: NotificationWithRecipient) => void;
  onMarkRead?: (notification: NotificationWithRecipient) => void;
  onArchive?: (notification: NotificationWithRecipient) => void;
};

export default function NotificationDropdown({
  notifications,
  unreadCount,
  loading = false,
  error = null,
  onRefresh,
  onSelect,
  onMarkRead,
  onArchive,
}: NotificationDropdownProps) {
  return (
    <div className="w-[390px] border border-slate-200 bg-white p-3 text-left text-slate-900 shadow-2xl ring-1 ring-slate-900/5">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">
            <Bell size={13} /> Értesítési Központ
          </div>
          <h3 className="mt-1 text-base font-black text-slate-950">Gyorslista</h3>
          <p className="mt-1 text-xs font-semibold text-slate-500">{unreadCount} olvasatlan értesítés</p>
        </div>
        <button type="button" onClick={onRefresh} className="flex h-8 w-8 items-center justify-center border border-slate-200 text-slate-500 hover:bg-slate-50" title="Frissítés">
          <RefreshCcw size={14} />
        </button>
      </div>

      {error ? (
        <div className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-relaxed text-amber-800">
          {error}
        </div>
      ) : null}

      <div className="mt-3 max-h-[430px] overflow-y-auto pr-1">
        <NotificationList
          notifications={notifications}
          loading={loading}
          compact
          onSelect={onSelect}
          onMarkRead={onMarkRead}
          onArchive={onArchive}
        />
      </div>

      <Link href="/notifications" className="mt-3 flex items-center justify-center gap-2 border border-cyan-200 bg-cyan-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyan-800 hover:bg-cyan-100">
        Teljes értesítési központ <ExternalLink size={13} />
      </Link>
    </div>
  );
}
