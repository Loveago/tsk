import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * Public evidence/proof image endpoint.
 * Serves delivery screenshots and carrier logs to third-party storefronts and API consumers.
 * Accepts numeric seq (e.g. 12345, NR-00124) or report CUID (cl...).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const cleanId = id.replace(/^NR-0*/i, "").trim();
    const numericSeq = parseInt(cleanId, 10);

    const report = await prisma.deliveryReport.findFirst({
      where: {
        OR: [
          { id },
          ...(!isNaN(numericSeq) && numericSeq > 0 ? [{ seq: numericSeq }] : []),
        ],
      },
      select: {
        proofImage: true,
        proofImageMime: true,
        status: true,
      },
    });

    if (!report || !report.proofImage) {
      return new NextResponse("Evidence image not found", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // If proofImage is a remote URL, fetch and stream it (or redirect)
    if (report.proofImage.startsWith("http://") || report.proofImage.startsWith("https://")) {
      try {
        const remoteRes = await fetch(report.proofImage, {
          headers: { "User-Agent": "Tskconnect-Evidence/1.0" },
        });
        if (remoteRes.ok) {
          const contentType =
            remoteRes.headers.get("content-type") || report.proofImageMime || "image/jpeg";
          const arrayBuf = await remoteRes.arrayBuffer();
          return new NextResponse(new Uint8Array(arrayBuf), {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "public, max-age=86400",
              "Access-Control-Allow-Origin": "*",
              "Content-Disposition": "inline",
            },
          });
        }
      } catch {
        return NextResponse.redirect(report.proofImage, 307);
      }
    }

    // Base64 payload (handles raw base64 or data:image/...;base64,... URIs)
    let mime = report.proofImageMime || "image/jpeg";
    let base64Data = report.proofImage;
    if (report.proofImage.startsWith("data:")) {
      const match = report.proofImage.match(/^data:([^;]+);base64,(.+)$/);
      if (match) {
        mime = match[1];
        base64Data = match[2];
      }
    }
    const buffer = Buffer.from(base64Data, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Allow-Origin": "*",
        "Content-Disposition": "inline",
      },
    });
  } catch (err: any) {
    return new NextResponse(err?.message || "Internal error", { status: 500 });
  }
}
