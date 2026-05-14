import {
  addDays,
  differenceInCalendarDays,
  format,
  isAfter,
  isBefore,
  parseISO,
} from "date-fns"

export type ISODateString = string

export function parseDate(date: ISODateString) {
  return parseISO(date)
}

export function formatDate(date: Date | ISODateString, pattern = "yyyy-MM-dd") {
  const parsedDate = typeof date === "string" ? parseISO(date) : date
  return format(parsedDate, pattern)
}

export function formatDisplayDate(date: ISODateString) {
  return format(parseISO(date), "yyyy.MM.dd")
}

export function addDaysToDate(date: ISODateString, days: number) {
  return format(addDays(parseISO(date), days), "yyyy-MM-dd")
}

export function getDurationDays(startDate: ISODateString, endDate: ISODateString) {
  return differenceInCalendarDays(parseISO(endDate), parseISO(startDate)) + 1
}

export function getOffsetDays(viewStartDate: ISODateString, taskStartDate: ISODateString) {
  return differenceInCalendarDays(parseISO(taskStartDate), parseISO(viewStartDate))
}

export function clampDate(
  date: ISODateString,
  minDate: ISODateString,
  maxDate: ISODateString
) {
  const current = parseISO(date)
  const min = parseISO(minDate)
  const max = parseISO(maxDate)

  if (isBefore(current, min)) return minDate
  if (isAfter(current, max)) return maxDate

  return date
}

export function moveDateRangeByDays(
  startDate: ISODateString,
  endDate: ISODateString,
  deltaDays: number
) {
  return {
    startDate: addDaysToDate(startDate, deltaDays),
    endDate: addDaysToDate(endDate, deltaDays),
  }
}

export function resizeDateRangeByDays(
  startDate: ISODateString,
  endDate: ISODateString,
  deltaDays: number
) {
  const newEndDate = addDaysToDate(endDate, deltaDays)

  if (getDurationDays(startDate, newEndDate) < 1) {
    return {
      startDate,
      endDate: startDate,
    }
  }

  return {
    startDate,
    endDate: newEndDate,
  }
}