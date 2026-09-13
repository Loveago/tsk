import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { parseMtnNumbersFile } from "@/lib/mtn-verification";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const contentType = request.headers.get("content-type") ?? "";
    let content = "";
    let filename = "import.txt";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      if (!file || !(file instanceof File)) {
        return apiError(400, "Please upload a TXT or CSV file");
      }
      filename = file.name;
      // Max file size: 10MB
      if (file.size > 10 * 1024 * 1024) {
        return apiError(400, "File size exceeds maximum limit of 10MB");
      }
      content = await file.text();
    } else {
      const body = await request.json();
      content = body.content ?? "";
      filename = body.filename ?? "import.txt";
    }

    if (!content.trim()) {
      return apiError(400, "Uploaded file is empty");
    }

    const preview = await parseMtnNumbersFile(content, filename);

    return NextResponse.json({
      success: true,
      filename,
      ...preview,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
