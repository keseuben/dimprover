"use client";

import { create } from "zustand";

type SessionState = {
  remainingSeconds: number;
  setRemainingSeconds: (seconds: number) => void;
};

export const useSessionTimer = create<SessionState>((set) => ({
  remainingSeconds: 30 * 60,

  setRemainingSeconds: (seconds) =>
    set({
      remainingSeconds: seconds,
    }),
}));