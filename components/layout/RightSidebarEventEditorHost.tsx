"use client";

import { useState } from "react";
import { EventEditorModal, type CalendarFormState } from "@/components/calendar/EventEditorModal";

export type RightSidebarCalendarEvent = {
  id: string;
  title: string;
  start: string;
  end: string;
  className?: CalendarFormState["className"];
  meetingType?: string;
  person?: string;
  location?: string;
  description?: string;
  status?: string;
  recurrence?: CalendarFormState["recurrence"];
  externalProvider?: CalendarFormState["externalProvider"];
  externalEventId?: string;
  syncStatus?: CalendarFormState["syncStatus"];
  lastSyncedAt?: string | null;
};

export function rightSidebarEventToForm(event: RightSidebarCalendarEvent): CalendarFormState {
  return {
    title: event.title,
    start: event.start,
    end: event.end,
    className: event.className ?? "dimpro-event-blue",
    meetingType: event.meetingType ?? "",
    person: event.person ?? "",
    location: event.location ?? "",
    description: event.description ?? "",
    status: event.status ?? "Tervezett",
    recurrence: event.recurrence ?? "none",
    externalProvider: event.externalProvider ?? "none",
    externalEventId: event.externalEventId ?? "",
    syncStatus: event.syncStatus ?? "none",
    lastSyncedAt: event.lastSyncedAt ?? null,
  };
}

function RightSidebarEventEditorInner({
  event,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: RightSidebarCalendarEvent;
  onClose: () => void;
  onSaved: (event: RightSidebarCalendarEvent) => void;
  onDeleted: (eventId: string) => void;
}) {
  const [form, setForm] = useState<CalendarFormState>(() => rightSidebarEventToForm(event));
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(nextForm: CalendarFormState) {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/calendar/events", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...nextForm, id: event.id }),
      });
      const data = (await response.json()) as {
        ok?: boolean;
        event?: RightSidebarCalendarEvent;
        error?: string;
      };
      if (!response.ok || !data.ok || !data.event) {
        throw new Error(data.error || "Az esemény mentése sikertelen.");
      }
      onSaved(data.event);
      onClose();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Az esemény mentése sikertelen.");
    } finally {
      setIsSaving(false);
    }
  }

  async function remove() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/calendar/events?id=${encodeURIComponent(event.id)}`, {
        method: "DELETE",
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) {
        throw new Error(data.error || "Az esemény törlése sikertelen.");
      }
      onDeleted(event.id);
      onClose();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Az esemény törlése sikertelen.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      {error && (
        <div className="fixed bottom-4 left-1/2 z-[12000] -translate-x-1/2 border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800 shadow-lg">
          {error}
        </div>
      )}
      <EventEditorModal
        modal={{ mode: "edit", eventId: event.id, form }}
        onClose={onClose}
        onSave={save}
        onDelete={remove}
        onChange={setForm}
        isSaving={isSaving}
      />
    </>
  );
}

export function RightSidebarEventEditorHost({
  event,
  onClose,
  onSaved,
  onDeleted,
}: {
  event: RightSidebarCalendarEvent | null;
  onClose: () => void;
  onSaved: (event: RightSidebarCalendarEvent) => void;
  onDeleted: (eventId: string) => void;
}) {
  if (!event) return null;

  return (
    <RightSidebarEventEditorInner
      key={event.id}
      event={event}
      onClose={onClose}
      onSaved={onSaved}
      onDeleted={onDeleted}
    />
  );
}
