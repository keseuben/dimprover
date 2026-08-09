import { NextRequest } from "next/server"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
}

function toAsciiFilename(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90) || "dimpro-jegyzokonyv.pdf"
}

const pdfCss = `
@page{size:A4;margin:0}
body{margin:0;background:white;font-family:Arial,sans-serif;color:#0f172a}
.dimpro-a4-page{width:210mm;min-height:297mm;background:white;padding:14mm;color:#0f172a;box-shadow:none;position:relative;box-sizing:border-box}
.dimpro-a4-page:before{display:none!important}
.dimpro-doc-head{display:grid;grid-template-columns:1.1fr 1.6fr 1fr;align-items:center;gap:16px;border-bottom:1px solid #cbd5e1;padding-bottom:12px}
.dimpro-doc-head h2{text-align:center;font-size:21px;font-weight:900;letter-spacing:-.02em;margin:0}
.dimpro-logo-box{display:flex;align-items:center;gap:10px;border-right:1px solid #cbd5e1;padding-right:12px}
.dimpro-logo-box span{display:block;font-size:9px;font-weight:700;color:#64748b}
.dimpro-logo-mark{display:grid;height:36px;width:36px;place-items:center;border:2px solid #1d4ed8;color:#1d4ed8;font-weight:900}
.dimpro-doc-table{width:100%;border-collapse:collapse;font-size:11px;line-height:1.35}
.dimpro-doc-table th,.dimpro-doc-table td{border:1px solid #cbd5e1;padding:8px 9px;vertical-align:top}
.dimpro-doc-table th{background:#f8fafc;font-weight:800;color:#0f172a}
.dimpro-editor-content{outline:none;font-size:12pt;line-height:1.55}
.dimpro-editor-content h3{margin:22px 0 10px;color:#0f2f66;font-size:14px;font-weight:900;letter-spacing:.02em}
.dimpro-editor-content ol{margin:0 0 12px 20px;padding-left:14px}
.dimpro-page-break{break-before:page;page-break-before:always;border:none!important;margin:0!important;height:0!important}
.dimpro-page-break span{display:none!important}
.dimpro-signature-image{max-width:180px;max-height:70px}
.dimpro-sign-table td{height:70px;text-align:center;vertical-align:bottom}
.dimpro-doc-foot{margin-top:18px;display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:10px;font-size:11px;font-weight:700}
.grid{display:grid}.flex{display:flex}.items-center{align-items:center}.text-blue-900{color:#1e3a8a}.mt-4{margin-top:1rem}.mt-6{margin-top:1.5rem}.mt-10{margin-top:2.5rem}.gap-2{gap:.5rem}.gap-5{gap:1.25rem}.flex-col{flex-direction:column}.rounded-full{border-radius:999px}.px-3{padding-left:.75rem;padding-right:.75rem}.py-1{padding-top:.25rem;padding-bottom:.25rem}.text-xs{font-size:.75rem}.font-bold{font-weight:700}.bg-blue-100{background:#dbeafe}.text-blue-700{color:#1d4ed8}.bg-sky-100{background:#e0f2fe}.text-sky-700{color:#0369a1}.bg-orange-100{background:#ffedd5}.text-orange-700{color:#c2410c}.bg-emerald-100{background:#d1fae5}.text-emerald-700{color:#047857}
`

async function renderWithGotenberg(html: string, gotenbergUrl: string, showPageNumbers = false) {
  const formData = new FormData()
  formData.append("files", new Blob([html], { type: "text/html" }), "index.html")
  formData.append("paperWidth", "8.27")
  formData.append("paperHeight", "11.69")
  formData.append("marginTop", "0")
  formData.append("marginBottom", "0")
  formData.append("marginLeft", "0")
  formData.append("marginRight", "0")
  formData.append("preferCssPageSize", "true")
  formData.append("printBackground", "true")
  if (showPageNumbers) {
    formData.append("marginBottom", "0.45")
    formData.append("footerHtml", `
      <html>
        <head>
          <style>
            body{margin:0;font-family:Arial,sans-serif;color:#64748b;font-size:9px}
            .footer{width:100%;display:flex;justify-content:center;align-items:center;padding-top:4px;border-top:1px solid #cbd5e1}
            .footer span{font-weight:700}.page-pill{display:inline-grid;place-items:center;min-width:18px;height:12px;border:1px solid #64748b;border-radius:999px;margin:0 3px;color:#0f172a}
          </style>
        </head>
        <body><div class="footer"><span class="page-pill"><span class="pageNumber"></span></span> / <span class="totalPages"></span> oldal</div></body>
      </html>
    `)
  }

  const response = await fetch(`${gotenbergUrl.replace(/\/$/, "")}/forms/chromium/convert/html`, {
    method: "POST",
    body: formData,
  })

  const contentType = response.headers.get("content-type") || ""
  if (!response.ok || !contentType.includes("application/pdf")) {
    const errorText = await response.text().catch(() => "Gotenberg export failed")
    throw new Error(`Gotenberg nem adott PDF választ. URL: ${gotenbergUrl}. Válasz: ${errorText.slice(0, 500)}`)
  }

  return response.arrayBuffer()
}

async function renderWithPuppeteer(html: string, showPageNumbers = false): Promise<ArrayBuffer> {
  const puppeteer = await import("puppeteer")
  const browser = await puppeteer.default.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
  })

  try {
    const page = await browser.newPage()
    await page.setContent(html, { waitUntil: "load" })
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      displayHeaderFooter: showPageNumbers,
      headerTemplate: showPageNumbers ? "<span></span>" : undefined,
      footerTemplate: showPageNumbers
        ? `<div style="width:100%;font-family:Arial,sans-serif;font-size:9px;color:#64748b;text-align:center;border-top:1px solid #cbd5e1;margin:0 10mm;padding-top:4px;font-weight:700;"><span style="display:inline-grid;place-items:center;min-width:18px;height:12px;border:1px solid #64748b;border-radius:999px;margin:0 3px;color:#0f172a;"><span class="pageNumber"></span></span> / <span class="totalPages"></span> oldal</div>`
        : undefined,
      margin: showPageNumbers
        ? { top: "0mm", right: "0mm", bottom: "10mm", left: "0mm" }
        : { top: "0mm", right: "0mm", bottom: "0mm", left: "0mm" },
      preferCSSPageSize: true,
    })
    const copy = new Uint8Array(pdf.byteLength)
    copy.set(pdf)
    return copy.buffer
  } finally {
    await browser.close()
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch((error) => {
    console.error("PDF JSON parse error", error)
    return null
  }) as null | { html?: string; filename?: string; title?: string; showPageNumbers?: boolean }
  if (!body?.html) return new Response("Missing HTML or request body too large", { status: 400 })

  const gotenbergUrl = process.env.GOTENBERG_URL || "http://127.0.0.1:3001"
  const title = escapeHtml(body.title || "DIMPRO jegyzőkönyv")
  const showPageNumbers = Boolean(body.showPageNumbers)
  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><title>${title}</title><style>${pdfCss}</style></head><body>${body.html}</body></html>`

  let pdf: ArrayBuffer
  try {
    pdf = await renderWithGotenberg(html, gotenbergUrl, showPageNumbers)
  } catch (gotenbergError) {
    try {
      pdf = await renderWithPuppeteer(html, showPageNumbers)
    } catch (puppeteerError) {
      const gotenbergMessage = gotenbergError instanceof Error ? gotenbergError.message : "Gotenberg export hiba"
      const puppeteerMessage = puppeteerError instanceof Error ? puppeteerError.message : "Puppeteer export hiba"
      return new Response(`PDF export hiba. ${gotenbergMessage}. Tartalék Puppeteer hiba: ${puppeteerMessage}`, { status: 502 })
    }
  }

  const filename = toAsciiFilename(body.filename || "dimpro-jegyzokonyv.pdf")

  return new Response(pdf, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  })
}
