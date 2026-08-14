export type TerminalSessionState = "BLOCKED" | "STARTING" | "RUNNING" | "DISCONNECTED" | "EXITED" | "CLOSED" | "FAILED";

export type TerminalSessionSummary = {
  id: string;
  state: TerminalSessionState;
  environment: "DEV";
  cwd: string;
  cols: number;
  rows: number;
  createdAt: string;
  lastActivityAt: string;
  exitedAt: string | null;
  exitCode: number | null;
  sequence: number;
  owner: string;
};

export type TerminalOutputChunk = {
  sequence: number;
  data: string;
  createdAt: string;
};

export type TerminalSessionCreateRequest = { cwd: string; cols?: number; rows?: number };
export type TerminalSessionResizeRequest = { cols: number; rows: number };
export type TerminalSessionInputRequest = { data: string };
