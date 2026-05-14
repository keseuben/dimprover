export interface ScheduleTask {
  id: string
  name: string
  startWeek: number
  duration: number
  color: string

  progress?: number

  contractStartWeek?: number
  contractDuration?: number
}