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

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = async () => {
        if (busy || closed) return;
        busy = true;
        try {
          const [live, messages] = await Promise.all([getDeveloperConsoleLiveStatus(), listDeveloperConsoleMessages(180)]);
          const snapshot = { live, messages };
          const payload = JSON.stringify(snapshot);
          const hash = createHash("sha256").update(payload).digest("hex");
          const now = Date.now();
          if (hash !== lastHash) {
            lastHash = hash;
            lastHeartbeat = now;
            controller.enqueue(encoder.encode(`event: snapshot\ndata: ${JSON.stringify({ ...snapshot, sentAt: new Date(now).toISOString() })}\n\n`));
          } else if (now - lastHeartbeat >= 15_000) {
            lastHeartbeat = now;
            controller.enqueue(encoder.encode(`event: heartbeat\ndata: ${JSON.stringify({ sentAt: new Date(now).toISOString() })}\n\n`));
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`event: stream-error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "STREAM_ERROR", sentAt: new Date().toISOString() })}\n\n`));
        } finally {
          busy = false;
        }
      };
      void send();
      timer = setInterval(() => void send(), 1000);
      request.signal.addEventListener("abort", () => {
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* kliens már lezárta */ }
      }, { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
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
