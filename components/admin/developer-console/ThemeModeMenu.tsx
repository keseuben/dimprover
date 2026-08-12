"use client";

import { Moon, Sun, SunMedium } from "lucide-react";
import type { ConsoleTheme } from "./types";
import styles from "./DeveloperConsole.module.css";

const themes: Array<{ value: ConsoleTheme; label: string; icon: React.ReactNode }> = [
  { value: "light", label: "Világos", icon: <Sun size={14} /> },
  { value: "dark", label: "Sötét", icon: <Moon size={14} /> },
  { value: "sunlight", label: "Sunlight", icon: <SunMedium size={14} /> },
];

export default function ThemeModeMenu({ theme, onChange }: { theme: ConsoleTheme; onChange: (theme: ConsoleTheme) => void }) {
  return <div className={styles.themeMenu} role="group" aria-label="Konzol megjelenési mód">{themes.map((item) => <button key={item.value} type="button" className={theme === item.value ? styles.themeActive : ""} onClick={() => onChange(item.value)} title={`${item.label} mód`}>{item.icon}<span>{item.label}</span></button>)}</div>;
}
