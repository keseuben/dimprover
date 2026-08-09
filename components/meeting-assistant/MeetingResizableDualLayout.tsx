"use client";

import { GripVertical, PanelRightClose, PanelRightOpen, RotateCcw } from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const WIDTH_KEY = "dimpro:meeting-assistant:participant-width";
const COLLAPSED_KEY = "dimpro:meeting-assistant:participant-collapsed";
const DEFAULT_PARTICIPANT_PERCENT = 34;
const MIN_PARTICIPANT_PX = 360;
const MIN_ORGANIZER_PX = 560;

type DividerStyle = CSSProperties & {
  "--meeting-organizer-width"?: string;
  "--meeting-participant-width"?: string;
};

export default function MeetingResizableDualLayout({ organizer, participant }: { organizer: ReactNode; participant: ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [participantPercent, setParticipantPercent] = useState(DEFAULT_PARTICIPANT_PERCENT);
  const [dragging, setDragging] = useState(false);
  const [participantCollapsed, setParticipantCollapsed] = useState(false);

  useEffect(() => {
    const saved = Number(window.localStorage.getItem(WIDTH_KEY));
    if (Number.isFinite(saved) && saved >= 20 && saved <= 55) setParticipantPercent(saved);
    setParticipantCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  useEffect(() => {
    window.localStorage.setItem(WIDTH_KEY, String(participantPercent));
  }, [participantPercent]);

  useEffect(() => {
    window.localStorage.setItem(COLLAPSED_KEY, participantCollapsed ? "1" : "0");
  }, [participantCollapsed]);

  useEffect(() => {
    if (!dragging) return;

    function updateWidth(clientX: number) {
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0) return;
      const minParticipantPercent = Math.max(20, (MIN_PARTICIPANT_PX / rect.width) * 100);
      const maxParticipantPercent = Math.min(55, 100 - (MIN_ORGANIZER_PX / rect.width) * 100);
      const raw = ((rect.right - clientX) / rect.width) * 100;
      const next = Math.max(minParticipantPercent, Math.min(maxParticipantPercent, raw));
      setParticipantPercent(Math.round(next * 10) / 10);
      setParticipantCollapsed(false);
    }

    function handlePointerMove(event: PointerEvent) {
      updateWidth(event.clientX);
    }

    function handlePointerUp() {
      setDragging(false);
    }

    const previousCursor = document.body.style.cursor;
    const previousSelection = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp, { once: true });
    window.addEventListener("pointercancel", handlePointerUp, { once: true });
    return () => {
      document.body.style.cursor = previousCursor;
      document.body.style.userSelect = previousSelection;
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
      window.removeEventListener("pointercancel", handlePointerUp);
    };
  }, [dragging]);

  function resetWidth() {
    setParticipantPercent(DEFAULT_PARTICIPANT_PERCENT);
    setParticipantCollapsed(false);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setParticipantCollapsed(false);
      setParticipantPercent((value) => Math.min(55, value + 2));
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setParticipantCollapsed(false);
      setParticipantPercent((value) => Math.max(20, value - 2));
    }
    if (event.key === "Home") {
      event.preventDefault();
      resetWidth();
    }
  }

  const style: DividerStyle = {
    "--meeting-organizer-width": `calc(${100 - participantPercent}% - 6px)`,
    "--meeting-participant-width": `calc(${participantPercent}% - 6px)`,
  };

  return (
    <div
      ref={containerRef}
      data-participant-collapsed={participantCollapsed ? "true" : "false"}
      className="meeting-dual-resizable-grid grid min-h-[820px] grid-cols-1 divide-y divide-slate-200 xl:divide-y-0"
      style={style}
    >
      <div className="min-w-0 overflow-hidden">{organizer}</div>

      <div
        role="separator"
        aria-label="Szervezői és résztvevői munkatér szélességének módosítása"
        aria-orientation="vertical"
        aria-valuemin={20}
        aria-valuemax={55}
        aria-valuenow={Math.round(participantPercent)}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.preventDefault();
          setDragging(true);
        }}
        onDoubleClick={resetWidth}
        onKeyDown={handleKeyDown}
        title="Húzd jobbra-balra. Dupla kattintás: alapértelmezett arány."
        className={`meeting-dual-divider relative hidden cursor-col-resize touch-none items-center justify-center border-x border-slate-300 bg-slate-100 outline-none transition xl:flex ${dragging ? "bg-teal-100" : "hover:bg-teal-50 focus:bg-teal-50"}`}
      >
        <div className="flex flex-col items-center gap-1 rounded-full border border-slate-300 bg-white px-1 py-2 shadow-sm">
          <GripVertical size={14} className="text-slate-500" />
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              setParticipantCollapsed((value) => !value);
            }}
            title={participantCollapsed ? "Résztvevői nézet megnyitása" : "Résztvevői nézet összecsukása"}
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
          >
            {participantCollapsed ? <PanelRightOpen size={12} /> : <PanelRightClose size={12} />}
          </button>
          <button
            type="button"
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              resetWidth();
            }}
            title="Alapértelmezett 66/34 arány visszaállítása"
            className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-teal-700"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      </div>

      <div className="meeting-participant-pane min-w-0 overflow-hidden">{participant}</div>
    </div>
  );
}
