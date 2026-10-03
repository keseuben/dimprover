export type DriveTheme = "light" | "dark";

export const DRIVE_THEME_STORAGE_KEY = "dimpro-drive-theme";

export function normalizeDriveTheme(value: string | null | undefined): DriveTheme {
  return value === "dark" ? "dark" : "light";
}
