"use client"

import { ScheduleTask } from "./types/schedule"
import {
  getTaskLeft,
  getTaskWidth,
} from "./utils/timelineUtils"

interface Props {
  task: ScheduleTask
}

export default function DraggableTask({ task }: Props) {
  return (
    <>
      {/* CONTRACT BAR */}
      {task.contractDuration && (
        <div
          className="absolute top-3 h-10 rounded-md opacity-30"
          style={{
            left: getTaskLeft(task.contractStartWeek || 0),
            width: getTaskWidth(task.contractDuration),
            background: task.color,
          }}
        />
      )}

      {/* ACTIVE BAR */}
      <div
        className="absolute top-4 flex h-8 items-center rounded-md px-3 text-sm font-medium text-white shadow-lg"
        style={{
          left: getTaskLeft(task.startWeek),
          width: getTaskWidth(task.duration),
          background: task.color,
        }}
      >
        <div
          className="absolute left-0 top-0 h-full rounded-md bg-black/20"
          style={{
            width: `${task.progress || 0}%`,
          }}
        />

        <span className="relative z-10 truncate">
          {task.name}
        </span>
      </div>
    </>
  )
}