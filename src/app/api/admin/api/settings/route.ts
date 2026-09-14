import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { recordAudit } from "@/lib/audit";
import { handleRouteError } from "@/lib/api-helpers";
import { isOrderProcessingHalted, setSetting, getSetting } from "@/lib/orders";
import { z } from "zod";

const updateSettingsSchema = z.object({
  orderProcessingHalted: z.boolean().optional(),
  defaultRateLimitPerMin: z.coerce.number().int().min(5).max(1000).optional(),
  defaultDailyLimit: z.coerce.number().int().min(100).max(100000).optional(),
  maxBatchVolume: z.coerce.number().int().min(1).max(5000).optional(),
  webhookTimeoutMs: z.coerce.number().int().min(1000).max(60000).optional(),
  webhookMaxRetries: z.coerce.number().int().min(1).max(10).optional(),
  networkMtnEnabled: z.boolean().optional(),
  networkTelecelEnabled: z.boolean().optional(),
  networkAirteltigoEnabled: z.boolean().optional(),
});

export async function GET() {
  try {
    await requireAdmin();
    const halted = await isOrderProcessingHalted();
    const defaultRateLimit = await getSetting("api_default_rate_limit", "60");
    const defaultDaily = await getSetting("api_default_daily_limit", "5000");
    const maxBatchVolume = await getSetting("api_max_batch_volume", "1000");
    const webhookTimeout = await getSetting("api_webhook_timeout_ms", "10000");
    const webhookRetries = await getSetting("api_webhook_max_retries", "5");
    const mtnEnabled = (await getSetting("network_mtn_enabled", "true")) !== "false";
    const telecelEnabled = (await getSetting("network_telecel_enabled", "true")) !== "false";
    const atEnabled = (await getSetting("network_airteltigo_enabled", "true")) !== "false";

    return NextResponse.json({
      orderProcessingHalted: halted,
      defaultRateLimitPerMin: parseInt(defaultRateLimit, 10) || 60,
      defaultDailyLimit: parseInt(defaultDaily, 10) || 5000,
      maxBatchVolume: parseInt(maxBatchVolume, 10) || 1000,
      webhookTimeoutMs: parseInt(webhookTimeout, 10) || 10000,
      webhookMaxRetries: parseInt(webhookRetries, 10) || 5,
      networkMtnEnabled: mtnEnabled,
      networkTelecelEnabled: telecelEnabled,
      networkAirteltigoEnabled: atEnabled,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = await requireAdmin();
    const body = await request.json();
    const input = updateSettingsSchema.parse(body);

    if (input.orderProcessingHalted !== undefined) {
      await setSetting("order_processing_halted", String(input.orderProcessingHalted));
    }
    if (input.defaultRateLimitPerMin !== undefined) {
      await setSetting("api_default_rate_limit", String(input.defaultRateLimitPerMin));
    }
    if (input.defaultDailyLimit !== undefined) {
      await setSetting("api_default_daily_limit", String(input.defaultDailyLimit));
    }
    if (input.maxBatchVolume !== undefined) {
      await setSetting("api_max_batch_volume", String(input.maxBatchVolume));
    }
    if (input.webhookTimeoutMs !== undefined) {
      await setSetting("api_webhook_timeout_ms", String(input.webhookTimeoutMs));
    }
    if (input.webhookMaxRetries !== undefined) {
      await setSetting("api_webhook_max_retries", String(input.webhookMaxRetries));
    }
    if (input.networkMtnEnabled !== undefined) {
      await setSetting("network_mtn_enabled", String(input.networkMtnEnabled));
    }
    if (input.networkTelecelEnabled !== undefined) {
      await setSetting("network_telecel_enabled", String(input.networkTelecelEnabled));
    }
    if (input.networkAirteltigoEnabled !== undefined) {
      await setSetting("network_airteltigo_enabled", String(input.networkAirteltigoEnabled));
    }

    await recordAudit({
      userId: admin.id,
      actorLabel: admin.email,
      action: "admin.api_settings.update",
      target: "system_settings",
      newValue: JSON.stringify(input),
    });

    const halted = await isOrderProcessingHalted();
    const defaultRateLimit = await getSetting("api_default_rate_limit", "60");
    const defaultDaily = await getSetting("api_default_daily_limit", "5000");
    const maxBatch = await getSetting("api_max_batch_volume", "1000");
    const webhookTimeout = await getSetting("api_webhook_timeout_ms", "10000");
    const webhookRetries = await getSetting("api_webhook_max_retries", "5");
    const mtnEnabled = (await getSetting("network_mtn_enabled", "true")) !== "false";
    const telecelEnabled = (await getSetting("network_telecel_enabled", "true")) !== "false";
    const atEnabled = (await getSetting("network_airteltigo_enabled", "true")) !== "false";

    return NextResponse.json({
      success: true,
      orderProcessingHalted: halted,
      defaultRateLimitPerMin: parseInt(defaultRateLimit, 10) || 60,
      defaultDailyLimit: parseInt(defaultDaily, 10) || 5000,
      maxBatchVolume: parseInt(maxBatch, 10) || 1000,
      webhookTimeoutMs: parseInt(webhookTimeout, 10) || 10000,
      webhookMaxRetries: parseInt(webhookRetries, 10) || 5,
      networkMtnEnabled: mtnEnabled,
      networkTelecelEnabled: telecelEnabled,
      networkAirteltigoEnabled: atEnabled,
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
