export const DAY_WIDTH = 28
export const WEEK_WIDTH = DAY_WIDTH * 7

export type TimelineScale = "day" | "week" | "month"

export type TimelineEngineConfig = {
  timelineStartDate: string
  timelineEndDate: string
  scale: TimelineScale
}

export type TimelineDay = {
  date: string
  dayLabel: string
  monthLabel: string
  weekNumber: number
  isWeekend: boolean
}

export function toDate(dateString: string): Date {
  const [year, month, day] = dateString.split("-").map(Number)
  const date = Number.isFinite(year) && Number.isFinite(month) && Number.isFinite(day)
    ? new Date(year, month - 1, day)
    : new Date(dateString)
  date.setHours(0, 0, 0, 0)
  return date
}

export function toIsoDate(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

export function differenceInDays(startDate: string, endDate: string): number {
  const start = toDate(startDate)
  const end = toDate(endDate)

  const diff = end.getTime() - start.getTime()

  return Math.round(diff / (1000 * 60 * 60 * 24))
}

export function getWeekNumber(date: Date): number {
  const target = new Date(date.valueOf())
  const dayNumber = (date.getDay() + 6) % 7

  target.setDate(target.getDate() - dayNumber + 3)

  const firstThursday = new Date(target.getFullYear(), 0, 4)
  const firstThursdayDayNumber = (firstThursday.getDay() + 6) % 7

  firstThursday.setDate(firstThursday.getDate() - firstThursdayDayNumber + 3)

  const weekNumber =
    1 +
    Math.round(
      (target.getTime() - firstThursday.getTime()) /
        (7 * 24 * 60 * 60 * 1000)
    )

  return weekNumber
}

export function getTimelineDays(
  timelineStartDate: string,
  timelineEndDate: string
): TimelineDay[] {
  const days: TimelineDay[] = []

  let currentDate = toDate(timelineStartDate)
  const endDate = toDate(timelineEndDate)

  while (currentDate <= endDate) {
    const day = currentDate.getDay()

    days.push({
      date: toIsoDate(currentDate),
      dayLabel: String(currentDate.getDate()),
      monthLabel: currentDate.toLocaleDateString("hu-HU", {
        month: "short",
      }),
      weekNumber: getWeekNumber(currentDate),
      isWeekend: day === 0 || day === 6,
    })

    currentDate = addDays(currentDate, 1)
  }

  return days
}

export function getXFromDate(
  date: string,
  timelineStartDate: string
): number {
  const daysFromStart = differenceInDays(timelineStartDate, date)

  return daysFromStart * DAY_WIDTH
}

export function getWidthFromDates(
  startDate: string,
  endDate: string
): number {
  const durationInDays = differenceInDays(startDate, endDate) + 1

  return Math.max(durationInDays * DAY_WIDTH, DAY_WIDTH)
}

export function getDateFromX(
  x: number,
  timelineStartDate: string
): string {
  const daysFromStart = Math.round(x / DAY_WIDTH)

  return toIsoDate(addDays(toDate(timelineStartDate), daysFromStart))
}

export function moveDateByPixels(
  date: string,
  deltaX: number
): string {
  const deltaDays = Math.round(deltaX / DAY_WIDTH)

  return toIsoDate(addDays(toDate(date), deltaDays))
}

export function resizeEndDateByPixels(
  endDate: string,
  deltaX: number
): string {
  const deltaDays = Math.round(deltaX / DAY_WIDTH)

  return toIsoDate(addDays(toDate(endDate), deltaDays))
}