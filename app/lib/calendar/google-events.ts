import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CalendarEvent } from "@/app/lib/calendar/types";
import {
  decryptCalendarSecret,
  encryptCalendarSecret,
  refreshStoredGoogleAccessToken,
} from "@/app/lib/calendar/oauth-config";

const GOOGLE_SYSTEM_ACCOUNT = "__dimprover_google_oauth_config__";
const DEFAULT_CALENDAR_TIME_ZONE = "Europe/Budapest";

type SecretBox = {
  algorithm: "aes-256-gcm";
  iv: string;
  authTag: string;
  value: string;
};

type GoogleTokenPayload = {
  accessToken?: SecretBox | string;
  refreshToken?: SecretBox | string;
  tokenType?: string;
  scope?: string;
  updatedAt?: string;
};

type GoogleIntegrationRow = {
  id: string;
  account_email: string;
  display_name: string;
  credential_expires_at: string | null;
  encrypted_payload: GoogleTokenPayload | null;
};

type GoogleCalendarEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

type GoogleCalendarEventItem = {
  id?: string;
  summary?: string;
  description?: string;
  location?: string;
  status?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
  htmlLink?: string;
};

type GoogleCalendarEventsResponse = {
  items?: GoogleCalendarEventItem[];
  error?: {
    code?: number;
    message?: string;
  };
};

function toTimeZoneInputValue(value: string, timeZone = DEFAULT_CALENDAR_TIME_ZONE) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 16);

  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

function mapGoogleEvent(item: GoogleCalendarEventItem, accountEmail: string): CalendarEvent | null {
  const eventId = item.id;
  const startValue = item.start?.dateTime || item.start?.date;
  const endValue = item.end?.dateTime || item.end?.date || startValue;

  if (!eventId || !startValue || !endValue) return null;

  const startTimeZone = item.start?.timeZone || DEFAULT_CALENDAR_TIME_ZONE;
  const endTimeZone = item.end?.timeZone || startTimeZone;
  const start = item.start?.date
    ? `${item.start.date}T00:00`
    : toTimeZoneInputValue(startValue, startTimeZone);
  const end = item.end?.date
    ? `${item.end.date}T00:00`
    : toTimeZoneInputValue(endValue, endTimeZone);

  return {
    id: `google-${eventId}`,
    title: item.summary || "Google naptár esemény",
    start,
    end,
    className: "dimpro-event-green",
    meetingType: "Google Naptár",
    person: accountEmail,
    location: item.location || "",
    description: item.description || item.htmlLink || "Google Calendar esemény",
    status: item.status === "cancelled" ? "Törölt" : "Szinkronizált",
    recurrence: "none",
    externalProvider: "google",
    externalEventId: eventId,
    syncStatus: "synced",
    lastSyncedAt: new Date().toISOString(),
  };
}

async function refreshIntegrationToken(
  supabase: SupabaseClient,
  integration: GoogleIntegrationRow,
  refreshToken: string,
) {
  const refreshed = await refreshStoredGoogleAccessToken(refreshToken);

  if (!refreshed.access_token) {
    throw new Error("A Google nem adott vissza frissített access tokent.");
  }

  const nextPayload: GoogleTokenPayload = {
    ...(integration.encrypted_payload ?? {}),
    accessToken: encryptCalendarSecret(refreshed.access_token),
    tokenType: refreshed.token_type ?? "Bearer",
    scope: refreshed.scope ?? integration.encrypted_payload?.scope,
    updatedAt: new Date().toISOString(),
  };
  const credentialExpiresAt = refreshed.expires_in
    ? new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
    : null;

  await supabase
    .from("calendar_integrations")
    .update({
      encrypted_payload: nextPayload,
      credential_expires_at: credentialExpiresAt,
      last_sync_status: "success",
      last_sync_error: null,
      last_sync_started_at: new Date().toISOString(),
      last_sync_finished_at: new Date().toISOString(),
    })
    .eq("id", integration.id);

  return refreshed.access_token;
}

async function getAccessToken(supabase: SupabaseClient, integration: GoogleIntegrationRow) {
  const payload = integration.encrypted_payload;
  const accessToken = decryptCalendarSecret(payload?.accessToken);
  const refreshToken = decryptCalendarSecret(payload?.refreshToken);
  const expiresAt = integration.credential_expires_at
    ? new Date(integration.credential_expires_at).getTime()
    : 0;
  const isExpired = !expiresAt || expiresAt < Date.now() + 60_000;

  if (accessToken && !isExpired) return accessToken;
  if (!refreshToken) return accessToken;

  return refreshIntegrationToken(supabase, integration, refreshToken);
}

async function fetchGoogleEvents(accessToken: string, accountEmail: string) {
  const timeMin = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const timeMax = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");

  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("timeZone", DEFAULT_CALENDAR_TIME_ZONE);
  url.searchParams.set("maxResults", "250");

  const response = await fetch(url, {
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
  const payload = (await response.json()) as GoogleCalendarEventsResponse;

  if (!response.ok) {
    throw new Error(payload.error?.message || "Google Calendar események lekérése sikertelen.");
  }

  return (payload.items ?? [])
    .map((item) => mapGoogleEvent(item, accountEmail))
    .filter((event): event is CalendarEvent => Boolean(event));
}

export async function listGoogleCalendarEvents(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("calendar_integrations")
    .select("id,account_email,display_name,credential_expires_at,encrypted_payload")
    .eq("provider", "google")
    .eq("sync_enabled", true)
    .neq("account_email", GOOGLE_SYSTEM_ACCOUNT);

  if (error) throw error;

  const events: CalendarEvent[] = [];
  const errors: string[] = [];

  for (const integration of (data ?? []) as GoogleIntegrationRow[]) {
    try {
      const accessToken = await getAccessToken(supabase, integration);
      if (!accessToken) continue;
      const googleEvents = await fetchGoogleEvents(accessToken, integration.account_email);
      events.push(...googleEvents);
    } catch (error) {
      errors.push(
        `${integration.account_email}: ${
          error instanceof Error ? error.message : "ismeretlen Google naptár hiba"
        }`,
      );
      await supabase
        .from("calendar_integrations")
        .update({
          last_sync_status: "failed",
          last_sync_error:
            error instanceof Error ? error.message : "ismeretlen Google naptár hiba",
          last_sync_finished_at: new Date().toISOString(),
        })
        .eq("id", integration.id);
    }
  }

  return { events, errors };
}
