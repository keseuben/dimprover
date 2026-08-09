"use client"

import { useEffect, useMemo, useRef, useState } from "react"

type Props = {
  selectedMinuteType: string
}

type SignatureSlotProps = {
  id: string
  image?: string
  onOpen: (id: string, element: HTMLElement) => void
}

function SignatureSlot({ id, image, onOpen }: SignatureSlotProps) {
  return (
    <button
      type="button"
      contentEditable={false}
      data-signature-target={id}
      onClick={(event) => onOpen(id, event.currentTarget)}
      className={image ? "dimpro-signature-slot is-signed" : "dimpro-signature-slot"}
    >
      {image ? <img src={image} alt="Aláírás" className="dimpro-signature-image" /> : "Aláírás helye"}
    </button>
  )
}

type ProtocolType = "KOOP" | "HJ" | "MUSZ" | "ATAD" | "TELJ"

const protocolLabels: Record<ProtocolType, string> = {
  KOOP: "Kooperációs jegyzőkönyv",
  HJ: "Helyszíni jegyzőkönyv",
  MUSZ: "Műszaki jegyzőkönyv",
  ATAD: "Átadás-átvételi jegyzőkönyv",
  TELJ: "Teljesítésigazolás",
}

const defaultParticipants = [
  ["Kovács István", "Metrodom Kft.", "Beruházói képviselő", ""],
  ["Nagy Péter", "ÉPÍTŐ Kft.", "Projektvezető", ""],
  ["Szabó Anna", "FMV Kft.", "FMV koordinátor", ""],
  ["Tóth Gábor", "Tervező Stúdió Kft.", "Tervező", ""],
  ["Varga László", "Statika Mérnökiroda Kft.", "Statikus", ""],
]

function padNumber(value: number) {
  return String(value).padStart(4, "0")
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

function makePseudoQr(text: string) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) >>> 0
  const cells = 21
  const black = new Set<string>()

  for (let y = 0; y < cells; y += 1) {
    for (let x = 0; x < cells; x += 1) {
      const finder = (x < 7 && y < 7) || (x > cells - 8 && y < 7) || (x < 7 && y > cells - 8)
      if (finder) {
        const localX = x < 7 ? x : x - (cells - 7)
        const localY = y < 7 ? y : y - (cells - 7)
        const inBorder = localX === 0 || localX === 6 || localY === 0 || localY === 6
        const inCenter = localX >= 2 && localX <= 4 && localY >= 2 && localY <= 4
        if (inBorder || inCenter) black.add(`${x}-${y}`)
        continue
      }
      const bit = ((hash >> ((x + y * 3) % 24)) ^ (x * 17) ^ (y * 29)) & 1
      if (bit) black.add(`${x}-${y}`)
    }
  }
  return { cells, black }
}

function QrPreview({ value }: { value: string }) {
  const qr = useMemo(() => makePseudoQr(value), [value])
  return (
    <div className="grid h-24 w-24 grid-cols-[repeat(21,1fr)] grid-rows-[repeat(21,1fr)] border border-slate-900 bg-white p-1">
      {Array.from({ length: qr.cells * qr.cells }).map((_, index) => {
        const x = index % qr.cells
        const y = Math.floor(index / qr.cells)
        return <span key={`${x}-${y}`} className={qr.black.has(`${x}-${y}`) ? "bg-slate-950" : "bg-white"} />
      })}
    </div>
  )
}

function statusBadge(status: string) {
  if (status === "Végleges") return "bg-blue-100 text-blue-700"
  if (status === "Folyamatban") return "bg-sky-100 text-sky-700"
  if (status === "Nyitott") return "bg-orange-100 text-orange-700"
  return "bg-emerald-100 text-emerald-700"
}

function exec(command: string, value?: string) {
  document.execCommand(command, false, value)
}

export default function DimproRichTextEditor({ selectedMinuteType }: Props) {
  const editorRef = useRef<HTMLDivElement | null>(null)
  const pageRef = useRef<HTMLElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawingRef = useRef(false)
  const signatureTargetElementRef = useRef<HTMLElement | null>(null)
  const helpDragRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  const [protocolType, setProtocolType] = useState<ProtocolType>(selectedMinuteType === "Kooperációs jegyzőkönyv" ? "KOOP" : "HJ")
  const [serialNumber, setSerialNumber] = useState(19)
  const [version, setVersion] = useState("A")
  const [date, setDate] = useState("2026.05.10.")
  const [status, setStatus] = useState("Végleges")
  const [qrEnabled, setQrEnabled] = useState(true)
  const [fontFamily, setFontFamily] = useState("Arial")
  const [fontSize, setFontSize] = useState("12pt")
  const [templateEditMode, setTemplateEditMode] = useState(false)
  const [signatureOpen, setSignatureOpen] = useState(false)
  const [zoom, setZoom] = useState(90)
  const [isExportingPdf, setIsExportingPdf] = useState(false)
  const [signatureTargetId, setSignatureTargetId] = useState<string | null>(null)
  const [emailStatus, setEmailStatus] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(false)
  const [signatures, setSignatures] = useState<Record<string, string>>({})
  const [helpPosition, setHelpPosition] = useState({ left: 260, top: 140 })
  const [pdfPreviewOpen, setPdfPreviewOpen] = useState(false)
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [pdfPreviewError, setPdfPreviewError] = useState<string | null>(null)
  const [htmlPreviewDoc, setHtmlPreviewDoc] = useState<string | null>(null)

  const year = new Date().getFullYear()
  const documentNumber = `${protocolType}-${year}-${padNumber(serialNumber)}-${version}`
  const qrValue = `https://dimprover.hu/jegyzokonyvek/${documentNumber}`

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
    }
  }, [pdfPreviewUrl])

  function changeZoom(delta: number) {
    setZoom((current) => Math.min(150, Math.max(60, current + delta)))
  }

  function createSignatureButton(targetId: string) {
    return `<button type="button" contenteditable="false" data-signature-target="${targetId}" class="dimpro-signature-slot">Aláírás helye</button>`
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const raw = localStorage.getItem("dimpro-minute-serials")
      if (!raw) return
      try {
        const values = JSON.parse(raw) as Partial<Record<ProtocolType, number>>
        if (values[protocolType]) setSerialNumber(values[protocolType] || 1)
      } catch {}
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [protocolType])

  useEffect(() => {
    const element = scrollRef.current
    if (!element) return

    function handleWheel(event: WheelEvent) {
      if (!event.ctrlKey || !event.altKey) return
      event.preventDefault()
      changeZoom(event.deltaY > 0 ? -5 : 5)
    }

    element.addEventListener("wheel", handleWheel, { passive: false })
    return () => element.removeEventListener("wheel", handleWheel)
  }, [])

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!event.ctrlKey || !event.altKey) return

      const isPlus = event.key === "+" || event.key === "=" || event.code === "NumpadAdd"
      const isMinus = event.key === "-" || event.code === "NumpadSubtract"
      const isReset = event.key === "0" || event.code === "Digit0" || event.code === "Numpad0"

      if (isPlus || isMinus || isReset) {
        event.preventDefault()
        event.stopPropagation()
      }

      if (isPlus) changeZoom(5)
      if (isMinus) changeZoom(-5)
      if (isReset) setZoom(100)
    }

    window.addEventListener("keydown", handleKeyDown, true)
    return () => window.removeEventListener("keydown", handleKeyDown, true)
  }, [])

  function saveSerial(next: number) {
    setSerialNumber(next)
    const raw = localStorage.getItem("dimpro-minute-serials")
    const values = raw ? JSON.parse(raw) : {}
    values[protocolType] = next
    localStorage.setItem("dimpro-minute-serials", JSON.stringify(values))
  }

  function applyFontFamily(value: string) {
    setFontFamily(value)
    exec("fontName", value)
  }

  function applyFontSize(value: string) {
    setFontSize(value)
    const px = value === "9pt" ? "12px" : value === "10pt" ? "13px" : value === "11pt" ? "15px" : value === "12pt" ? "16px" : value === "14pt" ? "19px" : value === "16pt" ? "21px" : value === "18pt" ? "24px" : "32px"
    exec("fontSize", "7")
    editorRef.current?.querySelectorAll('font[size="7"]').forEach((node) => {
      const span = document.createElement("span")
      span.setAttribute("style", `font-size:${px}`)
      span.innerHTML = node.innerHTML
      node.replaceWith(span)
    })
  }

  function insertHtml(html: string) {
    editorRef.current?.focus()
    exec("insertHTML", html)
  }

  function insertPageBreak() {
    insertHtml('<div class="dimpro-page-break" contenteditable="false"><span>Oldaltörés</span></div><p><br></p>')
  }

  function insertTable() {
    insertHtml(`
      <table class="dimpro-doc-table">
        <tbody>
          <tr><th>Leírás</th><th>Felelős</th><th>Határidő</th><th>Státusz</th></tr>
          <tr><td>Új feladat</td><td>Felelős neve</td><td>${date}</td><td>Tervezett</td></tr>
          <tr><td>Új feladat</td><td>Felelős neve</td><td>${date}</td><td>Nyitott</td></tr>
        </tbody>
      </table>
    `)
  }

  function addParticipantRow() {
    const tableBody = editorRef.current?.querySelector("[data-participants-table] tbody")
    if (!tableBody) return
    const targetId = `participant-sig-${Date.now()}`
    const row = document.createElement("tr")
    row.innerHTML = `<td>Új résztvevő</td><td>Cég / szervezet</td><td>Szerepkör</td><td>${createSignatureButton(targetId)}</td>`
    tableBody.appendChild(row)
  }

  function handleEditorClick(event: React.MouseEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement
    const signatureButton = target.closest("[data-signature-target]") as HTMLElement | null
    if (!signatureButton) return
    event.preventDefault()
    event.stopPropagation()
    openSignaturePad(signatureButton.dataset.signatureTarget || undefined, signatureButton)
  }

  function insertLockedTemplate() {
    insertHtml(`
      <section class="dimpro-locked-template" contenteditable="${templateEditMode ? "true" : "false"}" draggable="false">
        <div class="dimpro-locked-label">ZÁROLT SABLONRÉSZ</div>
        <div class="dimpro-locked-title">Kooperációs jegyzőkönyv törzsadatok</div>
        <div class="dimpro-locked-grid">
          <span>Projekt neve:</span><strong>Metrodom Park – 3. épület</strong>
          <span>Projekt címe:</span><strong>1117 Budapest, Galvani utca 12.</strong>
          <span>Beruházó:</span><strong>Metrodom Kft.</strong>
          <span>Kivitelező:</span><strong>ÉPÍTŐ Kft.</strong>
          <span>Tárgy / Téma:</span><strong>Heti FMV kooperáció</strong>
        </div>
      </section>
      <p><br></p>
    `)
  }

  function downloadHtml() {
    const body = pageRef.current?.outerHTML || editorRef.current?.innerHTML || ""
    const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(documentNumber)}</title></head><body>${body}</body></html>`
    const blob = new Blob([html], { type: "text/html;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `${documentNumber}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  function getPdfHtml() {
    const page = pageRef.current?.cloneNode(true) as HTMLElement | null
    if (!page) return ""
    page.querySelectorAll("[contenteditable]").forEach((node) => node.removeAttribute("contenteditable"))
    page.querySelectorAll(".dimpro-page-break span").forEach((node) => node.remove())
    return page.outerHTML
  }

  function buildPrintableDocument() {
    const printableHtml = getPdfHtml()
    return `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${escapeHtml(documentNumber)}</title><style>${getPdfCss()}</style></head><body>${printableHtml}</body></html>`
  }

  function openPrintFallback() {
    const doc = buildPrintableDocument()
    const win = window.open("about:blank", "_blank")
    if (!win) {
      setHtmlPreviewDoc(doc)
      setPdfPreviewOpen(true)
      setPdfPreviewError("A böngésző blokkolta az új nyomtatási ablakot. Az előnézeti ablakból indítható a nyomtatás.")
      return
    }
    win.document.open()
    win.document.write(doc)
    win.document.close()
    win.focus()
    setTimeout(() => {
      try { win.print() } catch {}
    }, 500)
  }

  async function generatePdfBlob() {
    const printableHtml = getPdfHtml()
    if (!printableHtml) throw new Error("Nincs exportálható jegyzőkönyv tartalom.")

    const response = await fetch("/api/minutes/pdf-export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ html: printableHtml, filename: `${documentNumber}.pdf`, title: documentNumber }),
    })

    if (!response.ok) {
      const text = await response.text().catch(() => "")
      throw new Error(text || "PDF export hiba")
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.includes("application/pdf")) throw new Error("A szerver nem PDF választ adott.")

    return response.blob()
  }

  async function exportPdf() {
    setIsExportingPdf(true)
    try {
      const blob = await generatePdfBlob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `${documentNumber}.pdf`
      a.click()
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error("Gotenberg PDF export hiba:", error)
      setPdfPreviewError(error instanceof Error ? error.message : "PDF export hiba")
      openPrintFallback()
    } finally {
      setIsExportingPdf(false)
    }
  }

  async function openPdfPreview() {
    setPdfPreviewOpen(true)
    setPdfPreviewError(null)
    setIsExportingPdf(true)
    try {
      const blob = await generatePdfBlob()
      const url = URL.createObjectURL(blob)
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl)
      setHtmlPreviewDoc(null)
      setPdfPreviewUrl(url)
    } catch (error) {
      console.error("PDF előnézet hiba:", error)
      setPdfPreviewUrl(null)
      setHtmlPreviewDoc(buildPrintableDocument())
      setPdfPreviewError(error instanceof Error ? error.message : "PDF előnézet nem elérhető")
    } finally {
      setIsExportingPdf(false)
    }
  }

  function printPdfPreview() {
    if (!pdfPreviewUrl) {
      const iframe = document.querySelector<HTMLIFrameElement>("iframe[title='HTML nyomtatási előnézet']")
      if (iframe?.contentWindow) {
        iframe.contentWindow.focus()
        iframe.contentWindow.print()
        return
      }
      openPrintFallback()
      return
    }
    const win = window.open(pdfPreviewUrl, "_blank")
    if (!win) return
    setTimeout(() => {
      try { win.print() } catch {}
    }, 700)
  }

  function emailDocument() {
    const subject = encodeURIComponent(`${documentNumber} jegyzőkönyv`)
    const body = encodeURIComponent(`A ${documentNumber} azonosítójú jegyzőkönyv elkészült.\n\nPDF export után csatolja a PDF fájlt az emailhez.`)
    setEmailStatus("Megnyílt az email kliens. A PDF-et exportálás után csatolja.")
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  function preventLockedTemplateEdit(event: React.KeyboardEvent<HTMLDivElement>) {
    if (templateEditMode) return
    const selection = window.getSelection()
    if (!selection?.anchorNode) return
    const element = selection.anchorNode.nodeType === Node.ELEMENT_NODE ? selection.anchorNode as Element : selection.anchorNode.parentElement
    if (element?.closest(".dimpro-locked-template")) event.preventDefault()
  }

  function canvasPoint(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: event.clientX - rect.left, y: event.clientY - rect.top }
  }

  function startSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = signatureCanvasRef.current
    const point = canvasPoint(event)
    if (!canvas || !point) return
    drawingRef.current = true
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext("2d")
    if (!context) return
    context.strokeStyle = "#1d4ed8"
    context.lineWidth = 2.4
    context.lineCap = "round"
    context.beginPath()
    context.moveTo(point.x, point.y)
  }

  function drawSignature(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    const canvas = signatureCanvasRef.current
    const point = canvasPoint(event)
    if (!canvas || !point) return
    const context = canvas.getContext("2d")
    if (!context) return
    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function stopSignature() {
    drawingRef.current = false
  }

  function clearSignature() {
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height)
  }

  function insertSignature() {
    const canvas = signatureCanvasRef.current
    if (!canvas) return
    const dataUrl = canvas.toDataURL("image/png")
    if (signatureTargetId) {
      setSignatures((current) => ({ ...current, [signatureTargetId]: dataUrl }))
      const target = signatureTargetElementRef.current || document.querySelector(`[data-signature-target="${signatureTargetId}"]`)
      if (target) {
        target.innerHTML = `<img src="${dataUrl}" alt="Aláírás" class="dimpro-signature-image" />`
        target.classList.add("is-signed")
        target.setAttribute("aria-label", "Aláírt mező")
      }
    } else {
      insertHtml(`<img src="${dataUrl}" alt="Aláírás" class="dimpro-signature-image" />`)
    }
    setSignatureOpen(false)
    setSignatureTargetId(null)
    signatureTargetElementRef.current = null
  }

  function openSignaturePad(targetId?: string, element?: HTMLElement | null) {
    signatureTargetElementRef.current = element || null
    setSignatureTargetId(targetId || null)
    setSignatureOpen(true)
    setTimeout(() => clearSignature(), 0)
  }

  function startHelpDrag(event: React.PointerEvent<HTMLDivElement>) {
    helpDragRef.current = { x: event.clientX, y: event.clientY, left: helpPosition.left, top: helpPosition.top }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function moveHelpDrag(event: React.PointerEvent<HTMLDivElement>) {
    if (!helpDragRef.current) return
    setHelpPosition({
      left: Math.max(8, helpDragRef.current.left + event.clientX - helpDragRef.current.x),
      top: Math.max(8, helpDragRef.current.top + event.clientY - helpDragRef.current.y),
    })
  }

  function stopHelpDrag() {
    helpDragRef.current = null
  }

  return (
    <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-white px-5 py-4">
        <div className="mb-4 grid grid-cols-1 gap-3 lg:grid-cols-[1.2fr_1fr_0.7fr_1fr_1fr_auto]">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Jegyzőkönyv típus
            <select value={protocolType} onChange={(e) => setProtocolType(e.target.value as ProtocolType)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case text-slate-800">
              {Object.entries(protocolLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Sorszám
            <input value={documentNumber} readOnly className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-bold normal-case text-slate-900" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Verzió
            <input value={version} onChange={(e) => setVersion(e.target.value.toUpperCase())} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-800" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Dátum
            <input value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm normal-case text-slate-800" />
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Státusz
            <select value={status} onChange={(e) => setStatus(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium normal-case text-slate-800">
              <option>Végleges</option><option>Folyamatban</option><option>Tervezett</option><option>Nyitott</option>
            </select>
          </label>
          <button onClick={() => saveSerial(serialNumber + 1)} className="self-end rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700">Következő sorszám</button>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl bg-slate-50 p-3">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">QR
            <select value={qrEnabled ? "yes" : "no"} onChange={(e) => setQrEnabled(e.target.value === "yes")} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm normal-case text-slate-800">
              <option value="yes">Bekapcsolva</option><option value="no">Kikapcsolva</option>
            </select>
          </label>
          <label className="text-xs font-bold uppercase tracking-wide text-slate-500">Nagyítás
            <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="ml-2 rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm normal-case text-slate-800">
              {[60, 75, 90, 100, 110, 125, 150].map((item) => <option key={item} value={item}>{item}%</option>)}
            </select>
          </label>
          <button onClick={() => setTemplateEditMode((value) => !value)} className={templateEditMode ? "dimpro-toolbar-btn bg-amber-50 text-amber-700" : "dimpro-toolbar-btn"}>{templateEditMode ? "Sablonszerkesztő aktív" : "Sablonszerkesztő mód"}</button>
          <button onClick={() => openSignaturePad()} className="dimpro-toolbar-btn">Aláírás bevitel</button>
          <button onClick={openPdfPreview} className="dimpro-toolbar-btn">{isExportingPdf ? "PDF készül..." : "PDF előnézet"}</button>
          <button onClick={exportPdf} className="dimpro-toolbar-btn">PDF mentés</button>
          <button onClick={openPrintFallback} className="dimpro-toolbar-btn">Nyomtatás</button>
          <button onClick={emailDocument} className="dimpro-toolbar-btn">Email küldés</button>
          <button onClick={() => setHelpOpen((value) => !value)} className="dimpro-toolbar-btn">Súgó</button>
          <button onClick={() => setZoom(100)} className="dimpro-toolbar-btn">100%</button>
          <span className="text-xs font-semibold text-slate-500">Ctrl+Alt+görgetés / Ctrl+Alt +/- / Ctrl+Alt+0</span>
        </div>

        <div className="flex flex-wrap gap-2">
          <button onClick={() => exec("undo")} className="dimpro-toolbar-btn">Vissza</button>
          <button onClick={() => exec("redo")} className="dimpro-toolbar-btn">Újra</button>
          <select value={fontFamily} onChange={(e) => applyFontFamily(e.target.value)} className="dimpro-toolbar-select">
            <option value="Arial">Arial</option><option value="Times New Roman">Times New Roman</option><option value="Calibri">Calibri</option><option value="Georgia">Georgia</option><option value="Courier New">Courier New</option>
          </select>
          <select value={fontSize} onChange={(e) => applyFontSize(e.target.value)} className="dimpro-toolbar-select">
            {["9pt", "10pt", "11pt", "12pt", "14pt", "16pt", "18pt", "24pt"].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
          <button onClick={() => exec("bold")} className="dimpro-toolbar-btn font-bold">B</button>
          <button onClick={() => exec("italic")} className="dimpro-toolbar-btn italic">I</button>
          <button onClick={() => exec("underline")} className="dimpro-toolbar-btn underline">U</button>
          <button onClick={() => exec("strikeThrough")} className="dimpro-toolbar-btn line-through">S</button>
          <button onClick={() => exec("justifyLeft")} className="dimpro-toolbar-btn">Balra</button>
          <button onClick={() => exec("justifyCenter")} className="dimpro-toolbar-btn">Közép</button>
          <button onClick={() => exec("justifyRight")} className="dimpro-toolbar-btn">Jobbra</button>
          <button onClick={() => exec("insertUnorderedList")} className="dimpro-toolbar-btn">Felsorolás</button>
          <button onClick={() => exec("insertOrderedList")} className="dimpro-toolbar-btn">Sorszámozás</button>
          <button onClick={insertTable} className="dimpro-toolbar-btn">Táblázat</button>
          <button onClick={addParticipantRow} className="dimpro-toolbar-btn">Résztvevő sor +</button>
          <button onClick={insertPageBreak} className="dimpro-toolbar-btn">Oldaltörés</button>
          <button onClick={insertLockedTemplate} className="dimpro-toolbar-btn">Zárolt sablon</button>
          <button onClick={downloadHtml} className="dimpro-toolbar-btn">HTML mentés</button>
        </div>

        {helpOpen && (
          <div className="dimpro-help-modal" style={{ left: helpPosition.left, top: helpPosition.top }}>
            <div className="dimpro-help-modal-header" onPointerDown={startHelpDrag} onPointerMove={moveHelpDrag} onPointerUp={stopHelpDrag} onPointerCancel={stopHelpDrag}>
              <strong>Jegyzőkönyv szerkesztő súgó</strong>
              <button type="button" onClick={() => setHelpOpen(false)}>Bezárás</button>
            </div>
            <div className="dimpro-help-modal-body">
              <p><strong>Nagyítás:</strong> Ctrl + Alt + egérgörgetés, Ctrl + Alt + +, Ctrl + Alt + -, Ctrl + Alt + 0.</p>
              <p><strong>Aláírás:</strong> kattintson az aláírásmezőre, rajzolja be, majd „Aláírás beszúrása”.</p>
              <p><strong>Sablonszerkesztő mód:</strong> a fix fejléc és projektadat mezők csak ebben módosíthatók.</p>
              <p><strong>PDF:</strong> a PDF mentés csak az A4 jegyzőkönyv sablont exportálja, nem a teljes oldalt.</p>
              <p><strong>Ablak:</strong> a fejlécénél fogva mozgatható, a jobb alsó saroknál méretezhető.</p>
            </div>
          </div>
        )}

        {signatureOpen && (
          <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-2 text-sm font-bold text-slate-700">Aláírás rögzítése{signatureTargetId ? " a kiválasztott aláírásmezőbe" : ""}</div>
            <canvas ref={signatureCanvasRef} width={520} height={150} onPointerDown={startSignature} onPointerMove={drawSignature} onPointerUp={stopSignature} onPointerLeave={stopSignature} className="h-[150px] w-full max-w-[520px] touch-none rounded-xl border border-slate-300 bg-white" />
            <div className="mt-3 flex gap-2"><button onClick={insertSignature} className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Aláírás beszúrása</button><button onClick={clearSignature} className="dimpro-toolbar-btn">Törlés</button></div>
          </div>
        )}
        {emailStatus && <div className="mt-3 rounded-xl bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700">{emailStatus}</div>}
      </div>



        {pdfPreviewOpen && (
          <div className="dimpro-pdf-preview-modal">
            <div className="dimpro-pdf-preview-header">
              <div>
                <strong>PDF előnézet</strong>
                <span>{documentNumber}</span>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={printPdfPreview}>Nyomtatás</button>
                {pdfPreviewUrl && <a href={pdfPreviewUrl} download={`${documentNumber}.pdf`}>Letöltés</a>}
                <button type="button" onClick={() => setPdfPreviewOpen(false)}>Bezárás</button>
              </div>
            </div>
            <div className="dimpro-pdf-preview-body">
              {pdfPreviewUrl ? (
                <iframe src={pdfPreviewUrl} title="PDF előnézet" />
              ) : htmlPreviewDoc ? (
                <div className="dimpro-html-preview-wrap">
                  <div className="dimpro-pdf-preview-warning">
                    <strong>A Gotenberg PDF szolgáltatás nem fut, ezért HTML nyomtatási előnézet látható.</strong>
                    <span>{pdfPreviewError}</span>
                  </div>
                  <iframe srcDoc={htmlPreviewDoc} title="HTML nyomtatási előnézet" />
                </div>
              ) : (
                <div className="dimpro-pdf-preview-error">
                  <strong>PDF előnézet jelenleg nem érhető el.</strong>
                  <p>{pdfPreviewError || "A Gotenberg szolgáltatás nem válaszolt. Használható a tiszta nyomtatási fallback."}</p>
                  <button type="button" onClick={openPrintFallback}>Tiszta nyomtatási nézet megnyitása</button>
                </div>
              )}
            </div>
          </div>
        )}

      <div ref={scrollRef} className="dimpro-editor-scroll bg-slate-100">
        <div className="dimpro-zoom-stage" style={{ width: `calc(210mm * ${zoom / 100})`, minWidth: `calc(210mm * ${zoom / 100})`, height: `calc(297mm * ${zoom / 100})` }}>
          <article ref={pageRef} className={templateEditMode ? "dimpro-a4-page dimpro-template-edit-active" : "dimpro-a4-page dimpro-template-locked"} style={{ transform: `scale(${zoom / 100})` }}>
            <div className="dimpro-doc-head">
              <div className="dimpro-logo-box" contentEditable={templateEditMode} suppressContentEditableWarning><div className="dimpro-logo-mark">É</div><div><strong>ÉPÍTŐ KFT.</strong><span>GENERÁLKIVITELEZÉS</span></div></div>
              <h2 contentEditable={templateEditMode} suppressContentEditableWarning>KOOPERÁCIÓS JEGYZŐKÖNYV</h2>
              <strong className="text-blue-900" data-template-readonly="true">{documentNumber}</strong>
            </div>

            <div className="mt-6 grid grid-cols-[1fr_260px] gap-5">
              <table className="dimpro-doc-table"><tbody>
                <tr><th>Projekt neve:</th><td contentEditable={templateEditMode} suppressContentEditableWarning>Metrodom Park – 3. épület</td></tr>
                <tr><th>Projekt címe:</th><td contentEditable={templateEditMode} suppressContentEditableWarning>1117 Budapest, Galvani utca 12.</td></tr>
                <tr><th>Beruházó:</th><td contentEditable={templateEditMode} suppressContentEditableWarning>Metrodom Kft.</td></tr>
                <tr><th>Kivitelező:</th><td contentEditable={templateEditMode} suppressContentEditableWarning>ÉPÍTŐ Kft.</td></tr>
                <tr><th>Tárgy / Téma:</th><td contentEditable={templateEditMode} suppressContentEditableWarning>HETI FMV KOOPERÁCIÓ</td></tr>
                <tr><th>Helyszín:</th><td contentEditable={templateEditMode} suppressContentEditableWarning>Projekt iroda / Tárgyaló 1.</td></tr>
                <tr><th>Időpont:</th><td data-template-readonly="true">{date} 09:00 – 10:30</td></tr>
              </tbody></table>
              <div><table className="dimpro-doc-table"><tbody>
                <tr><th colSpan={2}>DOKUMENTUM AZONOSÍTÓ</th></tr>
                <tr><th>Sorszám:</th><td data-template-readonly="true">{documentNumber}</td></tr><tr><th>Verzió:</th><td data-template-readonly="true">{version}</td></tr><tr><th>Dátum:</th><td data-template-readonly="true">{date}</td></tr>
                <tr><th>Státusz:</th><td><span className={`rounded-full px-3 py-1 text-xs font-bold ${statusBadge(status)}`}>{status}</span></td></tr>
              </tbody></table>{qrEnabled && <div className="mt-4 flex flex-col items-center gap-2"><QrPreview value={qrValue} /><span className="text-[10px] font-semibold text-slate-600">Ellenőrizze a dokumentum hitelességét!</span></div>}</div>
            </div>

            <div ref={editorRef} contentEditable suppressContentEditableWarning onClick={handleEditorClick} onKeyDown={preventLockedTemplateEdit} className="dimpro-editor-content mt-10">
              <h3>1. RÉSZTVEVŐK</h3>
              <table className="dimpro-doc-table" data-participants-table="true"><tbody><tr><th>Név</th><th>Cég / Szervezet</th><th>Szerepkör</th><th>Aláírás</th></tr>{defaultParticipants.map((row, rowIndex) => <tr key={row.join("-")}>{row.slice(0, 3).map((cell, i) => <td key={i}>{cell || " "}</td>)}<td><SignatureSlot id={`participant-sig-${rowIndex + 1}`} image={signatures[`participant-sig-${rowIndex + 1}`]} onOpen={openSignaturePad} /></td></tr>)}</tbody></table>
              <h3>2. NAPIREND</h3><ol><li>Előző heti feladatok áttekintése</li><li>Aktuális kivitelezési állapot</li><li>Nyitott műszaki kérdések</li><li>Határidők és felelősök egyeztetése</li><li>Következő heti munkák</li><li>Egyebek</li></ol>
              <h3>3. MEGBESZÉLÉS ÖSSZEFOGLALÓJA</h3>
              <table className="dimpro-doc-table"><tbody><tr><th>Napirendi pont</th><th>Téma</th><th>Megállapítás / Döntés</th><th>Felelős</th><th>Határidő</th></tr><tr><td>1.</td><td>Előző heti feladatok áttekintése</td><td>A 18. heti feladatok 80%-a teljesült.</td><td>Nagy Péter</td><td>{date}</td></tr><tr><td>2.</td><td>Aktuális kivitelezési állapot</td><td>Szerkezetkész állapot elérve a 3. épületnél.</td><td>Nagy Péter</td><td>–</td></tr><tr><td>3.</td><td>Nyitott műszaki kérdések</td><td>Homlokzati részletek egyeztetése szükséges.</td><td>Tóth Gábor</td><td>{date}</td></tr></tbody></table>
              <div className="dimpro-page-break" contentEditable={false}><span>Oldaltörés</span></div>
              <h3>4. FELADATOK ÉS HATÁRIDŐK</h3>
              <table className="dimpro-doc-table"><tbody><tr><th>Feladat leírása</th><th>Felelős</th><th>Határidő</th><th>Státusz</th><th>Megjegyzés</th></tr><tr><td>Homlokzati hőszigetelés csomópontok egyeztetése</td><td>Tóth Gábor</td><td>2024.05.17.</td><td>Folyamatban</td><td>Tervezői válasz szükséges</td></tr><tr><td>Liftakna tűzvédelmi kialakítás pontosítása</td><td>Tóth Gábor</td><td>2024.05.17.</td><td>Folyamatban</td><td>Tűzvédelmi terv módosítása</td></tr><tr><td>Gépészeti alapszerelés anyagigény leadása</td><td>Szabó Anna</td><td>2024.05.13.</td><td>Tervezett</td><td>Beszerzés indítása</td></tr></tbody></table>
              <h3>5. NYITOTT KÉRDÉSEK</h3><table className="dimpro-doc-table"><tbody><tr><th>Kérdés leírása</th><th>Érintett</th><th>Következő lépés</th><th>Határidő</th></tr><tr><td>Homlokzati hőszigetelés csomópontok részletezése</td><td>Tervező, Kivitelező, FMV</td><td>Tervezői egyeztetés</td><td>2024.05.17.</td></tr><tr><td>Liftakna tűzvédelmi kialakítás</td><td>Tervező, Kivitelező</td><td>Tűzvédelmi szakági egyeztetés</td><td>2024.05.17.</td></tr></tbody></table>
              <h3>6. CSATOLT MELLÉKLETEK</h3><table className="dimpro-doc-table"><tbody><tr><th>Melléklet azonosító</th><th>Leírás</th><th>Fájl neve</th><th>Verzió</th></tr><tr><td>K-019-01-A</td><td>Jelenléti ív</td><td>Jelenleti_iv_20240510.pdf</td><td>A</td></tr><tr><td>K-019-02-A</td><td>Heti fotódokumentáció</td><td>Fotodokumentacio_20240510.pdf</td><td>A</td></tr></tbody></table>
              <h3>7. JÓVÁHAGYÁS</h3><p>A jegyzőkönyv tartalmát a jelenlévők elfogadják és jóváhagyják.</p><table className="dimpro-doc-table dimpro-sign-table"><tbody><tr><td><SignatureSlot id="sig-1" image={signatures["sig-1"]} onOpen={openSignaturePad} /><br />Kovács István<br /><strong>Beruházói képviselő</strong></td><td><SignatureSlot id="sig-2" image={signatures["sig-2"]} onOpen={openSignaturePad} /><br />Nagy Péter<br /><strong>Projektvezető</strong></td><td><SignatureSlot id="sig-3" image={signatures["sig-3"]} onOpen={openSignaturePad} /><br />Szabó Anna<br /><strong>FMV koordinátor</strong></td></tr></tbody></table>
            </div>
            <div className="dimpro-doc-foot"><span>{documentNumber}</span><span>1 / bővíthető</span><span>{date}</span></div>
          </article>
        </div>
      </div>
    </div>
  )
}

function getPdfCss() {
  return `@page{size:A4;margin:0}body{margin:0;background:white;font-family:Arial,sans-serif}.dimpro-a4-page{width:210mm;min-height:297mm;background:white;padding:14mm;color:#0f172a;box-shadow:none;position:relative}.dimpro-a4-page:before{display:none}.dimpro-doc-head{display:grid;grid-template-columns:1.1fr 1.6fr 1fr;align-items:center;gap:16px;border-bottom:1px solid #cbd5e1;padding-bottom:12px}.dimpro-doc-head h2{text-align:center;font-size:21px;font-weight:900}.dimpro-logo-box{display:flex;align-items:center;gap:10px;border-right:1px solid #cbd5e1;padding-right:12px}.dimpro-logo-box span{display:block;font-size:9px;font-weight:700;color:#64748b}.dimpro-logo-mark{display:grid;height:36px;width:36px;place-items:center;border:2px solid #1d4ed8;color:#1d4ed8;font-weight:900}.dimpro-doc-table{width:100%;border-collapse:collapse;font-size:11px;line-height:1.35}.dimpro-doc-table th,.dimpro-doc-table td{border:1px solid #cbd5e1;padding:8px 9px;vertical-align:top}.dimpro-doc-table th{background:#f8fafc;font-weight:800;color:#0f172a}.dimpro-editor-content{outline:none;font-size:12pt;line-height:1.55}.dimpro-editor-content h3{margin:22px 0 10px;color:#0f2f66;font-size:14px;font-weight:900}.dimpro-page-break{break-before:page;page-break-before:always;border:none;margin:0;height:0}.dimpro-signature-image{max-width:180px;max-height:70px}.dimpro-doc-foot{margin-top:18px;display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:10px;font-size:11px;font-weight:700}`
}
