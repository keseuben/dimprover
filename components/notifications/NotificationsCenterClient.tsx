"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bell, CheckCheck, Filter, RefreshCcw } from "lucide-react";
import type { NotificationType, NotificationWithRecipient } from "@/app/lib/notifications/types";
import {
  archiveNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/app/lib/api/notifications";
import NotificationDetailPanel from "./NotificationDetailPanel";
import NotificationList from "./NotificationList";

const tabs: Array<{ key: NotificationType | "ALL" | "UNREAD"; label: string; unreadOnly?: boolean; type?: NotificationType | "ALL" }> = [
  { key: "ALL", label: "Összes", type: "ALL" },
  { key: "UNREAD", label: "Olvasatlan", type: "ALL", unreadOnly: true },
  { key: "FILE_UPLOADED", label: "Fájlok", type: "FILE_UPLOADED" },
  { key: "DEADLINE_SOON", label: "Határidők", type: "DEADLINE_SOON" },
  { key: "PROJECT_INVITE", label: "Meghívók", type: "PROJECT_INVITE" },
  { key: "MINUTES_CREATED", label: "Jegyzőkönyvek", type: "MINUTES_CREATED" },
];

export default function NotificationsCenterClient() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]["key"]>("ALL");
  const [projectId, setProjectId] = useState("");
  const [notifications, setNotifications] = useState<NotificationWithRecipient[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedNotification = useMemo(
    () => notifications.find((notification) => notification.id === selectedId) || notifications[0] || null,
    [notifications, selectedId],
  );

  const activeFilter = useMemo(() => tabs.find((tab) => tab.key === activeTab) || tabs[0], [activeTab]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listNotifications({
        projectId: projectId.trim() || undefined,
        type: activeFilter.type || "ALL",
        unreadOnly: activeFilter.unreadOnly,
        page: 1,
        pageSize: 50,
      });
      setNotifications(result.notifications || []);
      setUnreadCount(result.unreadCount || 0);
      setTotal(result.total || 0);
      setSelectedId((current) => {
        if (current && result.notifications?.some((notification) => notification.id === current)) return current;
        return result.notifications?.[0]?.id || null;
      });
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Értesítések betöltési hibája.");
      setNotifications([]);
      setUnreadCount(0);
      setTotal(0);
      setSelectedId(null);
    } finally {
      setLoading(false);
    }
  }, [activeFilter.type, activeFilter.unreadOnly, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  async function handleMarkAllRead() {
    try {
      await markAllNotificationsRead({
        projectId: projectId.trim() || undefined,
        type: activeFilter.type || "ALL",
      });
      await refresh();
    } catch (markAllError) {
      setError(markAllError instanceof Error ? markAllError.message : "Tömeges olvasottsági mentési hiba.");
    }
  }

  return (
    <div className="min-h-screen bg-transparent p-5 text-slate-900">
      <section className="border border-slate-200 bg-white/86 p-5 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[10px] font-black uppercase tracking-[0.18em] text-cyan-800">
              <Bell size={13} /> Webes DIMPROVER / Projektkapu
            </div>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">Értesítési Központ</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Szerverközpontú értesítési felület közös web–desktop olvasottsági állapottal. A webes felület a hivatalos elsődleges nézet, a Drive Desktop ugyanazon API-n keresztül kapcsolódik.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
            <div className="border border-slate-200 bg-white p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-slate-400">Összes találat</div>
              <div className="mt-1 text-2xl font-black text-slate-950">{total}</div>
            </div>
            <div className="border border-red-200 bg-red-50 p-4">
              <div className="text-[10px] font-black uppercase tracking-[0.14em] text-red-500">Olvasatlan</div>
              <div className="mt-1 text-2xl font-black text-red-700">{unreadCount}</div>
            </div>
            <button type="button" onClick={refresh} className="flex items-center justify-center gap-2 border border-cyan-200 bg-cyan-50 p-4 text-xs font-black uppercase tracking-[0.1em] text-cyan-800 hover:bg-cyan-100">
              <RefreshCcw size={15} /> Frissítés
            </button>
          </div>
        </div>
      </section>

      <section className="mt-5 border border-slate-200 bg-white/86 p-4 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <div className="flex flex-wrap gap-2">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`border px-3 py-2 text-xs font-black uppercase tracking-[0.09em] transition ${
                  activeTab === tab.key
                    ? "border-slate-950 bg-slate-950 text-white"
                    : "border-slate-200 bg-white text-slate-600 hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-800"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <label className="flex items-center gap-2 border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">
              <Filter size={14} />
              <input
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                placeholder="Projekt ID szűrés, pl. DIMPRO_DEMO"
                className="w-64 bg-transparent text-xs font-bold text-slate-700 outline-none placeholder:text-slate-400"
              />
            </label>
            <button type="button" onClick={handleMarkAllRead} className="inline-flex items-center justify-center gap-2 border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-black uppercase tracking-[0.08em] text-emerald-800 hover:bg-emerald-100">
              <CheckCheck size={14} /> Összes olvasott
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <div className="mt-5 border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          {error}
        </div>
      ) : null}

      <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_390px]">
        <NotificationList
          notifications={notifications}
          selectedId={selectedNotification?.id || null}
          loading={loading}
          onSelect={(notification) => setSelectedId(notification.id)}
          onMarkRead={handleMarkRead}
          onArchive={handleArchive}
        />
        <NotificationDetailPanel
          notification={selectedNotification}
          onMarkRead={handleMarkRead}
          onArchive={handleArchive}
          onClose={() => setSelectedId(null)}
        />
      </section>
    </div>
  );
}
