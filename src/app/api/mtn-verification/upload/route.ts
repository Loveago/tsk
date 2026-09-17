import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";
import {
  parseMtnNumbersFile,
  submitVerificationRequest,
} from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

// Allow up to 200MB request bodies for large TXT file uploads
export const config = {
  api: {
    bodyParser: false,
  },
};

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();

    // Rate limiting: max 5 bulk uploads per minute per user
    const rl = rateLimit(`mtn_upload:${user.id}`, 5, 60_000);
    if (!rl.allowed) {
      return apiError(429, "Too many file uploads. Please wait a minute before trying again.");
    }

    // 200 MB ceiling
    const MAX_BYTES = 200 * 1024 * 1024;
    const contentType = request.headers.get("content-type") ?? "";
    let content = "";
    let filename = "upload.txt";

    if (contentType.includes("application/json")) {
      const body = await request.json();
      content = body.content ?? "";
      filename = body.filename ?? "upload.txt";
    } else if (contentType.includes("multipart/form-data")) {
      let formData: FormData;
      try {
        formData = await request.formData();
      } catch {
        return apiError(400, "Failed to parse form data. Please ensure the file is a valid .txt file.");
      }

      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return apiError(400, "No file provided. Please attach a .txt file.");
      }

      if (!file.name.toLowerCase().endsWith(".txt")) {
        return apiError(400, "Only .txt files are supported for bulk upload.");
      }

      if (file.size > MAX_BYTES) {
        return apiError(413, "File is too large. Maximum allowed size is 200 MB.");
      }

      filename = file.name;
      try {
        content = await file.text();
      } catch {
        return apiError(400, "Could not read the file. Ensure it is a valid UTF-8 encoded text file.");
      }
    } else {
      content = await request.text();
      filename = request.headers.get("x-filename") || "upload.txt";
    }

    if (!filename.toLowerCase().endsWith(".txt")) {
      return apiError(400, "Only .txt files are supported for bulk upload.");
    }

    if (!content.trim()) {
      return apiError(400, "The uploaded file is empty.");
    }

    // Parse numbers from the file (validates MTN format, deduplicates, etc.)
    const parsed = await parseMtnNumbersFile(content, filename);

    if (parsed.validNumbers.length === 0) {
      return NextResponse.json({
        success: false,
        message: "No valid MTN numbers found in the file.",
        totalRows: parsed.totalRows,
        submitted: 0,
        alreadyPending: 0,
        alreadyVerified: 0,
        failed: 0,
        invalidCount: parsed.invalidCount,
        duplicateCount: parsed.duplicateCount,
        alreadyAcceptedCount: parsed.alreadyAcceptedCount,
        errors: parsed.invalid.slice(0, 50),
      });
    }

    // Submit each valid number as a verification request
    let submitted = 0;
    let alreadyPending = 0;
    let alreadyVerified = 0;
    let failed = 0;
    const failedNumbers: { number: string; reason: string }[] = [];

    // Process in batches of 50 to avoid overwhelming DB connections
    const BATCH_SIZE = 50;
    for (let i = 0; i < parsed.validNumbers.length; i += BATCH_SIZE) {
      const chunk = parsed.validNumbers.slice(i, i + BATCH_SIZE);
      await Promise.all(
        chunk.map(async (number) => {
          try {
            const result = await submitVerificationRequest(user.id, number, user.email);
            if (result.status === "VERIFIED") {
              alreadyVerified++;
            } else if (result.status === "ALREADY_PENDING") {
              alreadyPending++;
            } else {
              submitted++;
            }
          } catch (err: any) {
            failed++;
            failedNumbers.push({ number, reason: err.message ?? "Unknown error" });
          }
        })
      );
    }

    return NextResponse.json({
      success: true,
      message: `File processed. ${submitted} number(s) submitted for verification.`,
      totalRows: parsed.totalRows,
      submitted,
      alreadyPending,
      alreadyVerified,
      failed,
      invalidCount: parsed.invalidCount,
      duplicateCount: parsed.duplicateCount,
      alreadyAcceptedCount: parsed.alreadyAcceptedCount,
      errors: [...parsed.invalid.slice(0, 20), ...failedNumbers.slice(0, 20).map((f) => ({ raw: f.number, reason: f.reason, line: -1 }))],
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
