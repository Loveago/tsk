import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/**
 * Serves the admin-uploaded delivery proof image (§11) to the report owner
 * (or staff). The base64 payload is streamed as the stored image MIME type.
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUser();
    const { id } = await params;

    const report = await prisma.deliveryReport.findUnique({
      where: { id },
      select: {
        userId: true,
        proofImage: true,
        proofImageMime: true,
      },
    });
    if (!report || !report.proofImage) return apiError(404, "Proof image not found");

    const isStaff = user.role === "ADMIN" || user.role === "MANAGER";
    if (!isStaff && report.userId !== user.id) return apiError(403, "Not allowed");

    // If proofImage is a remote URL, fetch and stream it or redirect
    if (report.proofImage.startsWith("http://") || report.proofImage.startsWith("https://")) {
      try {
        const remoteRes = await fetch(report.proofImage, {
          headers: { "User-Agent": "Tskconnect/1.0" },
        });
        if (remoteRes.ok) {
          const contentType = remoteRes.headers.get("content-type") || report.proofImageMime || "image/jpeg";
          const arrayBuf = await remoteRes.arrayBuffer();
          return new NextResponse(new Uint8Array(arrayBuf), {
            headers: {
              "Content-Type": contentType,
              "Cache-Control": "private, max-age=3600",
            },
          });
        }
      } catch {
        return NextResponse.redirect(report.proofImage);
      }
    }

    const buffer = Buffer.from(report.proofImage, "base64");
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        "Content-Type": report.proofImageMime ?? "image/png",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
