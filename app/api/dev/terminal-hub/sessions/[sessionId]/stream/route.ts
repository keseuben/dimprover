import { NextRequest } from "next/server";
import { isDevCenterAuthorized } from "@/app/lib/dev-center/auth";
import { readTerminalOutput, TerminalSessionError } from "@/app/lib/dev-center/terminal-hub/session-registry";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const OWNER = "BENJADMIN_ADMIN";

export async function GET(request: NextRequest, context: { params: Promise<{ sessionId: string }> }) {
  if (!(await isDevCenterAuthorized(request.headers, false))) return Response.json({ ok: false, error: "Nincs BENJADMIN terminál jogosultság." }, { status: 401 });
  const { sessionId } = await context.params;
  const afterParam = Number(new URL(request.url).searchParams.get("after") || 0);
  try { readTerminalOutput(OWNER, sessionId, afterParam); } catch (error) {
    if (error instanceof TerminalSessionError) return Response.json({ ok: false, code: error.code, error: error.message }, { status: error.status });
    return Response.json({ ok: false, error: "A terminál stream nem indítható." }, { status: 500 });
  }

  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let sequence = Number.isFinite(afterParam) ? Math.max(0, Math.floor(afterParam)) : 0;
  let heartbeatAt = 0;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = () => {
        if (closed) return;
        try {
          const snapshot = readTerminalOutput(OWNER, sessionId, sequence);
          for (const chunk of snapshot.chunks) {
            sequence = Math.max(sequence, chunk.sequence);
            controller.enqueue(encoder.encode(`event: output\ndata: ${JSON.stringify(chunk)}\n\n`));
          }
          const now = Date.now();
          if (now - heartbeatAt >= 10_000) {
            heartbeatAt = now;
            controller.enqueue(encoder.encode(`event: session\ndata: ${JSON.stringify({ session: snapshot.session, sequence, sentAt: new Date(now).toISOString() })}\n\n`));
          }
          if (["EXITED", "CLOSED", "FAILED"].includes(snapshot.session.state)) {
            controller.enqueue(encoder.encode(`event: terminal-end\ndata: ${JSON.stringify({ session: snapshot.session, sequence })}\n\n`));
            closed = true;
            if (timer) clearInterval(timer);
            controller.close();
          }
        } catch (error) {
          controller.enqueue(encoder.encode(`event: stream-error\ndata: ${JSON.stringify({ error: error instanceof Error ? error.message : "TERMINAL_STREAM_ERROR" })}\n\n`));
        }
      };
      send();
      timer = setInterval(send, 250);
      request.signal.addEventListener("abort", () => { closed = true; if (timer) clearInterval(timer); try { controller.close(); } catch { /* client disconnected */ } }, { once: true });
    },
    cancel() { closed = true; if (timer) clearInterval(timer); },
  });

  return new Response(stream, { headers: { "content-type": "text/event-stream; charset=utf-8", "cache-control": "no-cache, no-transform", "connection": "keep-alive", "x-accel-buffering": "no" } });
}
