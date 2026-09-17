import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseMtnNumbersFile, createImportStagingSession } from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export const maxDuration = 300;
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_FILE_SIZE_BYTES = 250 * 1024 * 1024; // 250MB limit

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const contentType = request.headers.get("content-type") ?? "";
    let content = "";
    let filename = "import.txt";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      content = body.content ?? "";
      filename = body.filename ?? "import.txt";
    } else if (contentType.includes("multipart/form-data")) {
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        if (!file || !(file instanceof File)) {
          return apiError(400, "Please upload a TXT or CSV file");
        }
        filename = file.name;
        if (file.size > MAX_FILE_SIZE_BYTES) {
          return apiError(400, `File size (${(file.size / 1024 / 1024).toFixed(1)}MB) exceeds maximum limit of 250MB`);
        }
        content = await file.text();
      } catch (formErr: any) {
        console.error("[mtn-verification/import/preview] FormData parsing error:", formErr);
        return apiError(400, "Failed to parse uploaded form data. Please ensure the file is a valid TXT or CSV file.");
      }
    } else {
      // Fallback: raw body as text
      content = await request.text();
      filename = request.headers.get("x-filename") || "import.txt";
    }

    if (!content.trim()) {
      return apiError(400, "Uploaded file is empty");
    }

    const preview = await parseMtnNumbersFile(content, filename);

    // Save staging session for high-speed confirmation without payload bloat
    const sessionId = await createImportStagingSession({
      filename,
      totalRows: preview.totalRows,
      validNumbers: preview.validNumbers,
      portedCount: preview.portedCount,
      portedNumbers: preview.portedNumbers,
      duplicateCount: preview.duplicateCount,
      duplicates: preview.duplicates,
      alreadyAcceptedCount: preview.alreadyAcceptedCount,
      alreadyAccepted: preview.alreadyAccepted,
      invalidCount: preview.invalidCount,
      invalid: preview.invalid,
    });

    return NextResponse.json({
      success: true,
      sessionId,
      filename,
      totalRows: preview.totalRows,
      validCount: preview.validNumbers.length,
      portedCount: preview.portedCount,
      samplePorted: preview.samplePorted,
      alreadyAcceptedCount: preview.alreadyAcceptedCount,
      duplicateCount: preview.duplicateCount,
      invalidCount: preview.invalidCount,
      // Lightweight samples for UI display
      sampleValid: preview.validNumbers.slice(0, 10),
      sampleAlreadyAccepted: preview.alreadyAccepted.slice(0, 10),
      sampleDuplicates: preview.duplicates.slice(0, 10),
      sampleInvalid: preview.invalid.slice(0, 10),
      // For backwards compatibility with smaller files / existing scripts
      validNumbers: preview.validNumbers.length <= 2000 ? preview.validNumbers : [],
      duplicates: preview.duplicates.slice(0, 100),
      alreadyAccepted: preview.alreadyAccepted.slice(0, 100),
      invalid: preview.invalid.slice(0, 100),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
