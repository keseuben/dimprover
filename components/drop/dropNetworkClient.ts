"use client";

export type DropNetworkState = {
  browserOnline: boolean;
  serverReachable: boolean;
  online: boolean;
  checking: boolean;
  checkedAt: string | null;
  reason: "online" | "browser_offline" | "server_unreachable" | "checking";
};

type Listener = (state: DropNetworkState) => void;
const listeners = new Set<Listener>();
let state: DropNetworkState = {
  browserOnline: typeof navigator === "undefined" ? true : navigator.onLine,
  serverReachable: true,
  online: typeof navigator === "undefined" ? true : navigator.onLine,
  checking: false,
  checkedAt: null,
  reason: typeof navigator !== "undefined" && !navigator.onLine ? "browser_offline" : "online",
};
let initialized = false;
let timer: number | null = null;
let transitionTimer: number | null = null;

function publish(next: DropNetworkState) {
  state = next;
  listeners.forEach((listener) => listener(state));
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("dimpro-drop-network-state", { detail: state }));
}

export function getDropNetworkState() { return state; }
export function subscribeDropNetworkState(listener: Listener) { listeners.add(listener); listener(state); return () => { listeners.delete(listener); }; }

export async function checkDropNetwork(): Promise<DropNetworkState> {
  const browserOnline = typeof navigator === "undefined" ? true : navigator.onLine;
  if (!browserOnline) {
    const next = { browserOnline: false, serverReachable: false, online: false, checking: false, checkedAt: new Date().toISOString(), reason: "browser_offline" as const };
    publish(next); return next;
  }
  publish({ ...state, browserOnline: true, checking: true, reason: "checking" });
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(`/api/drop/public/ping?_=${Date.now()}`, { cache: "no-store", signal: controller.signal, headers: { accept: "application/json" } });
    const reachable = response.ok;
    const next = { browserOnline: true, serverReachable: reachable, online: reachable, checking: false, checkedAt: new Date().toISOString(), reason: reachable ? "online" as const : "server_unreachable" as const };
    publish(next); return next;
  } catch {
    const next = { browserOnline: true, serverReachable: false, online: false, checking: false, checkedAt: new Date().toISOString(), reason: "server_unreachable" as const };
    publish(next); return next;
  } finally { window.clearTimeout(timeout); }
}

type DropBrowserConnection = EventTarget & { effectiveType?: string; type?: string };
function browserConnection(): DropBrowserConnection | null {
  if (typeof navigator === "undefined") return null;
  const value = navigator as Navigator & { connection?: DropBrowserConnection; mozConnection?: DropBrowserConnection; webkitConnection?: DropBrowserConnection };
  return value.connection || value.mozConnection || value.webkitConnection || null;
}

export function initializeDropNetworkMonitor() {
  if (typeof window === "undefined" || initialized) return () => undefined;
  initialized = true;
  const connection = browserConnection();
  const refreshNow = () => { void checkDropNetwork(); };
  const refreshAfterTransition = () => {
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    publish({ ...state, browserOnline: navigator.onLine, serverReachable: false, online: false, checking: true, reason: "checking" });
    transitionTimer = window.setTimeout(() => { transitionTimer = null; void checkDropNetwork(); }, 1_200);
  };
  window.addEventListener("online", refreshAfterTransition);
  window.addEventListener("offline", refreshNow);
  connection?.addEventListener("change", refreshAfterTransition);
  document.addEventListener("visibilitychange", refreshNow);
  timer = window.setInterval(refreshNow, 30_000);
  void checkDropNetwork();
  return () => {
    window.removeEventListener("online", refreshAfterTransition);
    window.removeEventListener("offline", refreshNow);
    connection?.removeEventListener("change", refreshAfterTransition);
    document.removeEventListener("visibilitychange", refreshNow);
    if (transitionTimer !== null) window.clearTimeout(transitionTimer);
    if (timer !== null) window.clearInterval(timer);
    transitionTimer = null; timer = null; initialized = false;
  };
}

export async function waitForDropOnline(signal?: AbortSignal) {
  if (getDropNetworkState().online && (typeof navigator === "undefined" || navigator.onLine)) return;
  await new Promise<void>((resolve, reject) => {
    let unsubscribe: () => void = () => undefined;
    let settled = false;
    const cleanup = () => { unsubscribe(); signal?.removeEventListener("abort", abort); };
    const finish = () => { if (settled) return; settled = true; cleanup(); resolve(); };
    const abort = () => { if (settled) return; settled = true; cleanup(); reject(new DOMException("A várakozás megszakadt.", "AbortError")); };
    unsubscribe = subscribeDropNetworkState((next) => { if (next.online) finish(); });
    if (signal?.aborted) abort(); else signal?.addEventListener("abort", abort, { once: true });
    void checkDropNetwork();
  });
}

function retryableStatus(status: number) { return status === 408 || status === 425 || status === 429 || status >= 500; }
function networkFailure(error: unknown) { return error instanceof TypeError || (error instanceof DOMException && error.name !== "AbortError"); }

export async function dropFetchWithRetry(input: RequestInfo | URL, init: RequestInit = {}, options: {
  attempts?: number;
  signal?: AbortSignal;
  onRetry?: (detail: string, attempt: number) => void;
  retryStatuses?: number[];
  skipRetryStatuses?: number[];
} = {}) {
  const attempts = Math.max(1, Math.min(6, options.attempts ?? 4));
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (!getDropNetworkState().online || (typeof navigator !== "undefined" && !navigator.onLine)) {
      options.onRetry?.("Nincs kapcsolat · a kész fájlrészek megmaradtak", attempt);
      await waitForDropOnline(options.signal);
    }
    try {
      const response = await fetch(input, { ...init, signal: options.signal });
      if (options.skipRetryStatuses?.includes(response.status)) return response;
      const shouldRetry = options.retryStatuses?.includes(response.status) || retryableStatus(response.status);
      if (!shouldRetry || attempt === attempts) return response;
      options.onRetry?.(`Átmeneti szerverhiba (${response.status}) · újrapróbálás`, attempt);
    } catch (error) {
      if (options.signal?.aborted || (error instanceof DOMException && error.name === "AbortError")) throw error;
      if (!networkFailure(error) || attempt === attempts) throw error;
      options.onRetry?.("A hálózat megszakadt · automatikus folytatás", attempt);
      await checkDropNetwork();
    }
    await new Promise((resolve) => window.setTimeout(resolve, Math.min(8_000, 1_000 * 2 ** (attempt - 1))));
  }
  throw new Error("A hálózati művelet az újrapróbálások után sem sikerült.");
}
