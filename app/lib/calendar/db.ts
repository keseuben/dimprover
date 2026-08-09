import type { SupabaseClient } from "@supabase/supabase-js";
import type { CalendarEvent, CalendarEventInput } from "./types";

type CalendarEventRow = {
  id: string;
  title: string;
  start_at: string;
  end_at: string;
  class_name: CalendarEvent["className"];
  meeting_type: string;
  person: string;
  location: string;
  description: string;
  status: string;
  recurrence: CalendarEvent["recurrence"];
  external_provider: CalendarEvent["externalProvider"];
  external_event_id: string | null;
  sync_status: CalendarEvent["syncStatus"];
  last_synced_at: string | null;
};

export function calendarRowToEvent(row: CalendarEventRow): CalendarEvent {
  return {
    id: row.id,
    title: row.title,
    start: row.start_at.slice(0, 16),
    end: row.end_at.slice(0, 16),
    className: row.class_name,
    meetingType: row.meeting_type,
    person: row.person,
    location: row.location,
    description: row.description,
    status: row.status,
    recurrence: row.recurrence,
    externalProvider: row.external_provider ?? "none",
    externalEventId: row.external_event_id ?? "",
    syncStatus: row.sync_status ?? "none",
    lastSyncedAt: row.last_synced_at,
  };
}

export function calendarInputToRow(input: CalendarEventInput) {
  return {
    title: input.title,
    start_at: input.start,
    end_at: input.end,
    class_name: input.className,
    meeting_type: input.meetingType,
    person: input.person,
    location: input.location,
    description: input.description,
    status: input.status,
    recurrence: input.recurrence,
    external_provider: input.externalProvider,
    external_event_id: input.externalEventId || null,
    sync_status: input.syncStatus,
    last_synced_at: input.lastSyncedAt,
  };
}

export async function listCalendarEvents(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("calendar_events")
    .select(
      "id,title,start_at,end_at,class_name,meeting_type,person,location,description,status,recurrence,external_provider,external_event_id,sync_status,last_synced_at",
    )
    .order("start_at", { ascending: true });

  if (error) throw error;
  return (data ?? []).map((row) => calendarRowToEvent(row as CalendarEventRow));
}

export async function createCalendarEvent(
  supabase: SupabaseClient,
  input: CalendarEventInput,
) {
  const { data, error } = await supabase
    .from("calendar_events")
    .insert(calendarInputToRow(input))
    .select(
      "id,title,start_at,end_at,class_name,meeting_type,person,location,description,status,recurrence,external_provider,external_event_id,sync_status,last_synced_at",
    )
    .single();

  if (error) throw error;
  return calendarRowToEvent(data as CalendarEventRow);
}

export async function updateCalendarEvent(
  supabase: SupabaseClient,
  id: string,
  input: CalendarEventInput,
) {
  const { data, error } = await supabase
    .from("calendar_events")
    .update(calendarInputToRow(input))
    .eq("id", id)
    .select(
      "id,title,start_at,end_at,class_name,meeting_type,person,location,description,status,recurrence,external_provider,external_event_id,sync_status,last_synced_at",
    )
    .single();

  if (error) throw error;
  return calendarRowToEvent(data as CalendarEventRow);
}

export async function deleteCalendarEvent(
  supabase: SupabaseClient,
  id: string,
) {
  const { error } = await supabase
    .from("calendar_events")
    .delete()
    .eq("id", id);
  if (error) throw error;
}
