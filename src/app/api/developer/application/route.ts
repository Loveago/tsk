import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError, apiError } from "@/lib/api-helpers";
import { z } from "zod";

const applicationSchema = z.object({
  businessName: z.string().min(2, "Business name is required").max(100),
  websiteUrl: z.string().min(3, "Website URL is required").max(255),
  usageDescription: z.string().min(10, "Please provide at least 10 characters describing your use case").max(1000),
  expectedMonthlyVolume: z.string().min(1, "Expected order volume is required"),
  contactEmail: z.string().email("Enter a valid contact email"),
  contactPhone: z.string().min(8, "Enter a valid contact phone number"),
  applicationType: z.enum([
    "WEBSITE",
    "MOBILE_APP",
    "RESELLER_PORTAL",
    "ERP_ECOMMERCE",
    "OTHER",
  ]),
  webhookUrl: z.string().url().optional().or(z.literal("")),
  termsAccepted: z.literal(true, {
    errorMap: () => ({ message: "You must accept the Developer Terms of Service" }),
  }),
});

export async function GET() {
  try {
    const user = await requireUser();
    const application = await prisma.apiApplication.findUnique({
      where: { userId: user.id },
    });

    if (!application) {
      return NextResponse.json({
        status: "NOT_APPLIED",
        application: null,
      });
    }

    return NextResponse.json({
      status: application.status,
      application,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser();
    const body = await request.json();
    const input = applicationSchema.parse(body);

    const existing = await prisma.apiApplication.findUnique({
      where: { userId: user.id },
    });

    if (existing && existing.status === "APPROVED") {
      return apiError(400, "Your API access is already approved");
    }

    if (existing && existing.status === "PENDING") {
      return apiError(400, "You already have a pending API access application under review");
    }

    const application = await prisma.apiApplication.upsert({
      where: { userId: user.id },
      create: {
        userId: user.id,
        businessName: input.businessName,
        websiteUrl: input.websiteUrl,
        usageDescription: input.usageDescription,
        expectedMonthlyVolume: input.expectedMonthlyVolume,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        applicationType: input.applicationType,
        webhookUrl: input.webhookUrl || null,
        termsAccepted: true,
        status: "PENDING",
      },
      update: {
        businessName: input.businessName,
        websiteUrl: input.websiteUrl,
        usageDescription: input.usageDescription,
        expectedMonthlyVolume: input.expectedMonthlyVolume,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        applicationType: input.applicationType,
        webhookUrl: input.webhookUrl || null,
        termsAccepted: true,
        status: "PENDING",
        adminNotes: null,
        reviewedAt: null,
        reviewedBy: null,
      },
    });

    await recordAudit({
      userId: user.id,
      actorLabel: user.email,
      action: "api_application.submit",
      target: `api_application:${application.id}`,
      newValue: JSON.stringify({
        businessName: input.businessName,
        applicationType: input.applicationType,
      }),
    });

    return NextResponse.json({
      success: true,
      status: application.status,
      application,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
