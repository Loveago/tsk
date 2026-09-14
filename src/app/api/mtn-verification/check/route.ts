import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import {
  isMtnVerificationEnabled,
  normalizeGhanaPhoneNumber,
  isMtnPhoneNumber,
} from "@/lib/mtn-verification";
import { z } from "zod";

const checkSchema = z.object({
  phoneNumbers: z.array(z.string()).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    await requireUser();
    const body = await request.json();
    const { phoneNumbers } = checkSchema.parse(body);

    const verificationEnabled = await isMtnVerificationEnabled();

    // Normalize and filter MTN phone numbers
    const mtnNumbersMap = new Map<string, string>(); // normalized -> original
    for (const raw of phoneNumbers) {
      const canonical = normalizeGhanaPhoneNumber(raw);
      if (isMtnPhoneNumber(canonical)) {
        if (!mtnNumbersMap.has(canonical)) {
          mtnNumbersMap.set(canonical, raw);
        }
      }
    }

    if (mtnNumbersMap.size === 0) {
      return NextResponse.json({
        verificationEnabled,
        unverifiedNumbers: [],
      });
    }

    const canonicalList = Array.from(mtnNumbersMap.keys());
    const acceptedRows = await prisma.acceptedMtnNumber.findMany({
      where: { normalizedNumber: { in: canonicalList } },
      select: { normalizedNumber: true },
    });

    const acceptedSet = new Set(acceptedRows.map((r) => r.normalizedNumber));
    const unverifiedNumbers: string[] = [];

    for (const [canonical, original] of mtnNumbersMap) {
      if (!acceptedSet.has(canonical)) {
        unverifiedNumbers.push(original);
      }
    }

    return NextResponse.json({
      verificationEnabled,
      unverifiedNumbers,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
