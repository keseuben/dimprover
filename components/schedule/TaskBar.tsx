"use client";

import React, { memo, useRef } from "react";
import { GripVertical, MoveHorizontal } from "lucide-react";
import { ScheduleFeatureState, ScheduleTask, ScheduleBarInteractionMode } from "@/app/lib/schedule/types";
import { getXFromDate, getWidthFromDates } from "@/app/lib/schedule/timelineEngine";

type TaskBarProps = {
  task: ScheduleTask;
  color: string;
  lightColor: string;
  weekWidth: number;
  timelineStartDate: Date;
  features: ScheduleFeatureState;
  onClick: () => void;
  onTaskBarChange: (
    taskId: number,
    mode: ScheduleBarInteractionMode,
    originalStartDate: string,
    originalEndDate: string,
    deltaDays: number
  ) => void;
  onInteractionStart: (mode: ScheduleBarInteractionMode) => void;
  onInteractionEnd: () => void;
};

const DRAG_START_THRESHOLD_PX = 8;
const LONG_PRESS_MOVE_MS = 320;

function formatLocalIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function TaskBar({ task, color, lightColor, weekWidth, timelineStartDate, features, onClick, onTaskBarChange, onInteractionStart, onInteractionEnd }: TaskBarProps) {
  const dayWidth = weekWidth / 7;
  const timelineStartIso = formatLocalIsoDate(timelineStartDate);
  const clickSuppressedRef = useRef(false);
  const activeInteractionRef = useRef(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const longPressTimerRef = useRef<number | null>(null);

  const scale = dayWidth / 28;
  const rawContractLeft = getXFromDate(task.contractStartDate || task.startDate, timelineStartIso) * scale;
  const rawContractWidth = getWidthFromDates(task.contractStartDate || task.startDate, task.contractEndDate || task.endDate) * scale;
  const rawActualLeft = getXFromDate(task.actualStartDate || task.startDate, timelineStartIso) * scale;
  const rawActualWidth = getWidthFromDates(task.actualStartDate || task.startDate, task.actualEndDate || task.endDate) * scale;
  const contractClipOffset = Math.max(0, -rawContractLeft);
  const actualClipOffset = Math.max(0, -rawActualLeft);
  const contractLeft = Math.max(0, rawContractLeft);
  const actualLeft = Math.max(0, rawActualLeft);
  const contractWidth = Math.max(0, rawContractWidth - contractClipOffset);
  const actualWidth = Math.max(0, rawActualWidth - actualClipOffset);
  const canRenderContractBar = contractWidth > 0;
  const canRenderActualBar = actualWidth > 0;

  const startInteraction = (event: React.PointerEvent<HTMLDivElement>, mode: ScheduleBarInteractionMode) => {
    if (event.button !== 0 || activeInteractionRef.current) return;
    event.preventDefault();
    event.stopPropagation();

    const pointerId = event.pointerId;
    const startClientX = event.clientX;
    const originalStartDate = task.actualStartDate || task.startDate;
    const originalEndDate = task.actualEndDate || task.endDate;
    const dayPixelWidth = Math.max(1, dayWidth);
    let dragStarted = false;
    let finalDeltaDays = 0;

    const beginDragIfNeeded = (deltaX: number) => {
      if (dragStarted) return true;
      if (Math.abs(deltaX) < DRAG_START_THRESHOLD_PX) return false;

      dragStarted = true;
      activeInteractionRef.current = true;
      clickSuppressedRef.current = true;
      onInteractionStart(mode);

      const cursor = mode === "move" ? "grabbing" : "ew-resize";
      document.body.style.cursor = cursor;
      document.documentElement.style.cursor = cursor;
      document.body.style.userSelect = "none";
      return true;
    };

    const applyPreview = (rawDeltaDays: number) => {
      const previewDeltaPx = rawDeltaDays * dayPixelWidth;
      const bar = barRef.current;
      if (!bar) return;

      if (mode === "move") {
        bar.style.transform = `translateX(${previewDeltaPx}px)`;
        return;
      }

      if (mode === "resize-start") {
        const nextWidth = Math.max(28, actualWidth - previewDeltaPx);
        const limitedDeltaPx = actualWidth - nextWidth;
        bar.style.transform = `translateX(${limitedDeltaPx}px)`;
        bar.style.width = `${nextWidth}px`;
        return;
      }

      bar.style.width = `${Math.max(28, actualWidth + previewDeltaPx)}px`;
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startClientX;
      if (!beginDragIfNeeded(deltaX)) return;

      moveEvent.preventDefault();
      moveEvent.stopPropagation();

      const rawDeltaDays = deltaX / dayPixelWidth;
      finalDeltaDays = rawDeltaDays > 0 ? Math.floor(rawDeltaDays) : Math.ceil(rawDeltaDays);
      applyPreview(rawDeltaDays);
    };

    const finish = (upEvent?: PointerEvent) => {
      if (upEvent && upEvent.pointerId !== pointerId) return;
      if (dragStarted) {
        upEvent?.preventDefault();
        upEvent?.stopPropagation();
      }

      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", finishOnBlur, true);

      if (barRef.current) {
        barRef.current.style.transform = "";
        barRef.current.style.width = "";
      }
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
      document.body.style.userSelect = "";

      if (dragStarted && finalDeltaDays !== 0) {
        onTaskBarChange(task.id, mode, originalStartDate, originalEndDate, finalDeltaDays);
      }
      if (dragStarted) onInteractionEnd();
      activeInteractionRef.current = false;
      window.setTimeout(() => { clickSuppressedRef.current = false; }, dragStarted ? 220 : 0);
    };

    const finishOnBlur = () => finish();
    window.addEventListener("pointermove", handleMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, { capture: true, passive: false });
    window.addEventListener("pointercancel", finish, { capture: true, passive: false });
    window.addEventListener("blur", finishOnBlur, { capture: true, once: true });
  };

  const handleBarPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    event.stopPropagation();

    const pointerId = event.pointerId;
    const startClientX = event.clientX;
    const startClientY = event.clientY;
    const originalStartDate = task.actualStartDate || task.startDate;
    const originalEndDate = task.actualEndDate || task.endDate;
    const dayPixelWidth = Math.max(1, dayWidth);
    let longPressActive = false;
    let finalDeltaDays = 0;

    if (longPressTimerRef.current !== null) window.clearTimeout(longPressTimerRef.current);
    longPressTimerRef.current = window.setTimeout(() => {
      longPressActive = true;
      activeInteractionRef.current = true;
      clickSuppressedRef.current = true;
      onInteractionStart("move");
      document.body.style.cursor = "grabbing";
      document.documentElement.style.cursor = "grabbing";
      document.body.style.userSelect = "none";
    }, LONG_PRESS_MOVE_MS);

    const clearLongPressTimer = () => {
      if (longPressTimerRef.current !== null) {
        window.clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      const deltaX = moveEvent.clientX - startClientX;
      const deltaY = moveEvent.clientY - startClientY;

      if (!longPressActive && Math.abs(deltaX) + Math.abs(deltaY) > 6) {
        clearLongPressTimer();
        return;
      }
      if (!longPressActive) return;

      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      const rawDeltaDays = deltaX / dayPixelWidth;
      finalDeltaDays = rawDeltaDays > 0 ? Math.floor(rawDeltaDays) : Math.ceil(rawDeltaDays);
      const bar = barRef.current;
      if (bar) bar.style.transform = `translateX(${rawDeltaDays * dayPixelWidth}px)`;
    };

    const finish = (upEvent?: PointerEvent) => {
      if (upEvent && upEvent.pointerId !== pointerId) return;
      clearLongPressTimer();
      window.removeEventListener("pointermove", handleMove, true);
      window.removeEventListener("pointerup", finish, true);
      window.removeEventListener("pointercancel", finish, true);
      window.removeEventListener("blur", finishOnBlur, true);
      if (barRef.current) barRef.current.style.transform = "";
      document.body.style.cursor = "";
      document.documentElement.style.cursor = "";
      document.body.style.userSelect = "";

      if (longPressActive) {
        upEvent?.preventDefault();
        upEvent?.stopPropagation();
        if (finalDeltaDays !== 0) onTaskBarChange(task.id, "move", originalStartDate, originalEndDate, finalDeltaDays);
        onInteractionEnd();
        window.setTimeout(() => { clickSuppressedRef.current = false; activeInteractionRef.current = false; }, 220);
      } else {
        activeInteractionRef.current = false;
      }
    };

    const finishOnBlur = () => finish();
    window.addEventListener("pointermove", handleMove, { capture: true, passive: false });
    window.addEventListener("pointerup", finish, { capture: true, passive: false });
    window.addEventListener("pointercancel", finish, { capture: true, passive: false });
    window.addEventListener("blur", finishOnBlur, { capture: true, once: true });
  };

  const handleBarClick = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (clickSuppressedRef.current || activeInteractionRef.current) return;
    if (document.body.dataset.ganttPanning === "true" || document.body.dataset.ganttJustPanned === "true") return;
    onClick();
  };

  const progress = Math.max(0, Math.min(100, task.progress ?? 0));

  return (
    <div className="absolute left-0 top-1/2 z-[120] h-8 w-full -translate-y-1/2 pointer-events-none">
      {features.showContractBars && canRenderContractBar && (
        <div className={`pointer-events-none absolute top-2 z-[1] h-4 rounded-none ${lightColor} opacity-35`} style={{ left: `${contractLeft}px`, width: `${contractWidth}px` }} />
      )}

      {features.showActualBars && canRenderActualBar && (
        <div
          data-task-id={task.id}
          data-gantt-task-bar="true"
          ref={barRef}
          onPointerDown={handleBarPointerDown}
          onClick={handleBarClick}
          onDoubleClick={(event) => { event.preventDefault(); event.stopPropagation(); onClick(); }}
          className="group/bar absolute z-[160] flex h-8 touch-none cursor-pointer isolate select-none items-center rounded-none bg-transparent pointer-events-auto hover:z-[190] hover:drop-shadow-lg"
          style={{ left: `${actualLeft}px`, width: `${actualWidth}px`, minWidth: "28px" }}
          title="Kattintás: szerkesztő nyitása. Hosszú nyomás: feladatsáv mozgatása. Fogantyúk: azonnali mozgatás / dátum módosítás."
        >
          <div className={`absolute left-0 top-1 flex h-6 w-full items-center overflow-hidden rounded-none ${color} px-2 shadow-sm`}>
            {features.showProgressOverlay && <div className="absolute bottom-0 left-0 top-0 z-[1] bg-emerald-300/45" style={{ width: `${progress}%` }} />}
            <GripVertical className="relative z-10 mr-1 shrink-0 text-white/65" size={10} />
            <span className="relative z-10 min-w-0 flex-1 truncate text-[10px] font-normal text-white">{task.name}</span>
          </div>

          {features.showProgressOverlay && typeof task.progress === "number" && actualWidth >= 54 && (
            <div className="pointer-events-none absolute right-1 top-1 z-[6] flex h-6 items-center rounded-none bg-transparent px-1 text-[9px] font-bold text-white drop-shadow">
              {Math.round(progress)}%
            </div>
          )}

          <div
            data-gantt-drag-handle="true"
            onPointerDown={(event) => startInteraction(event, "move")}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
            className="absolute left-1 top-1 z-[220] flex h-6 w-5 cursor-grab items-center justify-center rounded-none bg-white/10 text-white/85 hover:bg-white/30 active:cursor-grabbing"
            title="Feladatsáv mozgatása húzással"
          >
            <MoveHorizontal size={12} />
          </div>

          <div
            data-gantt-resize-handle="start"
            onPointerDown={(event) => startInteraction(event, "resize-start")}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
            className="absolute -left-1 top-1 z-[230] h-6 w-2 cursor-ew-resize rounded-none border-l-2 border-white/90 bg-transparent hover:bg-white/40"
            title="Kezdő dátum módosítása húzással"
          />
          <div
            data-gantt-resize-handle="end"
            onPointerDown={(event) => startInteraction(event, "resize-end")}
            onClick={(event) => { event.preventDefault(); event.stopPropagation(); }}
            className="absolute -right-1 top-1 z-[230] h-6 w-2 cursor-ew-resize rounded-none border-r-2 border-white/90 bg-transparent hover:bg-white/40"
            title="Záró dátum módosítása húzással"
          />
        </div>
      )}
    </div>
  );
}

export default memo(TaskBar);