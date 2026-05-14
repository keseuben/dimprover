import { ScheduleTask } from "../types/schedule"

export const mockTasks: ScheduleTask[] = [
  {
    id: "1",
    name: "Földmunka",
    startWeek: 0,
    duration: 3,
    color: "#3b82f6",
    progress: 40,
    contractStartWeek: 0,
    contractDuration: 3,
  },
  {
    id: "2",
    name: "Alapozás",
    startWeek: 2,
    duration: 4,
    color: "#10b981",
    progress: 20,
    contractStartWeek: 1,
    contractDuration: 4,
  },
  {
    id: "3",
    name: "Szerkezetépítés",
    startWeek: 5,
    duration: 6,
    color: "#f59e0b",
    progress: 10,
    contractStartWeek: 4,
    contractDuration: 5,
  },
]