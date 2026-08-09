"use client";

import React from "react";

const STORAGE_PREFIX = "dimprover:collapse:";

export function getCollapseStorageKey(key: string) {
  return `${STORAGE_PREFIX}${key}`;
}

function readStoredCollapse(storageKey: string, defaultCollapsed: boolean) {
  if (typeof window === "undefined") return defaultCollapsed;
  try {
    const storedValue = window.localStorage.getItem(getCollapseStorageKey(storageKey));
    if (storedValue === "1") return true;
    if (storedValue === "0") return false;
  } catch {
    return defaultCollapsed;
  }
  return defaultCollapsed;
}

export function usePersistentCollapse(storageKey: string, defaultCollapsed = false) {
  const [collapsed, setCollapsed] = React.useState(() => readStoredCollapse(storageKey, defaultCollapsed));

  const updateCollapsed = React.useCallback((value: React.SetStateAction<boolean>) => {
    setCollapsed((current) => {
      const next = typeof value === "function" ? value(current) : value;
      try {
        window.localStorage.setItem(getCollapseStorageKey(storageKey), next ? "1" : "0");
      } catch {
        // Local storage can be unavailable in private or restricted browser modes.
      }
      return next;
    });
  }, [storageKey]);

  const toggleCollapsed = React.useCallback(() => {
    updateCollapsed((current) => !current);
  }, [updateCollapsed]);

  return [collapsed, updateCollapsed, toggleCollapsed] as const;
}
