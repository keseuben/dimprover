import { useState } from "react"

export type PhotoAppendixLayout = "quarter" | "half" | "full"
export type PhotoAppendixOrientation = "portrait" | "landscape"
export type PhotoCategory = "photo" | "plan-photo"

export type FieldPhoto = {
  id: string
  issueId: string
  serial: string
  name: string
  note: string
  url: string
  dataUrl: string
  originalSize: number
  compressedSize: number
  width: number
  height: number
  edited: boolean
  appendixLayout: PhotoAppendixLayout
  appendixOrientation: PhotoAppendixOrientation
  category: PhotoCategory
}


const photoNotePresets = [
  "Közeli részletfotó a hibáról.",
  "Áttekintő fotó a hiba pontos helyével.",
  "Tervfotó a hibapont környezetéről.",
  "A javítandó felület átadás előtti állapota.",
  "Méretezést segítő fotó látható referenciaponttal.",
  "A hiba környezetében lévő csatlakozó szerkezetek láthatók.",
  "A kivitelezői javítás előtt rögzített állapot.",
  "A helyszíni ellenőrzéskor készült dokumentáló fotó.",
  "A hibás részlet több irányból ellenőrizhető.",
  "A fotó a PDF mellékletben képaláírással szerepeljen.",
]

function PhotoNotePresetSelect({ onSelect }: { onSelect: (value: string) => void }) {
  const [query, setQuery] = useState("")
  const filteredOptions = photoNotePresets.filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))

  return (
    <div className="mb-2 border border-slate-200 bg-slate-50/80 p-2">
      <div className="mb-1 text-[10px] font-black uppercase tracking-[0.12em] text-slate-500">Képaláírás mintaszövegek</div>
      <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <label className="relative block">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg font-black leading-none text-slate-500">⌕</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Keresés mintaszövegben"
            className="h-9 w-full border border-slate-300 bg-white pl-10 pr-3 text-xs font-semibold text-slate-700 outline-none placeholder:text-slate-400 focus:border-cyan-500"
          />
        </label>
        <select
          value=""
          onChange={(event) => {
            if (!event.target.value) return
            onSelect(event.target.value)
            setQuery("")
          }}
          className="h-9 border border-cyan-200 bg-white px-3 text-xs font-bold text-cyan-900 outline-none focus:border-cyan-500"
        >
          <option value="">Válassz képaláírást...</option>
          {filteredOptions.map((option, index) => (
            <option key={option} value={option}>{index + 1}. {option}</option>
          ))}
        </select>
      </div>
    </div>
  )
}

type FieldPhotosPanelProps = {
  activeIssueSerial?: string
  activeIssuePhotos: FieldPhoto[]
  open: boolean
  expandedPhotoId: string | null
  photoAppendixOptions: { value: PhotoAppendixLayout; label: string; helper: string }[]
  photoCategoryOptions: { value: PhotoCategory; label: string }[]
  photoAppendixOrientationOptions: { value: PhotoAppendixOrientation; label: string }[]
  formatFileSize: (size: number) => string
  onToggleOpen: () => void
  showPhotoSourceMenu: boolean
  onTogglePhotoSourceMenu: () => void
  onOpenCameraUpload: () => void
  onOpenGalleryUpload: () => void
  onNotifyFuturePhotoSource: (sourceName: string) => void
  onSetExpandedPhotoId: (photoId: string | null) => void
  onUpdatePhotoCategory: (photoId: string, category: PhotoCategory) => void
  onUpdatePhotoAppendixLayout: (photoId: string, appendixLayout: PhotoAppendixLayout) => void
  onUpdatePhotoAppendixOrientation: (photoId: string, appendixOrientation: PhotoAppendixOrientation) => void
  onOpenPhotoEditor: (photoId: string) => void
  onDeletePhoto: (photoId: string) => void
  onUpdatePhotoNote: (photoId: string, note: string) => void
}

export default function FieldPhotosPanel({
  activeIssueSerial,
  activeIssuePhotos,
  open,
  expandedPhotoId,
  photoAppendixOptions,
  photoCategoryOptions,
  photoAppendixOrientationOptions,
  formatFileSize,
  onToggleOpen,
  showPhotoSourceMenu,
  onTogglePhotoSourceMenu,
  onOpenCameraUpload,
  onOpenGalleryUpload,
  onNotifyFuturePhotoSource,
  onSetExpandedPhotoId,
  onUpdatePhotoCategory,
  onUpdatePhotoAppendixLayout,
  onUpdatePhotoAppendixOrientation,
  onOpenPhotoEditor,
  onDeletePhoto,
  onUpdatePhotoNote,
}: FieldPhotosPanelProps) {
  return (
    <div className="border border-cyan-200 bg-white/95 shadow-sm">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-cyan-50">
        <span>
          <span className="block text-sm font-black uppercase tracking-[0.1em] text-slate-700">Fotók / tervfotók</span>
          <span className="mt-1 block text-xs font-semibold text-slate-500">Aktív hiba: {activeIssueSerial ?? "nincs kiválasztva"} · {activeIssuePhotos.length} db</span>
        </span>
        <span className="text-xl font-black text-cyan-800">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-cyan-100 p-4">
          <div className="relative border border-slate-200 bg-white p-3">
            <button type="button" onClick={onTogglePhotoSourceMenu} className="w-full border border-cyan-700 bg-cyan-700 px-4 py-3 text-sm font-black uppercase tracking-[0.08em] text-white hover:bg-cyan-800">Fotó / tervfotó hozzáadása ▾</button>
            {showPhotoSourceMenu && (
              <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-50 border border-slate-300 bg-white p-2 text-left shadow-2xl">
                <button type="button" onClick={onOpenCameraUpload} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-cyan-50"><span>📷 Fotó készítése kamerával</span><small className="text-[10px] font-black uppercase text-cyan-800">Aktív</small></button>
                <button type="button" onClick={onOpenGalleryUpload} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-slate-800 hover:bg-slate-50"><span>⇧ Fotó kiválasztása galériából</span><small className="text-[10px] font-black uppercase text-cyan-800">Aktív</small></button>
                <div className="my-1 border-t border-slate-100" />
                {["Projekt fotótár", "Dokumentumtár / tervfotó", "Google Drive", "OneDrive / SharePoint"].map((source) => (
                  <button key={source} type="button" onClick={() => onNotifyFuturePhotoSource(source)} className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm font-bold text-slate-400 hover:bg-slate-50"><span>{source}</span><small className="text-[10px] font-black uppercase">Hamarosan</small></button>
                ))}
              </div>
            )}
          </div>
          <p className="mt-2 text-xs font-semibold text-slate-500">Kompakt lista. Egy hibához több fotó és tervfotó is kapcsolható. A részletek csak a kiválasztott fotónál nyílnak meg.</p>
          <div className="mt-4 grid gap-2">
            {activeIssuePhotos.map((photo) => {
              const isExpanded = expandedPhotoId === photo.id
              return (
                <div key={photo.id} className="border border-slate-200 bg-slate-50">
                  <button type="button" onClick={() => onSetExpandedPhotoId(isExpanded ? null : photo.id)} className="grid w-full grid-cols-[56px_minmax(0,1fr)_auto] items-center gap-3 p-2 text-left hover:bg-white">
                    <span className="grid h-12 w-14 place-items-center bg-white bg-cover bg-center text-xl" style={photo.url ? { backgroundImage: `url(${photo.url})` } : undefined}>{!photo.url && "📸"}</span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-900">{photo.serial}</span>
                        <span className="truncate text-[11px] font-bold text-cyan-800">{photo.category === "plan-photo" ? "Tervfotó" : "Hibafotó"}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs font-semibold text-slate-500">{photo.name}</span>
                      <span className="mt-0.5 block text-[11px] font-bold text-slate-400">{photoAppendixOptions.find((option) => option.value === photo.appendixLayout)?.label} · {photo.appendixOrientation === "landscape" ? "fekvő" : "álló"}</span>
                    </span>
                    <span className="text-lg font-black text-slate-400">{isExpanded ? "−" : "+"}</span>
                  </button>
                  {isExpanded && (
                    <div className="border-t border-slate-200 p-3">
                      <div className="grid h-32 place-items-center bg-white bg-cover bg-center text-3xl" style={photo.url ? { backgroundImage: `url(${photo.url})` } : undefined}>{!photo.url && "📸"}</div>
                      <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500">
                        <div>Eredeti: {formatFileSize(photo.originalSize)}</div>
                        <div>PDF: {formatFileSize(photo.compressedSize)}</div>
                        <div className="col-span-2">Méret: {photo.width || "-"} × {photo.height || "-"} px {photo.edited ? "· szerkesztett" : ""}</div>
                      </div>
                      <div className="mt-2 grid grid-cols-1 gap-2">
                        <label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Kép típusa<select value={photo.category} onChange={(event) => onUpdatePhotoCategory(photo.id, event.target.value as PhotoCategory)} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500">{photoCategoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
                        <label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">PDF végi méret<select value={photo.appendixLayout} onChange={(event) => onUpdatePhotoAppendixLayout(photo.id, event.target.value as PhotoAppendixLayout)} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500">{photoAppendixOptions.map((option) => <option key={option.value} value={option.value}>{option.label} · {option.helper}</option>)}</select></label>
                        <label className="text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">PDF képelhelyezés<select value={photo.appendixOrientation} onChange={(event) => onUpdatePhotoAppendixOrientation(photo.id, event.target.value as PhotoAppendixOrientation)} className="mt-1 h-9 w-full border border-slate-300 bg-white px-2 text-xs font-black text-slate-700 outline-none focus:border-cyan-500">{photoAppendixOrientationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select><span className="mt-1 block text-[10px] normal-case tracking-normal text-slate-400">A jegyzőkönyv oldala álló marad.</span></label>
                      </div>
                      <div className="mt-2 grid gap-2 sm:grid-cols-2">
                        <button type="button" onClick={() => onOpenPhotoEditor(photo.id)} className="border border-slate-300 bg-white px-3 py-2 text-xs font-black uppercase text-slate-700 hover:bg-slate-50">Képszerkesztő megnyitása</button>
                        <button type="button" onClick={() => onDeletePhoto(photo.id)} className="border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black uppercase text-rose-700 hover:bg-rose-100">Fotó törlése</button>
                      </div>
                      <div className="mt-2">
                        <PhotoNotePresetSelect onSelect={(value) => onUpdatePhotoNote(photo.id, value)} />
                        <label className="block text-[10px] font-black uppercase tracking-[0.08em] text-slate-500">Képaláírás / fotó megjegyzés
                          <input value={photo.note} onChange={(event) => onUpdatePhotoNote(photo.id, event.target.value)} placeholder="Pl.: Közeli részletfotó a sérült élről / terven bejelölt érintett terület." className="mt-1 h-10 w-full border border-slate-300 bg-white px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 focus:border-cyan-500" />
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
            {!activeIssuePhotos.length && <div className="border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm font-semibold text-slate-500">Még nincs fotó az aktív hibához.</div>}
          </div>
        </div>
      )}
    </div>
  )
}
