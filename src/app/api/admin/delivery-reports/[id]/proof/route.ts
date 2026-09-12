import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireStaff } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"];
const MAX_SIZE_BYTES = 4 * 1024 * 1024; // 4 MB

/**
 * Uploads a delivery proof image to an existing Not Received report (§10).
 * The image is stored with the report (base64 in SQLite) and becomes visible
 * to the report owner in their report view (§11). JPG/JPEG/PNG/WEBP ≤ 4 MB.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const actor = await requireStaff();
    const { id } = await params;

    const report = await prisma.deliveryReport.findUnique({ where: { id } });
    if (!report) return apiError(404, "Report not found");

    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return apiError(400, "Proof image file is required");
    if (!ALLOWED_MIME.includes(file.type)) {
      return apiError(415, "Unsupported format — use JPG, JPEG, PNG or WEBP");
    }
    if (file.size > MAX_SIZE_BYTES) {
      return apiError(413, "Proof image must be 4 MB or smaller");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.deliveryReport.update({
        where: { id: report.id },
        data: {
          proofImage: buffer.toString("base64"),
          proofImageMime: file.type,
          proofImageUploadedAt: new Date(),
          proofImageUploadedBy: actor.email,
        },
      });
      await tx.deliveryReportEvent.create({
        data: {
          reportId: report.id,
          type: "EVIDENCE_UPLOADED",
          message: `Delivery evidence uploaded (${file.name || "image"})`,
          actorLabel: actor.email,
        },
      });
      return row;
    });

    await recordAudit({
      userId: actor.id,
      actorLabel: actor.email,
      action: "delivery_report.evidence_uploaded",
      target: `delivery_report:${report.id} (order:${report.orderId})`,
      newValue: JSON.stringify({
        mime: file.type,
        size: file.size,
        uploadedBy: actor.email,
      }),
    });

    return NextResponse.json({
      ok: true,
      proof: {
        mime: updated.proofImageMime,
        uploadedAt: updated.proofImageUploadedAt,
        uploadedBy: updated.proofImageUploadedBy,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
