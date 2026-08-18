import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { getDeveloperConsoleLiveStatus, listDeveloperConsoleMessages } from "@/app/lib/dev-center/developer-console";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  if (!(await isDevCenterAuthorized(request.headers, true))) return Response.json({ ok: false, error: "Nincs jogosultság az élő eseményfolyamhoz." }, { status: 401 });
  const encoder = new TextEncoder();
  let timer: ReturnType<typeof setInterval> | null = null;
  let closed = false;
  let busy = false;
  let lastHash = "";
  let lastHeartbeat = 0;

  const stop = () => {
    closed = true;
    if (timer) clearInterval(timer);
    timer = null;
  };

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const safeEnqueue = (value: string) => {
        if (closed) return false;
        try {
          controller.enqueue(encoder.encode(value));
          return true;
        } catch {
          stop();
          return false;
        }
      };
      const send = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          const [live, messages] = await Promise.all([getDeveloperConsoleLiveStatus(), listDeveloperConsoleMessages(180)]);
          if (closed) return;
          const snapshot = { live, messages };
          const payload = JSON.stringify(snapshot);
          const hash = createHash("sha256").update(payload).digest("hex");
          const now = Date.now();
          if (hash !== lastHash) {
            lastHash = hash;
            lastHeartbeat = now;
            safeEnqueue(`event: snapshot\ndata: ${JSON.stringify({ ...snapshot, sentAt: new Date(now).toISOString() })}\n\n`);
          } else if (now - lastHeartbeat >= 15_000) {
            lastHeartbeat = now;
            safeEnqueue(`event: heartbeat\ndata: ${JSON.stringify({ sentAt: new Date(now).toISOString() })}\n\n`);
          }
        } catch (error) {
          if (!closed) safeEnqueue(`event: stream-error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "STREAM_ERROR", sentAt: new Date().toISOString() })}\n\n`);
        } finally {
          busy = false;
        }
      };
      void send();
      timer = setInterval(() => void send(), 1000);
      request.signal.addEventListener("abort", () => {
        stop();
        try { controller.close(); } catch { /* a kliens vagy a runtime már lezárta */ }
      }, { once: true });
    },
    cancel() {
      stop();
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      "connection": "keep-alive",
      "x-accel-buffering": "no",
    },
  });
}
