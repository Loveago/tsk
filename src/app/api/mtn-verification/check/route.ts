import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { handleRouteError } from "@/lib/api-helpers";
import {
  isMtnVerificationEnabled,
  normalizeGhanaPhoneNumber,
  isMtnPhoneNumber,
  recordUnverifiedMtnNumbersBatch,
} from "@/lib/mtn-verification";
import { z } from "zod";

const checkSchema = z.object({
  phoneNumbers: z.array(z.string()).min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
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
    let pendingVerification: string[] = [];

    for (const [canonical, original] of mtnNumbersMap) {
      if (!acceptedSet.has(canonical)) {
        pendingVerification.push(original);
      }
    }

    // If Clickyfied verification is enabled, verify unverified numbers on Clickyfied's endpoint
    if (pendingVerification.length > 0) {
      const clickyfiedSetting = await prisma.systemSetting.findUnique({
        where: { key: "clickyfied_mtn_verification_enabled" },
      });
      if (clickyfiedSetting?.value === "true") {
        try {
          const { getProviderRoutingConfig } = await import("@/lib/provider-apis/router");
          const { ClickyfiedClient } = await import("@/lib/provider-apis/clickyfied");
          const { addAcceptedMtnNumber } = await import("@/lib/mtn-verification");

          const config = await getProviderRoutingConfig();
          const client = new ClickyfiedClient(config.clickyfied);

          const verifyRes = await client.verifyNumbers(pendingVerification);
          const validSet = new Set(verifyRes.validNumbers.map((n) => normalizeGhanaPhoneNumber(n)));

          // Cache verified numbers into AcceptedMtnNumber
          for (const raw of pendingVerification) {
            const canon = normalizeGhanaPhoneNumber(raw);
            if (validSet.has(canon)) {
              await addAcceptedMtnNumber(canon, "CLICKYFIED_API", "Automated Verification API").catch(() => {});
              acceptedSet.add(canon);
            }
          }

          // Recompute remaining unverified
          pendingVerification = pendingVerification.filter(
            (raw) => !acceptedSet.has(normalizeGhanaPhoneNumber(raw))
          );
        } catch (err) {
          console.error("Clickyfied number verification error:", err);
          // Fall back to local verification state on error
        }
      }
    }

    const unverifiedNumbers = pendingVerification;

    // Capture unverified numbers in BlockedMtnNumber registry for admin review & verification
    if (unverifiedNumbers.length > 0) {
      await recordUnverifiedMtnNumbersBatch(
        unverifiedNumbers.map((num) => ({
          number: num,
          userId: user.id,
        }))
      ).catch((err) => {
        console.error("Failed to record unverified MTN numbers during check:", err);
      });
    }

    return NextResponse.json({
      verificationEnabled,
      unverifiedNumbers,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
