"use client";

import AppLayout from "@/components/layout/AppLayout";
import NotificationsCenterClient from "@/components/notifications/NotificationsCenterClient";

export default function NotificationsPage() {
  return (
    <AppLayout>
      <NotificationsCenterClient />
    </AppLayout>
  );
}
