"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bell } from "lucide-react";
import type { NotificationWithRecipient } from "@/app/lib/notifications/types";
import {
  archiveNotification,
  getUnreadNotificationCount,
  listNotifications,
  markNotificationRead,
} from "@/app/lib/api/notifications";
import NotificationDropdown from "./NotificationDropdown";

type NotificationBellProps = {
  className?: string;
  buttonClassName?: string;
  dropdownAlign?: "left" | "right";
  showLabel?: boolean;
};

export default function NotificationBell({ className = "", buttonClassName = "", dropdownAlign = "right", showLabel = false }: NotificationBellProps) {
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState<NotificationWithRecipient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [countResult, listResult] = await Promise.all([
        getUnreadNotificationCount(),
        listNotifications({ page: 1, pageSize: 5 }),
      ]);
      setUnreadCount(countResult.unreadCount || 0);
      setNotifications(listResult.notifications || []);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Értesítések betöltési hibája.");
      setUnreadCount(0);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 60_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  useEffect(() => {
    if (!open) return;
    function handleClick(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    window.addEventListener("mousedown", handleClick);
    return () => window.removeEventListener("mousedown", handleClick);
  }, [open]);

  async function handleSelect(notification: NotificationWithRecipient) {
    if (!notification.isUnread) return;
    await handleMarkRead(notification);
  }

  async function handleMarkRead(notification: NotificationWithRecipient) {
    try {
      await markNotificationRead(notification.id);
      await refresh();
    } catch (markError) {
      setError(markError instanceof Error ? markError.message : "Olvasottsági állapot mentési hiba.");
    }
  }

  async function handleArchive(notification: NotificationWithRecipient) {
    try {
      await archiveNotification(notification.id);
      await refresh();
    } catch (archiveError) {
      setError(archiveError instanceof Error ? archiveError.message : "Archiválási hiba.");
    }
  }

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className={`relative inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-slate-600 shadow-sm hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800 ${buttonClassName}`}
        title="Értesítések"
        aria-label="Értesítések"
        aria-expanded={open}
      >
        <Bell size={18} />
        {showLabel ? <span className="text-xs font-black uppercase tracking-[0.08em]">Értesítések</span> : null}
        {unreadCount > 0 ? (
          <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-red-500 px-1.5 py-0.5 text-center text-[10px] font-black leading-none text-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className={`absolute top-full z-[12000] mt-2 ${dropdownAlign === "right" ? "right-0" : "left-0"}`}>
          <NotificationDropdown
            notifications={notifications}
            unreadCount={unreadCount}
            loading={loading}
            error={error}
            onRefresh={refresh}
            onSelect={handleSelect}
            onMarkRead={handleMarkRead}
            onArchive={handleArchive}
          />
        </div>
      ) : null}
    </div>
  );
}
