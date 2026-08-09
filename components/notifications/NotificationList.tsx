"use client";

import { Inbox } from "lucide-react";
import type { NotificationWithRecipient } from "@/app/lib/notifications/types";
import NotificationCard from "./NotificationCard";

type NotificationListProps = {
  notifications: NotificationWithRecipient[];
  selectedId?: string | null;
  loading?: boolean;
  compact?: boolean;
  onSelect?: (notification: NotificationWithRecipient) => void;
  onMarkRead?: (notification: NotificationWithRecipient) => void;
  onArchive?: (notification: NotificationWithRecipient) => void;
};

export default function NotificationList({
  notifications,
  selectedId,
  loading = false,
  compact = false,
  onSelect,
  onMarkRead,
  onArchive,
}: NotificationListProps) {
  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: compact ? 3 : 5 }).map((_, index) => (
          <div key={index} className="animate-pulse border border-slate-200 bg-white p-4">
            <div className="h-3 w-24 rounded bg-slate-100" />
            <div className="mt-3 h-4 w-3/4 rounded bg-slate-100" />
            <div className="mt-2 h-3 w-full rounded bg-slate-100" />
          </div>
        ))}
      </div>
    );
  }

  if (!notifications.length) {
    return (
      <div className="flex min-h-[220px] flex-col items-center justify-center border border-dashed border-slate-300 bg-white/70 p-8 text-center">
        <Inbox size={34} className="text-slate-300" />
        <h3 className="mt-3 text-base font-black text-slate-800">Nincs megjeleníthető értesítés</h3>
        <p className="mt-1 max-w-md text-sm font-semibold text-slate-500">A kiválasztott szűrőhöz jelenleg nincs értesítés. Új fájlfeltöltés, jegyzőkönyv vagy határidő esemény után itt jelenik meg.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {notifications.map((notification) => (
        <NotificationCard
          key={`${notification.id}-${notification.recipient.id}`}
          notification={notification}
          selected={notification.id === selectedId}
          compact={compact}
          onSelect={onSelect}
          onMarkRead={onMarkRead}
          onArchive={onArchive}
        />
      ))}
    </div>
  );
}
