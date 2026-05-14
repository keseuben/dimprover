"use client"

import TaskRow from "./TaskRow"
import { ScheduleTask } from "./types/schedule"

interface Props {
  tasks: ScheduleTask[]
}

export default function TimelineBody({ tasks }: Props) {
  return (
    <div>
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
        />
      ))}
    </div>
  )
}