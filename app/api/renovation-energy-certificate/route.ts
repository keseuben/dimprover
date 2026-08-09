import { NextResponse } from "next/server";
import {
  buildEnergyCertificateAiPayload,
  resolveEnergyCertificateStorageMode,
  type EnergyCertificateConsentState,
} from "@/app/lib/renovation/energyCertificatePrivacy";
import { processEnergyCertificatePdf } from "@/app/lib/renovation/energyCertificateParser";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024;
const MAX_FILES_PER_REQUEST = 10;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const files = formData
      .getAll("files")
      .filter((item): item is File => item instanceof File);

    if (files.length === 0) {
      const singleFile = formData.get("file");
      if (singleFile instanceof File) {
        files.push(singleFile);
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Nem érkezett feldolgozható PDF fájl." },
        { status: 400 },
      );
    }

    if (files.length > MAX_FILES_PER_REQUEST) {
      return NextResponse.json(
        { ok: false, error: `Egyszerre legfeljebb ${MAX_FILES_PER_REQUEST} PDF dolgozható fel.` },
        { status: 400 },
      );
    }

    const consent = readConsentState(formData);
    const storageMode = resolveEnergyCertificateStorageMode(consent);

    const results = await Promise.all(
      files.map(async (file) => {
        if (!isPdfFile(file)) {
          return {
            fileName: file.name,
            fileSize: file.size,
            status: "failed" as const,
            error: "Csak PDF fájl tölthető fel energetikai tanúsítványként.",
          };
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
          return {
            fileName: file.name,
            fileSize: file.size,
            status: "failed" as const,
            error: "A PDF túl nagy. A jelenlegi MVP limit 15 MB fájlonként.",
          };
        }

        const arrayBuffer = await file.arrayBuffer();
        const bytes = new Uint8Array(arrayBuffer);
        const result = await processEnergyCertificatePdf(file.name, file.size, bytes);

        return {
          ...result,
          storageMode,
          consent,
          aiPayload: buildEnergyCertificateAiPayload(result.summary),
        };
      }),
    );

    const successCount = results.filter((result) => result.status === "success" || result.status === "partial").length;

    return NextResponse.json({
      ok: true,
      processedCount: results.length,
      successCount,
      originalPdfStored: storageMode === "user_archive" && consent.saveOriginalPdfToUserAccount,
      defaultPrivacyMode: "Az eredeti PDF alapértelmezés szerint nem kerül végleges tárolásra. A feldolgozás memóriában történik.",
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Ismeretlen PDF feldolgozási hiba.",
      },
      { status: 500 },
    );
  }
}

function readConsentState(formData: FormData): EnergyCertificateConsentState {
  return {
    processAndDeleteOriginalPdf: formData.get("processAndDeleteOriginalPdf") !== "false",
    saveOriginalPdfToUserAccount: formData.get("saveOriginalPdfToUserAccount") === "true",
    useAnonymizedTechnicalDataForInternalImprovement:
      formData.get("useAnonymizedTechnicalDataForInternalImprovement") === "true",
    consentCapturedAt: new Date().toISOString(),
    consentVersion: "energy-certificate-privacy-v1",
  };
}

function isPdfFile(file: File) {
  return file.type === "application/pdf" || file.name.toLocaleLowerCase("hu-HU").endsWith(".pdf");
}
