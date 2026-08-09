export type PdfAttachment = {
  id: string
  name: string
  size: number
  note: string
}

type FieldAttachmentsPanelProps = {
  pdfAttachments: PdfAttachment[]
  open: boolean
  maxPdfAttachmentSizeLabel: string
  formatFileSize: (size: number) => string
  onToggleOpen: () => void
  onOpenPdfUpload: () => void
  onUpdatePdfAttachmentNote: (id: string, note: string) => void
}

export default function FieldAttachmentsPanel({
  pdfAttachments,
  open,
  maxPdfAttachmentSizeLabel,
  formatFileSize,
  onToggleOpen,
  onOpenPdfUpload,
  onUpdatePdfAttachmentNote,
}: FieldAttachmentsPanelProps) {
  return (
    <div className="border border-slate-300 bg-white/95 shadow-sm">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span><span className="block text-sm font-black uppercase tracking-[0.1em] text-slate-700">PDF tervek / mellékletek</span><span className="mt-1 block text-xs font-semibold text-slate-500">{pdfAttachments.length} db · opcionális</span></span>
        <span className="text-xl font-black text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <p className="text-xs font-semibold text-slate-500">Maximum PDF fájlméret: {maxPdfAttachmentSizeLabel} / fájl.</p>
          <button type="button" onClick={onOpenPdfUpload} className="mt-4 w-full border border-slate-700 bg-slate-800 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-slate-900">PDF terv csatolása</button>
          <div className="mt-3 grid gap-2">
            {pdfAttachments.map((item) => (
              <div key={item.id} className="border border-slate-200 bg-slate-50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-sm font-black text-slate-800">{item.name}</div>
                  <div className="text-xs font-bold text-slate-500">{formatFileSize(item.size)}</div>
                </div>
                <input
                  value={item.note}
                  onChange={(event) => onUpdatePdfAttachmentNote(item.id, event.target.value)}
                  placeholder="Pl.: Építész alaprajz A-101, érintett helyiség jelöléséhez."
                  className="mt-2 h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold outline-none placeholder:text-slate-400 focus:border-cyan-500"
                />
              </div>
            ))}
            {!pdfAttachments.length && <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-semibold text-slate-500">Még nincs PDF terv csatolva.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
