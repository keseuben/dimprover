"use client"

import { ScheduleTask } from "./types/schedule"
import DraggableTask from "./DraggableTask"

interface Props {
  task: ScheduleTask
}

export default function TaskRow({ task }: Props) {
  return (
    <div className="relative flex border-b border-slate-800">

      {/* LEFT PANEL */}
      <div className="sticky left-0 z-10 flex h-16 w-[280px] min-w-[280px] items-center border-r border-slate-800 bg-slate-950 px-4 text-sm text-white">
        {task.name}
      </div>

      {/* TIMELINE */}
      <div className="relative h-16 flex-1 min-w-[1024px]">
        <DraggableTask task={task} />
      </div>
    </div>
  )
}