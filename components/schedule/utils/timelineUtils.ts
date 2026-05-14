export const WEEK_WIDTH = 64

export function getTaskLeft(startWeek: number) {
  return startWeek * WEEK_WIDTH
}

export function getTaskWidth(duration: number) {
  return duration * WEEK_WIDTH
}