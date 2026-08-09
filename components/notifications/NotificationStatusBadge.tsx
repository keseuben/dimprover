"use client";

import type { NotificationPriority, NotificationType } from "@/app/lib/notifications/types";

export function notificationTypeLabel(type: NotificationType) {
  const labels: Record<NotificationType, string> = {
    FILE_UPLOADED: "Fájl feltöltés",
    FILE_UPDATED: "Fájl módosítás",
    PROJECT_INVITE: "Meghívó",
    PROJECT_INVITE_ACCEPTED: "Meghívó elfogadva",
    MINUTES_CREATED: "Jegyzőkönyv",
    DEADLINE_SOON: "Határidő",
    DOKUBOX_DROP_UPLOAD: "DokuBOX Drop",
    DRIVE_SYNC_ERROR: "Drive hiba",
    SYSTEM_INFO: "Rendszer",
  };
  return labels[type] || type;
}

export function notificationPriorityLabel(priority: NotificationPriority) {
  const labels: Record<NotificationPriority, string> = {
    low: "Alacsony",
    normal: "Normál",
    high: "Fontos",
    urgent: "Sürgős",
  };
  return labels[priority] || priority;
}

export function NotificationStatusBadge({ type, priority }: { type: NotificationType; priority: NotificationPriority }) {
  const priorityClass =
    priority === "urgent"
      ? "border-red-200 bg-red-50 text-red-700"
      : priority === "high"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-cyan-200 bg-cyan-50 text-cyan-700";

  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-1 text-[10px] font-black uppercase tracking-[0.08em] ${priorityClass}`}>
      {notificationTypeLabel(type)}
    </span>
  );
}
