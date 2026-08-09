import { useRef, useState } from "react"

export type SignerData = {
  inspectorName: string
  inspectorRole: string
  inspectorSignature: string
}

export type ContractorSigner = {
  key: string
  company: string
  representative: string
  role: string
  signature: string
}

export type SignatureGroup = {
  key: string
  company: string
  representative: string
  role: string
  signature: string
  issueCount: number
}

function FieldInput({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 w-full border border-slate-300 bg-white/95 px-3 text-[16px] font-semibold text-slate-800 outline-none placeholder:text-slate-400 focus:border-cyan-500 md:text-sm"
      />
    </label>
  )
}

export function SignaturePad({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (value: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)

  function getPosition(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return { x: 0, y: 0 }
    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function beginDraw(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext("2d")
    if (!context) return
    event.currentTarget.setPointerCapture(event.pointerId)
    const position = getPosition(event)
    context.lineWidth = 2.2
    context.lineCap = "round"
    context.lineJoin = "round"
    context.strokeStyle = "#0f172a"
    context.beginPath()
    context.moveTo(position.x, position.y)
    setIsDrawing(true)
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (!canvas || !context) return
    const position = getPosition(event)
    context.lineTo(position.x, position.y)
    context.stroke()
  }

  function endDraw() {
    const canvas = canvasRef.current
    if (!canvas) return
    setIsDrawing(false)
    onChange(canvas.toDataURL("image/png"))
  }

  function clearSignature() {
    const canvas = canvasRef.current
    const context = canvas?.getContext("2d")
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height)
    onChange("")
  }

  return (
    <div className="border border-slate-200 bg-slate-50 p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="text-[11px] font-black uppercase tracking-[0.12em] text-slate-500">{label}</div>
        <button
          type="button"
          onClick={clearSignature}
          className="border border-slate-300 bg-white px-2 py-1 text-[10px] font-black uppercase text-slate-600 hover:bg-slate-50"
        >
          Törlés
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={620}
        height={180}
        onPointerDown={beginDraw}
        onPointerMove={draw}
        onPointerUp={endDraw}
        onPointerLeave={() => isDrawing && endDraw()}
        className="h-24 w-full touch-none border border-dashed border-slate-300 bg-white"
      />
      {!value && <div className="mt-2 text-xs font-semibold text-slate-400">Aláírás bevitele egérrel vagy érintőképernyővel.</div>}
    </div>
  )
}


type FieldSignaturesPanelProps = {
  signers: SignerData
  signatureGroups: SignatureGroup[]
  contractorSigners: ContractorSigner[]
  open: boolean
  expandedSignerKey: string
  onToggleOpen: () => void
  onSetExpandedSignerKey: (key: string) => void
  onUpdateSigner: (field: keyof SignerData, value: string) => void
  onUpdateContractorSigner: (key: string, patch: Partial<ContractorSigner>) => void
}

export default function FieldSignaturesPanel({
  signers,
  signatureGroups,
  contractorSigners,
  open,
  expandedSignerKey,
  onToggleOpen,
  onSetExpandedSignerKey,
  onUpdateSigner,
  onUpdateContractorSigner,
}: FieldSignaturesPanelProps) {
  const hasSignature = Boolean(signers.inspectorSignature || contractorSigners.some((signer) => signer.signature))

  return (
    <div className="border border-slate-300 bg-white/95 shadow-sm">
      <button type="button" onClick={onToggleOpen} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50">
        <span><span className="block text-sm font-black uppercase tracking-[0.1em] text-slate-700">Jegyzőkönyv aláírók</span><span className="mt-1 block text-xs font-semibold text-slate-500">{signatureGroups.length + 1} aláíró · {hasSignature ? "van aláírás" : "nincs aláírás"}</span></span>
        <span className="text-xl font-black text-slate-500">{open ? "−" : "+"}</span>
      </button>
      {open && (
        <div className="border-t border-slate-100 p-4">
          <div className="grid gap-2">
            <button type="button" onClick={() => onSetExpandedSignerKey("inspector")} className={`flex items-center justify-between border px-3 py-2 text-left ${expandedSignerKey === "inspector" ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}>
              <span><span className="block text-sm font-black text-slate-800">Rögzítő / műszaki ellenőr</span><span className="text-xs font-bold text-slate-500">{signers.inspectorName || "Név nincs megadva"}</span></span><span className="font-black text-cyan-800">{signers.inspectorSignature ? "✓" : "○"}</span>
            </button>
            {expandedSignerKey === "inspector" && <div className="grid gap-3 border border-cyan-100 bg-white p-3 xl:grid-cols-3"><FieldInput label="Rögzítő / műszaki ellenőr neve" value={signers.inspectorName} onChange={(value) => onUpdateSigner("inspectorName", value)} placeholder="Név" /><FieldInput label="Rögzítő szerepköre" value={signers.inspectorRole} onChange={(value) => onUpdateSigner("inspectorRole", value)} placeholder="Műszaki ellenőr" /><SignaturePad label="Rögzítő aláírása" value={signers.inspectorSignature} onChange={(value) => onUpdateSigner("inspectorSignature", value)} /></div>}
            {signatureGroups.map((group) => {
              const signerKey = `contractor:${group.key}`
              const isExpanded = expandedSignerKey === signerKey
              return <div key={group.key} className="grid gap-2"><button type="button" onClick={() => onSetExpandedSignerKey(signerKey)} className={`flex items-center justify-between border px-3 py-2 text-left ${isExpanded ? "border-cyan-200 bg-cyan-50" : "border-slate-200 bg-slate-50"}`}><span className="min-w-0"><span className="block truncate text-sm font-black text-slate-800">{group.company}</span><span className="block truncate text-xs font-bold text-slate-500">{group.issueCount} hiba · {group.representative || "képviselő nincs megadva"}</span></span><span className="font-black text-cyan-800">{group.signature ? "✓" : "○"}</span></button>{isExpanded && <div className="grid gap-3 border border-cyan-100 bg-white p-3 xl:grid-cols-3"><FieldInput label="Érintett vállalkozó képviselője" value={group.representative} onChange={(value) => onUpdateContractorSigner(group.key, { representative: value })} placeholder="Aláíró neve" /><FieldInput label="Szerepkör" value={group.role} onChange={(value) => onUpdateContractorSigner(group.key, { role: value })} placeholder="Érintett vállalkozó képviselője" /><SignaturePad label={`${group.company} aláírása`} value={group.signature} onChange={(value) => onUpdateContractorSigner(group.key, { signature: value })} /></div>}</div>
            })}
          </div>
        </div>
      )}
    </div>
  )
}
