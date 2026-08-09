export type NotificationType =
  | "FILE_UPLOADED"
  | "FILE_UPDATED"
  | "PROJECT_INVITE"
  | "PROJECT_INVITE_ACCEPTED"
  | "MINUTES_CREATED"
  | "DEADLINE_SOON"
  | "DOKUBOX_DROP_UPLOAD"
  | "DRIVE_SYNC_ERROR"
  | "SYSTEM_INFO";

export type NotificationPriority = "low" | "normal" | "high" | "urgent";

export type NotificationSource =
  | "web"
  | "desktop"
  | "drive"
  | "server"
  | "mappaor"
  | "dokubox"
  | "minutes"
  | "schedule"
  | "system";

export type Notification = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  projectId?: string;
  projectName?: string;
  relatedFileId?: string;
  relatedFileName?: string;
  relatedMinuteId?: string;
  relatedDeadlineId?: string;
  createdByUserId?: string;
  createdByName?: string;
  source: NotificationSource;
  sourceClient?: string;
  priority: NotificationPriority;
  actionUrl?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type NotificationRecipient = {
  id: string;
  notificationId: string;
  userId: string;
  deliveredAt: string;
  readAt: string | null;
  archivedAt: string | null;
  emailSentAt?: string | null;
  desktopShownAt?: string | null;
  webShownAt?: string | null;
};

export type NotificationWithRecipient = Notification & {
  recipient: NotificationRecipient;
  isUnread: boolean;
};

export type ActivityLog = {
  id: string;
  projectId?: string;
  userId?: string;
  actionType: NotificationType | string;
  entityType?: "project" | "file" | "minute" | "deadline" | "notification" | "system";
  entityId?: string;
  message: string;
  sourceClient?: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
};

export type NotificationListQuery = {
  projectId?: string;
  type?: NotificationType | "ALL";
  unreadOnly?: boolean;
  page?: number;
  pageSize?: number;
  includeArchived?: boolean;
};

export type NotificationListResponse = {
  ok: boolean;
  notifications: NotificationWithRecipient[];
  total: number;
  page: number;
  pageSize: number;
  unreadCount: number;
  storage: "file" | "database";
};

export type NotificationDetailResponse = {
  ok: boolean;
  notification: NotificationWithRecipient;
  storage: "file" | "database";
};

export type NotificationUnreadCountResponse = {
  ok: boolean;
  unreadCount: number;
  storage: "file" | "database";
};
