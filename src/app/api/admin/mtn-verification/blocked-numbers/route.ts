import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import {
  addBlockedNumber,
  bulkAddBlockedNumbers,
  removeBlockedNumber,
  bulkRemoveBlockedNumbers,
  clearAllBlockedNumbers,
} from "@/lib/blocked-numbers";
import { detectNetworkNameByPrefix, normalizeGhanaPhoneNumber, isValidGhanaPhoneNumber } from "@/lib/phone-utils";
import { extractPhoneNumbersFromExcel } from "@/lib/excel-utils";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
    const { searchParams } = new URL(request.url);
    const page = Math.max(1, Number(searchParams.get("page") ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get("pageSize") ?? 20)));
    const q = searchParams.get("q")?.trim();

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { normalizedNumber: { contains: q } },
        { number: { contains: q } },
        { reason: { contains: q, mode: "insensitive" } },
      ];
    }

    const [items, total] = await Promise.all([
      prisma.blockedNumber.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.blockedNumber.count({ where }),
    ]);

    const enriched = items.map((item) => ({
      ...item,
      network: detectNetworkNameByPrefix(item.normalizedNumber),
    }));

    return NextResponse.json({
      data: enriched,
      total,
      page,
      pageSize,
      pages: Math.ceil(total / pageSize),
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const contentType = request.headers.get("content-type") ?? "";

    // 1. Multipart Form Data (file upload: Excel, CSV, TXT)
    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      const file = formData.get("file");
      const reason = String(formData.get("reason") || "").trim() || undefined;

      if (!file || !(file instanceof File)) {
        return apiError(400, "Please upload an Excel (.xlsx), CSV, or TXT file");
      }

      let numbers: string[] = [];
      if (/\.xlsx?$/i.test(file.name)) {
        const buffer = Buffer.from(await file.arrayBuffer());
        numbers = await extractPhoneNumbersFromExcel(buffer);
      } else {
        const text = await file.text();
        const tokens = text.split(/[\r\n,;\t\s]+/).map((t) => t.trim()).filter(Boolean);
        const validSet = new Set<string>();
        for (const token of tokens) {
          const norm = normalizeGhanaPhoneNumber(token);
          if (norm && isValidGhanaPhoneNumber(norm)) {
            validSet.add(norm);
          }
        }
        numbers = Array.from(validSet);
      }

      if (numbers.length === 0) {
        return apiError(400, "No valid Ghanaian phone numbers found in the uploaded file");
      }

      const result = await bulkAddBlockedNumbers(numbers, reason, admin.email);
      return NextResponse.json({
        success: true,
        filename: file.name,
        ...result,
      });
    }

    // 2. JSON Body (single number or bulk array)
    const body = await request.json();

    // Check if bulk add
    if (Array.isArray(body.numbers) && body.numbers.length > 0) {
      const result = await bulkAddBlockedNumbers(
        body.numbers,
        body.reason,
        admin.email
      );
      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    // Single add
    const phoneNumber = String(body.phoneNumber || body.number || "").trim();
    if (!phoneNumber) {
      return apiError(400, "Phone number is required");
    }

    const record = await addBlockedNumber(
      phoneNumber,
      body.reason,
      admin.email
    );

    return NextResponse.json({
      success: true,
      data: {
        ...record,
        network: detectNetworkNameByPrefix(record.normalizedNumber),
      },
    });
  } catch (err: any) {
    if (err.message && !err.status) {
      return apiError(400, err.message);
    }
    return handleRouteError(err);
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const clearAll = searchParams.get("all") === "true";

    if (clearAll) {
      const count = await clearAllBlockedNumbers(admin.email);
      return NextResponse.json({ success: true, count, clearedAll: true });
    }

    if (id) {
      await removeBlockedNumber(id, admin.email);
      return NextResponse.json({ success: true, count: 1 });
    }

    const body = await request.json().catch(() => ({}));
    if (body.all === true) {
      const count = await clearAllBlockedNumbers(admin.email);
      return NextResponse.json({ success: true, count, clearedAll: true });
    }

    if (Array.isArray(body.ids) && body.ids.length > 0) {
      const count = await bulkRemoveBlockedNumbers(body.ids, admin.email);
      return NextResponse.json({ success: true, count });
    }

    return apiError(400, "Either 'all: true', an 'id', or an array of 'ids' is required");
  } catch (err) {
    return handleRouteError(err);
  }
}
