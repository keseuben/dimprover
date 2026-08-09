import type { EnergyCertificateMinimalSummary } from "./energyCertificatePrivacy";

export type EnergyCertificateExtractionStatus = "success" | "partial" | "failed";

export type EnergyCertificateExtractionResult = {
  fileName: string;
  fileSize: number;
  pageCount: number;
  extractedAt: string;
  status: EnergyCertificateExtractionStatus;
  summary: EnergyCertificateMinimalSummary;
  confidence: number;
  matchedFields: string[];
  missingFields: string[];
  warnings: string[];
  privacy: {
    originalPdfStored: false;
    originalPdfIncludedInResponse: false;
    originalPdfDeletedAfterProcessing: true;
    personalDataRemoved: true;
    aiReadyPayloadContainsOriginalPdf: false;
  };
};

type PdfTextItem = { str?: string };

type PdfJsDocument = {
  numPages: number;
  getPage(pageNumber: number): Promise<{
    getTextContent(): Promise<{ items: PdfTextItem[] }>;
  }>;
  destroy?: () => Promise<void> | void;
};

const FIELD_LABELS: Record<keyof EnergyCertificateMinimalSummary, string> = {
  hetId: "HET azonosító",
  validUntil: "Érvényességi dátum",
  propertyType: "Ingatlan típusa",
  usefulFloorArea: "Hasznos alapterület",
  roomCount: "Helyiségek száma",
  energyRating: "Energetikai besorolás",
  co2Rating: "CO2 besorolás",
  aggregatedEnergyPerformance: "Összesített energetikai jellemző",
  co2Emission: "CO2 kibocsátás",
  specificHeatLossCoefficient: "Fajlagos hőveszteség-tényező",
  modernizationSuggestions: "Fő korszerűsítési javaslatok",
  recommendedRenovationOrder: "Javasolt felújítási sorrend",
};

export async function extractEnergyCertificateText(data: Uint8Array): Promise<{ text: string; pageCount: number }> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs") as unknown as {
    GlobalWorkerOptions?: { workerSrc?: string };
    getDocument: (params: Record<string, unknown>) => { promise: Promise<unknown> };
  };
  if (pdfjs.GlobalWorkerOptions) {
    pdfjs.GlobalWorkerOptions.workerSrc = `${process.cwd()}/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs`;
  }
  const loadingTask = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
    disableWorker: true,
    disableFontFace: true,
    verbosity: 0,
  });

  const pdf = (await loadingTask.promise) as PdfJsDocument;
  const pages: string[] = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => item.str ?? "")
        .filter(Boolean)
        .join(" ");
      pages.push(pageText);
    }

    return {
      text: normalizeText(pages.join("\n")),
      pageCount: pdf.numPages,
    };
  } finally {
    await pdf.destroy?.();
  }
}

export function parseEnergyCertificateSummary(text: string): {
  summary: EnergyCertificateMinimalSummary;
  matchedFields: string[];
  missingFields: string[];
  confidence: number;
  warnings: string[];
} {
  const normalized = normalizeText(text);
  const lookupText = removeAccents(normalized);
  const summary: EnergyCertificateMinimalSummary = {
    hetId: extractHetId(lookupText),
    validUntil: matchFirst(lookupText, [
      /ervenyessegi\s+ido\s*[:\-]?\s*([0-9]{4}[\.\-\/ ]\s*[0-9]{1,2}[\.\-\/ ]\s*[0-9]{1,2})/i,
      /ervenyes\s*[:\-]?\s*([0-9]{4}[\.\-\/ ]\s*[0-9]{1,2}[\.\-\/ ]\s*[0-9]{1,2})/i,
      /([0-9]{4}[\.\-\/ ]\s*[0-9]{1,2}[\.\-\/ ]\s*[0-9]{1,2})\s*[-–]\s*ig/i,
    ]),
    propertyType: extractLabeledValue(lookupText, ["ingatlan tipusa", "rendeltetes", "epulet tipusa"], ["hasznos alapterulet", "futott alapterulet", "alapterulet", "energetikai besorolas", "co2 besorolas", "osszesitett energetikai jellemzo", "ep:"]),
    usefulFloorArea: parseHungarianNumber(matchFirst(lookupText, [
      /hasznos\s+alapterulet\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
      /futott\s+alapterulet\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
      /alapterulet\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)\s*m/i,
    ])),
    roomCount: parseHungarianNumber(matchFirst(lookupText, [
      /helyisegek\s+szama\s*[:\-]?\s*([0-9]+)/i,
      /szobak\s+szama\s*[:\-]?\s*([0-9]+)/i,
      /helyiseg\s*[:\-]?\s*([0-9]+)/i,
    ])),
    energyRating: matchFirst(lookupText, [
      /energetikai\s+besorolas\s*[:\-]?\s*([A-Z]{1,2}\+{0,2})/i,
      /minosegi\s+osztaly\s*[:\-]?\s*([A-Z]{1,2}\+{0,2})/i,
      /\b(AA\+\+|AA\+|AA|BB|CC|DD|EE|FF|GG|HH|II|JJ)\b/,
    ]),
    co2Rating: matchFirst(lookupText, [
      /co2\s+besorolas\s*[:\-]?\s*([A-Z]{1,2}\+{0,2})/i,
      /szen[- ]?dioxid\s+besorolas\s*[:\-]?\s*([A-Z]{1,2}\+{0,2})/i,
    ]),
    aggregatedEnergyPerformance: parseHungarianNumber(matchFirst(lookupText, [
      /osszesitett\s+energetikai\s+jellemzo\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
      /EP\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
      /energiaigény\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
    ])),
    co2Emission: parseHungarianNumber(matchFirst(lookupText, [
      /co2\s+kibocsatas\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
      /szen[- ]?dioxid\s+kibocsatas\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
    ])),
    specificHeatLossCoefficient: parseHungarianNumber(matchFirst(lookupText, [
      /fajlagos\s+hoveszteseg[- ]?tenyezo\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
      /q\s*[:\-]?\s*([0-9]+(?:[,.][0-9]+)?)/i,
    ])),
    modernizationSuggestions: extractSuggestions(lookupText),
    recommendedRenovationOrder: extractRenovationOrder(lookupText),
  };

  const matchedFields = Object.entries(summary)
    .filter(([, value]) => Array.isArray(value) ? value.length > 0 : value !== undefined && value !== "")
    .map(([key]) => FIELD_LABELS[key as keyof EnergyCertificateMinimalSummary]);

  const missingFields = Object.entries(FIELD_LABELS)
    .filter(([key]) => {
      const value = summary[key as keyof EnergyCertificateMinimalSummary];
      return Array.isArray(value) ? value.length === 0 : value === undefined || value === "";
    })
    .map(([, label]) => label);

  const confidence = Math.round((matchedFields.length / Object.keys(FIELD_LABELS).length) * 100);
  const warnings = buildWarnings(lookupText, missingFields);

  return { summary, matchedFields, missingFields, confidence, warnings };
}

export async function processEnergyCertificatePdf(
  fileName: string,
  fileSize: number,
  bytes: Uint8Array,
): Promise<EnergyCertificateExtractionResult> {
  const { text, pageCount } = await extractEnergyCertificateText(bytes);
  const parsed = parseEnergyCertificateSummary(text);
  const status: EnergyCertificateExtractionStatus =
    parsed.confidence >= 55 ? "success" : parsed.confidence >= 20 ? "partial" : "failed";

  return {
    fileName,
    fileSize,
    pageCount,
    extractedAt: new Date().toISOString(),
    status,
    summary: parsed.summary,
    confidence: parsed.confidence,
    matchedFields: parsed.matchedFields,
    missingFields: parsed.missingFields,
    warnings: parsed.warnings,
    privacy: {
      originalPdfStored: false,
      originalPdfIncludedInResponse: false,
      originalPdfDeletedAfterProcessing: true,
      personalDataRemoved: true,
      aiReadyPayloadContainsOriginalPdf: false,
    },
  };
}

function removeAccents(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\s*:\s*/g, ": ")
    .replace(/\s*\/\s*/g, "/")
    .trim();
}

function extractHetId(text: string) {
  const matches = text.match(/HET\s*[-: ]?\s*[0-9A-Z\/-]{6,}/gi) ?? [];
  const cleaned = matches
    .map((match) => cleanupValue(match).replace(/\s+/g, " "))
    .find((match) => /[0-9]/.test(match) && !/azonosito/i.test(match));
  return cleaned;
}

function extractLabeledValue(text: string, labels: string[], stopLabels: string[]) {
  const lowerText = text.toLocaleLowerCase("hu-HU");

  for (const label of labels) {
    const labelIndex = lowerText.indexOf(label.toLocaleLowerCase("hu-HU"));
    if (labelIndex === -1) continue;

    const afterLabelStart = labelIndex + label.length;
    let valueStart = afterLabelStart;
    const colonIndex = text.indexOf(":", afterLabelStart);
    if (colonIndex !== -1 && colonIndex - afterLabelStart < 6) {
      valueStart = colonIndex + 1;
    }

    let valueEnd = text.length;
    for (const stopLabel of stopLabels) {
      const stopIndex = lowerText.indexOf(stopLabel.toLocaleLowerCase("hu-HU"), valueStart);
      if (stopIndex !== -1 && stopIndex < valueEnd) {
        valueEnd = stopIndex;
      }
    }

    const value = cleanupValue(text.slice(valueStart, valueEnd));
    if (value.length >= 2) return value;
  }

  return undefined;
}

function matchFirst(text: string, patterns: RegExp[]) {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      return cleanupValue(match[1]);
    }
  }
  return undefined;
}

function cleanupValue(value: string) {
  return value
    .replace(/\s+/g, " ")
    .replace(/^[.:;\-–\s]+/, "")
    .replace(/[.:;\-–\s]+$/, "")
    .trim();
}

function parseHungarianNumber(value?: string) {
  if (!value) return undefined;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function extractSuggestions(text: string) {
  const candidates = [
    "homlokzati hőszigetelés",
    "padlásfödém hőszigetelés",
    "tető hőszigetelés",
    "nyílászárócsere",
    "fűtés korszerűsítés",
    "kazáncsere",
    "hőszivattyú",
    "napelem",
    "használati melegvíz korszerűsítés",
    "szellőzés korszerűsítés",
  ];

  return candidates.filter((candidate) => text.toLocaleLowerCase("hu-HU").includes(removeAccents(candidate).toLocaleLowerCase("hu-HU")));
}

function extractRenovationOrder(text: string) {
  const suggestions = extractSuggestions(text);
  const order = [
    "nyílászárócsere",
    "homlokzati hőszigetelés",
    "padlásfödém hőszigetelés",
    "tető hőszigetelés",
    "fűtés korszerűsítés",
    "hőszivattyú",
    "napelem",
  ];

  const ordered = order.filter((item) => suggestions.includes(item));
  const rest = suggestions.filter((item) => !ordered.includes(item));
  return [...ordered, ...rest];
}

function buildWarnings(text: string, missingFields: string[]) {
  const warnings: string[] = [];

  if (missingFields.length > 0) {
    warnings.push(`Nem minden energetikai mezőt sikerült automatikusan felismerni: ${missingFields.join(", ")}.`);
  }

  if (!text.toLocaleLowerCase("hu-HU").includes("het")) {
    warnings.push("A HET azonosító nem volt egyértelműen felismerhető a PDF szövegéből.");
  }

  if (text.length < 400) {
    warnings.push("A PDF-ből kevés szöveg volt kinyerhető. Lehetséges, hogy szkennelt dokumentum, amelyhez később OCR szükséges.");
  }

  return warnings;
}
