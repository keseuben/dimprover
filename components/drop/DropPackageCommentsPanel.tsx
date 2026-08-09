"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { LoaderCircle, MessageSquare, RefreshCw, Send } from "lucide-react";

type CommentRow = {
  id: string;
  file_id: string | null;
  author_name: string;
  author_email: string | null;
  comment_text: string;
  status: string;
  created_at: string;
  updated_at: string;
};

type FileRow = {
  id: string;
  display_name: string;
  original_name: string;
  upload_status: string;
  security_status: string | null;
};

type Payload = {
  ok: boolean;
  comments: CommentRow[];
  files: FileRow[];
  canComment: boolean;
  error?: string;
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("hu-HU");
}

export default function DropPackageCommentsPanel({ packageId }: { packageId: string }) {
  const [comments, setComments] = useState<CommentRow[]>([]);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [canComment, setCanComment] = useState(false);
  const [commentText, setCommentText] = useState("");
  const [fileId, setFileId] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageId)}/comments`, { cache: "no-store" });
      const payload = await response.json() as Payload;
      if (!response.ok) throw new Error(payload.error || "A megjegyzések nem tölthetők be.");
      setComments(Array.isArray(payload.comments) ? payload.comments : []);
      setFiles(Array.isArray(payload.files) ? payload.files : []);
      setCanComment(Boolean(payload.canComment));
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A megjegyzések nem tölthetők be.");
    } finally {
      setLoading(false);
    }
  }, [packageId]);

  useEffect(() => {
    void load();
  }, [load]);

  const fileNames = useMemo(() => new Map(files.map((file) => [file.id, file.display_name || file.original_name])), [files]);

  const submit = useCallback(async () => {
    if (!commentText.trim() || submitting || !canComment) return;
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch(`/api/drop/spaces/packages/${encodeURIComponent(packageId)}/comments`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ commentText, fileId: fileId || null }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "A megjegyzés nem menthető.");
      setCommentText("");
      setFileId("");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "A megjegyzés nem menthető.");
      throw error;
    } finally {
      setSubmitting(false);
    }
  }, [canComment, commentText, fileId, load, packageId, submitting]);

  return (
    <section className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-700"><MessageSquare size={15} /> Megjegyzések</p>
          <p className="mt-1 text-[11px] font-semibold leading-5 text-slate-500">A megjegyzés az egész csomaghoz vagy egy kiválasztott fájlhoz kapcsolható.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-black text-slate-700 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} /> Frissítés</button>
      </div>

      {canComment ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_16rem]">
          <textarea value={commentText} onChange={(event) => setCommentText(event.target.value.slice(0, 10_000))} rows={3} placeholder="Megjegyzés írása…" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-900 outline-none focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100" />
          <div className="space-y-2">
            <select value={fileId} onChange={(event) => setFileId(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-900">
              <option value="">Az egész csomaghoz</option>
              {files.map((file) => <option key={file.id} value={file.id}>{file.display_name || file.original_name}</option>)}
            </select>
            <button type="button" onClick={() => void submit()} disabled={!commentText.trim() || submitting} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-cyan-800 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-slate-300">{submitting ? <LoaderCircle size={16} className="animate-spin" /> : <Send size={16} />} {submitting ? "Mentés…" : "Megjegyzés mentése"}</button>
          </div>
        </div>
      ) : <p className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-500">Ehhez a csomaghoz nincs megjegyzési jogosultság.</p>}

      {message ? <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold text-rose-900">{message}</p> : null}

      <div className="mt-4 space-y-2">
        {comments.map((comment) => (
          <article key={comment.id} className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-slate-950">{comment.author_name}</strong><span className="text-[10px] font-semibold text-slate-500">{formatDate(comment.created_at)}</span></div>
            {comment.file_id ? <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-cyan-700">Fájl: {fileNames.get(comment.file_id) || "Korábbi fájl"}</p> : <p className="mt-1 text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Csomagszintű megjegyzés</p>}
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-700">{comment.comment_text}</p>
          </article>
        ))}
        {!comments.length && !loading ? <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-7 text-center text-xs font-bold text-slate-500">Még nincs megjegyzés.</div> : null}
      </div>
    </section>
  );
}
