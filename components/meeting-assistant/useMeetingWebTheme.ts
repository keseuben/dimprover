"use client";

import { useCallback, useEffect, useState } from "react";

export type MeetingWebTheme = "light" | "dark";

const STORAGE_KEY = "dimpro:meeting-assistant:web-theme";

export function useMeetingWebTheme() {
  const [theme, setTheme] = useState<MeetingWebTheme>("light");

  useEffect(() => {
    try {
      const storedTheme = window.localStorage.getItem(STORAGE_KEY);
      if (storedTheme === "dark" || storedTheme === "light") setTheme(storedTheme);
    } catch {
      // A felület világos módban marad, ha a böngésző tiltja a helyi tárolást.
    }
  }, []);

  useEffect(() => {
    const background = theme === "dark" ? "#171c1b" : "#eef5f3";
    const color = theme === "dark" ? "#f5f5f5" : "#0f172a";
    const previousHtmlBackground = document.documentElement.style.backgroundColor;
    const previousBodyBackground = document.body.style.backgroundColor;
    const previousBodyColor = document.body.style.color;
    document.documentElement.style.backgroundColor = background;
    document.body.style.backgroundColor = background;
    document.body.style.color = color;
    document.documentElement.dataset.meetingWebTheme = theme;
    return () => {
      document.documentElement.style.backgroundColor = previousHtmlBackground;
      document.body.style.backgroundColor = previousBodyBackground;
      document.body.style.color = previousBodyColor;
      delete document.documentElement.dataset.meetingWebTheme;
    };
  }, [theme]);

  const changeTheme = useCallback((nextTheme: MeetingWebTheme) => {
    setTheme(nextTheme);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextTheme);
    } catch {
      // A téma az aktuális munkamenetben akkor is működik.
    }
  }, []);

  const toggleTheme = useCallback(() => {
    changeTheme(theme === "dark" ? "light" : "dark");
  }, [changeTheme, theme]);

  return { theme, changeTheme, toggleTheme };
}
