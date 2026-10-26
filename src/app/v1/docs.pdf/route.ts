import { NextRequest } from "next/server";
import { getRequestOrigin, handleRouteError } from "@/lib/api-helpers";
import { generateApiDocsPdf } from "@/lib/api-docs-pdf";

export async function GET(request: NextRequest) {
  try {
    const origin = getRequestOrigin(request);
    const { searchParams } = new URL(request.url);
    const isInline = searchParams.get("inline") === "true" || searchParams.get("view") === "true";

    const pdfBuffer = await generateApiDocsPdf({ origin });

    const disposition = isInline ? "inline" : 'attachment; filename="Tskconnect-API-Documentation.pdf"';

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": disposition,
        "Cache-Control": "public, max-age=300",
        "Vary": "Host, X-Forwarded-Host, X-Forwarded-Proto",
      },
    });
  } catch (error) {
    return handleRouteError(error);
  }
}
