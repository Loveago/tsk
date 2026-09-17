import { prisma } from "../prisma";
import { changeOrderStatus } from "../orders";
import { recordOrderApiLog } from "../order-api-logs";
import { BigwindataClient, DEFAULT_BIGWINDATA_API_KEY, DEFAULT_BIGWINDATA_BASE_URL } from "./bigwindata";
import { ClickyfiedClient, DEFAULT_CLICKYFIED_API_KEY, DEFAULT_CLICKYFIED_CLIENT_ID, DEFAULT_CLICKYFIED_SANDBOX_URL, generateClickyfiedReference } from "./clickyfied";
import type { ProviderRoutingConfig, ProviderType, ProviderDispatchResult, ClickyfiedConfig } from "./types";

/**
 * Standard Ghanaian network keys supported in routing
 */
export const SUPPORTED_ROUTING_NETWORKS = [
  "MTN",
  "MTN_XPRESS",
  "TELECEL",
  "AIRTELTIGO_ISHARE",
  "AIRTELTIGO_BIGTIME",
] as const;

/**
 * Reads provider routing configuration from system settings
 */
export async function getProviderRoutingConfig(): Promise<ProviderRoutingConfig> {
  const settings = await prisma.systemSetting.findMany();
  const map = new Map<string, string>();
  for (const s of settings) map.set(s.key, s.value);

  const getVal = (key: string, fallback = "") => map.get(key) ?? fallback;

  const networkRoutes: Record<string, ProviderType> = {};
  for (const net of SUPPORTED_ROUTING_NETWORKS) {
    const routeVal = getVal(`provider_route_${net}`, "MANUAL") as ProviderType;
    networkRoutes[net] = ["MANUAL", "BIGWINDATA", "CLICKYFIED"].includes(routeVal) ? routeVal : "MANUAL";
  }

  // Also include any dynamically saved routes for custom categories
  for (const [key, val] of map.entries()) {
    if (key.startsWith("provider_route_")) {
      const net = key.replace("provider_route_", "").toUpperCase();
      if (!networkRoutes[net] && ["MANUAL", "BIGWINDATA", "CLICKYFIED"].includes(val)) {
        networkRoutes[net] = val as ProviderType;
      }
    }
  }

  return {
    enabled: getVal("provider_routing_enabled", "false") === "true",
    defaultProvider: (getVal("provider_routing_default", "MANUAL") as ProviderType) || "MANUAL",
    autoDispatch: getVal("provider_routing_auto_dispatch", "true") === "true",
    networkRoutes,
    bigwindata: {
      enabled: getVal("bigwindata_enabled", "true") === "true",
      apiKey: getVal("bigwindata_api_key", DEFAULT_BIGWINDATA_API_KEY),
      baseUrl: getVal("bigwindata_base_url", DEFAULT_BIGWINDATA_BASE_URL),
      webhookSecret: getVal("bigwindata_webhook_secret", ""),
    },
    clickyfied: {
      enabled: getVal("clickyfied_enabled", "true") === "true",
      apiKey: getVal("clickyfied_api_key", DEFAULT_CLICKYFIED_API_KEY),
      baseUrl: getVal("clickyfied_base_url", DEFAULT_CLICKYFIED_SANDBOX_URL),
      clientId: getVal("clickyfied_client_id", DEFAULT_CLICKYFIED_CLIENT_ID),
      callbackSigningSecret: getVal("clickyfied_callback_signing_secret", ""),
      mtnVerificationEnabled: getVal("clickyfied_mtn_verification_enabled", "false") === "true",
      notReceivedEnabled: getVal("clickyfied_not_received_enabled", "true") === "true",
    },
  };
}

/**
 * Check if Clickyfied integration is configured with an active API key
 */
export function isClickyfiedActive(clickyfied: ClickyfiedConfig): boolean {
  return clickyfied.enabled && Boolean(clickyfied.apiKey);
}

/**
 * Check if Clickyfied is operating in Sandbox (Testing) mode
 */
export function isClickyfiedSandbox(clickyfied: ClickyfiedConfig): boolean {
  const url = (clickyfied.baseUrl || "").toLowerCase().trim();
  if (!url) return true; // default baseUrl DEFAULT_CLICKYFIED_SANDBOX_URL is sandbox
  return (
    url.includes("sandbox") ||
    url === DEFAULT_CLICKYFIED_SANDBOX_URL.toLowerCase() ||
    url.startsWith("http://sandbox") ||
    url.startsWith("https://sandbox")
  );
}

/**
 * Determines whether auto-dispatch should trigger on order creation.
 * When Clickyfied Sandbox is active, auto-dispatch is unconditionally enabled
 * so end-to-end sandbox testing works seamlessly across all ordering surfaces.
 */
export function shouldAutoDispatch(config: ProviderRoutingConfig): boolean {
  // If Clickyfied is enabled in Sandbox mode, all orders must auto-dispatch to sandbox
  if (config.clickyfied.enabled && isClickyfiedSandbox(config.clickyfied)) {
    return true;
  }
  // Standard routing autoDispatch check
  if (config.enabled && config.autoDispatch) {
    return true;
  }
  // If Clickyfied is enabled in production and is the sole active integration
  if (config.clickyfied.enabled && !config.bigwindata.enabled && config.autoDispatch) {
    return true;
  }
  return false;
}

/**
 * Determine which provider serves a given network
 */
export async function getProviderForNetwork(
  network: string,
  packageNameOrType?: string | null
): Promise<ProviderType> {
  const config = await getProviderRoutingConfig();

  // 1. If Clickyfied Sandbox is active and enabled, route ALL orders to Clickyfied sandbox
  if (config.clickyfied.enabled && isClickyfiedSandbox(config.clickyfied)) {
    return "CLICKYFIED";
  }

  // 2. If general provider routing is disabled:
  if (!config.enabled) {
    // If Clickyfied is enabled with production credentials and Bigwindata is disabled, route to Clickyfied
    if (config.clickyfied.enabled && !config.bigwindata.enabled) {
      return "CLICKYFIED";
    }
    return "MANUAL";
  }

  const net = (network || "").trim().toUpperCase();
  const sub = (packageNameOrType || "").trim().toUpperCase();

  // 1. Check for specific subtype matching
  if (net === "MTN" && (sub.includes("XPRESS") || net.includes("XPRESS"))) {
    if (config.networkRoutes["MTN_XPRESS"]) return config.networkRoutes["MTN_XPRESS"];
  }
  if (
    net === "AIRTELTIGO" &&
    (sub.includes("BIGTIME") || net.includes("BIGTIME") || sub.includes("BIG TIME"))
  ) {
    if (config.networkRoutes["AIRTELTIGO_BIGTIME"]) {
      return config.networkRoutes["AIRTELTIGO_BIGTIME"];
    }
  }
  if (
    net === "AIRTELTIGO" &&
    (sub.includes("ISHARE") || net.includes("ISHARE") || sub.includes("I-SHARE"))
  ) {
    if (config.networkRoutes["AIRTELTIGO_ISHARE"]) {
      return config.networkRoutes["AIRTELTIGO_ISHARE"];
    }
  }

  // If network is AIRTELTIGO without explicit sub-identifier, default to ISHARE then BIGTIME
  if (net === "AIRTELTIGO") {
    if (config.networkRoutes["AIRTELTIGO_ISHARE"]) return config.networkRoutes["AIRTELTIGO_ISHARE"];
    if (config.networkRoutes["AIRTELTIGO_BIGTIME"]) return config.networkRoutes["AIRTELTIGO_BIGTIME"];
  }

  // 2. Direct network key match
  if (config.networkRoutes[net]) {
    return config.networkRoutes[net];
  }

  // 3. Normalized prefix fallback
  for (const base of ["MTN", "TELECEL"]) {
    if (net.startsWith(base) && config.networkRoutes[base]) {
      return config.networkRoutes[base];
    }
  }

  // 4. Configured default provider fallback
  if (config.defaultProvider && config.defaultProvider !== "MANUAL") {
    return config.defaultProvider;
  }

  // 5. If Clickyfied is enabled in production and Bigwindata is disabled
  if (config.clickyfied.enabled && !config.bigwindata.enabled) {
    return "CLICKYFIED";
  }

  return "MANUAL";
}

/**
 * Helper to get the public base URL of our app for webhooks
 */
async function getAppBaseUrl(): Promise<string> {
  const setting = await prisma.systemSetting.findUnique({ where: { key: "app_base_url" } });
  if (setting?.value) return setting.value.replace(/\/+$/, "");
  return process.env.NEXTAUTH_URL || process.env.APP_URL || "https://tskconnect.com";
}

/**
 * Dispatch an individual order to its assigned API provider
 */
export async function dispatchOrder(
  orderId: number,
  options: { force?: boolean; skipThresholdTrigger?: boolean } = {}
): Promise<ProviderDispatchResult> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { dataPackage: true },
  });

  if (!order) {
    return { success: false, provider: "MANUAL", error: "Order not found" };
  }

  if (order.status !== "PENDING" && !options.force) {
    return {
      success: true,
      provider: "MANUAL",
      status: order.status,
      error: `Order is already in ${order.status} status`,
    };
  }

  if (order.providerReference && !options.force) {
    return {
      success: true,
      provider: order.providerReference.startsWith("CLICKYFIED:") ? "CLICKYFIED" : "BIGWINDATA",
      status: order.status,
      error: `Order already dispatched to provider (${order.providerReference})`,
    };
  }

  const config = await getProviderRoutingConfig();
  const isSandboxMode = config.clickyfied.enabled && isClickyfiedSandbox(config.clickyfied);

  // If general routing is disabled, but Clickyfied sandbox (or sole active production provider) is enabled, proceed!
  if (!config.enabled && !isSandboxMode && !(config.clickyfied.enabled && !config.bigwindata.enabled)) {
    return {
      success: true,
      provider: "MANUAL",
      error: "Provider routing is currently disabled. Order remains in PENDING for manual export.",
    };
  }

  const provider = await getProviderForNetwork(
    order.network,
    order.dataPackage?.name || order.dataPackage?.description
  );

  if (provider === "MANUAL") {
    return {
      success: true,
      provider: "MANUAL",
      status: "PENDING",
    };
  }

  const appBaseUrl = await getAppBaseUrl();

  // -------------------------------------------------------------------------
  // Dispatched to BIGWINDATA
  // -------------------------------------------------------------------------
  if (provider === "BIGWINDATA") {
    if (!config.bigwindata.enabled) {
      return {
        success: false,
        provider: "BIGWINDATA",
        error: "Bigwindata integration is disabled in settings.",
      };
    }

    const client = new BigwindataClient(config.bigwindata);
    const bigwinStartTime = Date.now();
    let purchasePayload: any = null;
    try {
      const bundleId = await client.resolveBundleId(order.network, order.gbAmount);
      const webhookUrl = `${appBaseUrl}/api/webhooks/providers/bigwindata`;
      purchasePayload = {
        bundleId,
        recipient: order.phoneNumber,
        idempotencyKey: `TSK-ORD-${order.id}`,
        webhookUrl,
      };

      const purchaseRes = await client.purchase(purchasePayload);
      const durationMs = Date.now() - bigwinStartTime;
      const providerRef = `BIGWIN:${purchaseRes.orderId || purchaseRes.order_id || purchaseRes.reference}`;

      // Update provider reference
      await prisma.order.update({
        where: { id: order.id },
        data: {
          providerReference: providerRef,
          failureReason: null,
        },
      });

      // Record Order API Log
      await recordOrderApiLog({
        orderId: order.id,
        provider: "BIGWINDATA",
        action: "SUBMIT_ORDER",
        endpoint: `${config.bigwindata.baseUrl || DEFAULT_BIGWINDATA_BASE_URL}/api/purchase`,
        method: "POST",
        requestPayload: purchasePayload,
        responsePayload: purchaseRes,
        statusCode: 200,
        success: true,
        providerReference: providerRef,
        durationMs,
      });

      // Advance order status to PROCESSING
      await changeOrderStatus(
        order.id,
        "PROCESSING",
        `Dispatched via Bigwindata API (order_id: ${purchaseRes.orderId || purchaseRes.order_id}, ref: ${purchaseRes.reference})`,
        { id: "system", label: "Bigwindata API" },
        { force: true }
      );

      return {
        success: true,
        provider: "BIGWINDATA",
        providerReference: providerRef,
        status: "PROCESSING",
        price: purchaseRes.rawPrice || purchaseRes.price,
        raw: purchaseRes,
      };
    } catch (err: any) {
      const durationMs = Date.now() - bigwinStartTime;
      const errMsg = err?.message || "Failed to dispatch order to Bigwindata";

      await prisma.order.update({
        where: { id: order.id },
        data: { failureReason: errMsg },
      });

      await recordOrderApiLog({
        orderId: order.id,
        provider: "BIGWINDATA",
        action: "SUBMIT_ORDER",
        endpoint: `${config.bigwindata.baseUrl || DEFAULT_BIGWINDATA_BASE_URL}/api/purchase`,
        method: "POST",
        requestPayload: purchasePayload,
        responsePayload: err?.rawResponse || err?.rawText || { error: errMsg },
        statusCode: err?.status || 500,
        success: false,
        errorMessage: errMsg,
        durationMs,
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          previousStatus: order.status,
          note: `Bigwindata dispatch failed: ${errMsg}`,
          changedBy: "Bigwindata API",
        },
      });
      return {
        success: false,
        provider: "BIGWINDATA",
        error: errMsg,
      };
    }
  }

  // -------------------------------------------------------------------------
  // Dispatched to CLICKYFIED
  // -------------------------------------------------------------------------
  if (provider === "CLICKYFIED") {
    if (!config.clickyfied.enabled) {
      return {
        success: false,
        provider: "CLICKYFIED",
        error: "Clickyfied integration is disabled in settings.",
      };
    }

    // Check if MTN Batching is enabled for Clickyfied
    const isMtn = (order.network || "").toUpperCase().trim().startsWith("MTN");
    if (isMtn && !options.force) {
      const { getClickyfiedBatchConfig, checkAndTriggerMtnBatch } = await import("./clickyfied-batch");
      const batchConfig = await getClickyfiedBatchConfig();
      if (batchConfig.enabled) {
        if (options.skipThresholdTrigger) {
          return {
            success: true,
            provider: "CLICKYFIED",
            status: "PENDING",
          };
        }
        // Order accumulates in PENDING. Check if volume threshold (e.g. 100 GB) is met.
        const triggerRes = await checkAndTriggerMtnBatch("THRESHOLD");
        return {
          success: true,
          provider: "CLICKYFIED",
          status: triggerRes.triggered ? "PROCESSING" : "PENDING",
        };
      }
    }

    const client = new ClickyfiedClient(config.clickyfied);
    const clickyfiedStartTime = Date.now();
    let submitPayload: any = null;
    try {
      // Use public https callbackUrl only if appBaseUrl is a valid external URL AND callbackSigningSecret is provided
      const signingSecret = (config.clickyfied.callbackSigningSecret || "").trim();
      const isPublicUrl =
        appBaseUrl &&
        appBaseUrl.startsWith("https://") &&
        !appBaseUrl.includes("localhost") &&
        !appBaseUrl.includes("127.0.0.1");

      // Clickify strictly requires callbackSigningSecret whenever callbackUrl is provided
      const callbackUrl = isPublicUrl && signingSecret
        ? `${appBaseUrl}/api/webhooks/providers/clickyfied`
        : undefined;

      // Use user-requested pattern: order-1788XXXXXXXXX
      const externalReference = generateClickyfiedReference(order.id);

      submitPayload = {
        externalReference,
        entries: [{ number: order.phoneNumber, allocationGB: order.gbAmount }],
        callbackUrl,
        callbackSigningSecret: signingSecret || undefined,
        idempotencyKey: externalReference,
      };

      const submitRes = await client.submitOrder(submitPayload);
      const durationMs = Date.now() - clickyfiedStartTime;

      const orderId = submitRes.orderId || externalReference;
      const providerRef = `CLICKYFIED:${orderId}`;

      const rawAny = submitRes.raw as any;
      const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
      const rawStatus = rawAny?.order?.status || submitRes.status || rawAny?.status;
      const mappedStatus = mapClickyfiedStatus(rawStatus, summary);

      // Check if Clickyfied accepted it with errors or rejected
      const hasErrors = mappedStatus === "FAILED" || (summary?.error ?? 0) > 0;
      const errorDetail = hasErrors
        ? rawAny?.message ||
          rawAny?.error ||
          (rawAny?.errors && JSON.stringify(rawAny.errors)) ||
          `Clickyfied rejected order (${rawStatus || "failed"})`
        : null;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          providerReference: providerRef,
          externalReference: order.externalReference || externalReference,
          failureReason: errorDetail,
        },
      });

      // Record Order API Log
      await recordOrderApiLog({
        orderId: order.id,
        provider: "CLICKYFIED",
        action: "SUBMIT_ORDER",
        endpoint: `${config.clickyfied.baseUrl || DEFAULT_CLICKYFIED_SANDBOX_URL}/api/public/v1/orders`,
        method: "POST",
        requestPayload: submitPayload,
        responsePayload: submitRes.raw,
        statusCode: 200,
        success: !hasErrors,
        errorMessage: errorDetail,
        providerReference: providerRef,
        durationMs,
      });

      // Maintain identical status between Clickify and Tskconnect
      if (mappedStatus !== order.status) {
        await changeOrderStatus(
          order.id,
          mappedStatus,
          `Dispatched via Clickyfied API (Order: ${orderId}, Provider Status: ${rawStatus || mappedStatus})`,
          { id: "system", label: "Clickyfied API" },
          { force: true }
        );
      } else {
        await prisma.orderStatusHistory.create({
          data: {
            orderId: order.id,
            status: order.status,
            previousStatus: order.status,
            note: `Dispatched via Clickyfied API (Order: ${orderId}, Provider Status: ${rawStatus || mappedStatus})`,
            changedBy: "Clickyfied API",
          },
        });
      }

      return {
        success: !hasErrors,
        provider: "CLICKYFIED",
        providerReference: providerRef,
        status: mappedStatus,
        raw: submitRes,
        error: errorDetail || undefined,
      };
    } catch (err: any) {
      const durationMs = Date.now() - clickyfiedStartTime;
      const errMsg = err?.message || "Failed to dispatch order to Clickyfied";

      await prisma.order.update({
        where: { id: order.id },
        data: { failureReason: errMsg },
      });

      await recordOrderApiLog({
        orderId: order.id,
        provider: "CLICKYFIED",
        action: "SUBMIT_ORDER",
        endpoint: err?.endpoint || err?.url || `${config.clickyfied.baseUrl || DEFAULT_CLICKYFIED_SANDBOX_URL}/api/public/v1/orders`,
        method: "POST",
        requestPayload: submitPayload,
        responsePayload: err?.rawResponse || err?.rawText || (err?.errors ? { errors: err.errors } : { error: errMsg }),
        statusCode: err?.status || 500,
        success: false,
        errorMessage: errMsg,
        providerReference: submitPayload?.externalReference ? `CLICKYFIED:${submitPayload.externalReference}` : null,
        durationMs,
      });

      await prisma.orderStatusHistory.create({
        data: {
          orderId: order.id,
          status: order.status,
          previousStatus: order.status,
          note: `Clickyfied dispatch failed: ${errMsg}`,
          changedBy: "Clickyfied API",
        },
      });
      return {
        success: false,
        provider: "CLICKYFIED",
        error: errMsg,
      };
    }
  }

  return { success: false, provider: "MANUAL", error: `Unknown provider: ${provider}` };
}

/**
 * Normalizes a Ghanaian phone number to its last 9 digits for robust matching across
 * international (+233), national (0), and plain formats.
 */
export function normalizePhoneLast9(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-9) : digits;
}

/**
 * Maps Clickyfied statuses and entry summaries to Tskconnect internal order statuses:
 * - Clickify pending / accepted / submitted / queued -> "PENDING"
 * - Clickify processing / in_progress / sending -> "PROCESSING"
 * - Clickify completed / delivered / sent / processed / success -> "SUCCESS"
 * - Clickify failed / rejected / error / unsuccessful -> "FAILED"
 * - Clickify cancelled / canceled -> "CANCELLED"
 */
export function mapClickyfiedStatus(
  rawStatus: string | null | undefined,
  entrySummary?: {
    total?: number;
    pending?: number;
    processing?: number;
    sent?: number;
    error?: number;
  } | null,
  processedAt?: string | Date | null
): "PENDING" | "PROCESSING" | "SUCCESS" | "FAILED" | "CANCELLED" {
  const s = (rawStatus || "").trim().toLowerCase();

  // 1. Terminal statuses (completed / delivered / sent / processed / success)
  if (["completed", "delivered", "sent", "processed", "success"].includes(s)) {
    return "SUCCESS";
  }
  if (["failed", "rejected", "error", "unsuccessful"].includes(s)) {
    return "FAILED";
  }
  if (["cancelled", "canceled"].includes(s)) {
    return "CANCELLED";
  }

  // 2. Direct 1-to-1 match with Clickyfied's primary status
  if (["processing", "in_progress", "sending", "in-progress"].includes(s)) {
    return "PROCESSING";
  }
  if (["pending", "accepted", "submitted", "queued", "created"].includes(s)) {
    // If Clickyfied reported pending/accepted, but entrySummary indicates some or all have begun processing:
    if (entrySummary && typeof entrySummary.total === "number" && entrySummary.total > 0) {
      if ((entrySummary.processing ?? 0) > 0 || (entrySummary.sent ?? 0) > 0) {
        return "PROCESSING";
      }
    }
    return "PENDING";
  }

  // 3. Fallback to entrySummary if rawStatus was empty or unrecognized
  if (entrySummary && typeof entrySummary.total === "number" && entrySummary.total > 0) {
    const total = entrySummary.total;
    const sent = entrySummary.sent ?? 0;
    const error = entrySummary.error ?? 0;
    const processing = entrySummary.processing ?? 0;

    if (sent >= total) return "SUCCESS";
    if (error >= total) return "FAILED";
    if (processing > 0 || sent > 0) return "PROCESSING";
    return "PENDING";
  }

  if (processedAt && !["failed", "rejected", "error", "unsuccessful", "cancelled", "canceled"].includes(s)) {
    return "SUCCESS";
  }

  return "PENDING";
}

/**
 * Automatically splits any OrderBatch where orders were dispatched across multiple distinct
/**
 * Maintenance & Reconciliation:
 * Reconciles OrderBatch records, ensuring their recipient counts, total GB, total amount,
 * and batch status are strictly accurate based on their child orders.
 * Also cleans up any empty ghost batches (0 orders) left behind.
 * 
 * Crucially: User-created OrderBatches are NEVER split into chunks or modified!
 * The user sees their submission as one single batch order.
 */
export async function splitMultiDispatchBatches(): Promise<void> {
  try {
    const existingBatches = await prisma.orderBatch.findMany({
      include: {
        _count: { select: { orders: true } },
      },
    });

    for (const b of existingBatches) {
      const actualCount = b._count.orders;
      if (actualCount === 0) {
        // Delete ghost batch with 0 orders so it doesn't show with an empty recipients modal
        await prisma.orderBatch.delete({ where: { id: b.id } }).catch(() => {});
      } else {
        const aggregates = await prisma.order.aggregate({
          where: { batchId: b.id },
          _sum: { gbAmount: true, amount: true },
        });
        const currentGb = aggregates._sum.gbAmount || 0;
        const currentAmt = aggregates._sum.amount || 0;

        if (actualCount !== b.totalRecipients || currentGb !== b.totalGb || currentAmt !== b.totalAmount) {
          await prisma.orderBatch.update({
            where: { id: b.id },
            data: {
              totalRecipients: actualCount,
              totalGb: currentGb,
              totalAmount: currentAmt,
            },
          });
        }
        const { recomputeBatchStatus } = await import("../orders");
        await recomputeBatchStatus(b.id);
      }
    }
  } catch (err) {
    console.error("[splitMultiDispatchBatches] Error:", err);
  }
}

// In-memory set to prevent concurrent requests to the same order
const syncingOrders = new Set<number>();
// Cache of last checked timestamp per order to respect Clickify rate limit (32s)
const lastCheckedOrders = new Map<number, number>();

/**
 * Synchronizes an order's status with Clickyfied provider API.
 * Updates the database order if the status has changed.
 */
export async function syncClickyfiedOrder(
  orderIdOrRecord: number | {
    id: number;
    status: string;
    providerReference: string | null;
    updatedAt: Date;
  },
  actorLabel = "Clickyfied Sync",
  options: { forceCheck?: boolean } = {}
): Promise<{ changed: boolean; previousStatus?: string; newStatus?: string; error?: string }> {
  const orderId = typeof orderIdOrRecord === "number" ? orderIdOrRecord : orderIdOrRecord.id;

  if (syncingOrders.has(orderId)) {
    return { changed: false };
  }

  const now = Date.now();
  const lastChecked = lastCheckedOrders.get(orderId) || 0;
  if (!options.forceCheck && now - lastChecked < 32000) {
    return { changed: false };
  }

  syncingOrders.add(orderId);
  try {
    const order = typeof orderIdOrRecord === "number"
      ? await prisma.order.findUnique({ where: { id: orderId } })
      : orderIdOrRecord;

    if (!order) return { changed: false, error: "Order not found" };

    // Terminal statuses do not need further polling
    if (["SUCCESS", "FAILED", "CANCELLED", "REFUNDED"].includes(order.status)) {
      return { changed: false, newStatus: order.status };
    }

    if (!order.providerReference || !order.providerReference.startsWith("CLICKYFIED:")) {
      return { changed: false };
    }

    const rawRef = order.providerReference.replace("CLICKYFIED:", "").trim();
    const [providerId, orderEntryId] = rawRef.split(":");
    if (!providerId) return { changed: false };

    lastCheckedOrders.set(orderId, now);

    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    const res = await client.getOrderStatus(providerId);
    const rawAny = res.raw as any;
    const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
    const rawStatus = rawAny?.order?.status || res.status || rawAny?.status;
    const processedAt = rawAny?.order?.processedAt || rawAny?.processedAt;

    const overallTargetStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

    // Find all sister orders in our database that belong to this Clickyfied batch
    const linkedOrders = await prisma.order.findMany({
      where: {
        OR: [
          { providerReference: `CLICKYFIED:${providerId}` },
          { providerReference: { startsWith: `CLICKYFIED:${providerId}:` } },
          { externalReference: rawAny?.order?.externalReference || undefined },
          { id: order.id },
        ],
      },
    });

    const entriesList: Array<{ id?: string | number; orderEntryId?: string | number; entryId?: string | number; number?: string; status?: string }> =
      rawAny?.order?.entries || rawAny?.entries || [];

    const entryMap = new Map<string, string>();
    const entryIdMap = new Map<string, string | number>();
    for (const e of entriesList) {
      if (e.number) {
        const norm = normalizePhoneLast9(e.number);
        if (e.status) entryMap.set(norm, e.status);
        const eId = e.orderEntryId ?? e.entryId ?? e.id ?? (e as any)._id;
        if (eId !== undefined && eId !== null) entryIdMap.set(norm, eId);
      }
    }

    let thisOrderChanged = false;
    let thisOrderNewStatus = order.status;
    const thisOrderPreviousStatus = order.status;

    for (const ord of linkedOrders) {
      lastCheckedOrders.set(ord.id, now);

      const ordNormPhone = normalizePhoneLast9(ord.phoneNumber);
      const entryStatus = entryMap.get(ordNormPhone);
      const eId = entryIdMap.get(ordNormPhone);

      // Cache entryId in providerReference if not already saved (format is CLICKYFIED:orderId:entryId)
      // The check must look for a SECOND colon after "CLICKYFIED:" prefix — not just any colon.
      const hasEntryIdCached = (ord.providerReference || "").split(":").length >= 3;
      if (eId !== undefined && eId !== null && !hasEntryIdCached) {
        await prisma.order
          .update({
            where: { id: ord.id },
            data: { providerReference: `CLICKYFIED:${providerId}:${eId}` },
          })
          .catch(() => {});
      }
      const targetStatus = entryStatus
        ? mapClickyfiedStatus(entryStatus)
        : overallTargetStatus;

      if (targetStatus && targetStatus !== ord.status) {
        if (targetStatus === "FAILED") {
          await recordOrderApiLog({
            orderId: ord.id,
            provider: "CLICKYFIED",
            action: "SYNC_ORDER",
            endpoint: `${config.clickyfied.baseUrl || DEFAULT_CLICKYFIED_SANDBOX_URL}/api/public/v1/orders/${providerId}`,
            method: "GET",
            statusCode: 200,
            success: false,
            errorMessage: `Order marked as failed by Clickyfied (Status: ${entryStatus || rawStatus})`,
            responsePayload: rawAny,
            providerReference: ord.providerReference,
          });
        }

        await changeOrderStatus(
          ord.id,
          targetStatus,
          `Synced with Clickyfied (${entryStatus || rawStatus || targetStatus})`,
          { id: "system", label: actorLabel },
          { force: true }
        );

        if (ord.id === order.id) {
          thisOrderChanged = true;
          thisOrderNewStatus = targetStatus;
        }
      }
    }

    return {
      changed: thisOrderChanged,
      previousStatus: thisOrderPreviousStatus,
      newStatus: thisOrderNewStatus,
    };
  } catch (err: any) {
    // If rate limited by Clickify (429), silently return unchanged without throwing
    if (err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("Polling too frequently")) {
      return { changed: false, error: "Rate limit: wait 30s" };
    }

    await recordOrderApiLog({
      orderId,
      provider: "CLICKYFIED",
      action: "SYNC_ORDER",
      endpoint: err?.endpoint || err?.url || `/api/public/v1/orders`,
      method: "GET",
      statusCode: err?.status || 500,
      success: false,
      errorMessage: err?.message || "Clickyfied status sync failed",
      responsePayload: err?.rawResponse || err?.rawText || { error: err?.message },
    });

    return { changed: false, error: err?.message || "Sync failed" };
  } finally {
    syncingOrders.delete(orderId);
  }
}

/**
 * Synchronizes a Not Received DeliveryReport with Clickyfied's not-received endpoint.
 * Pulls admin notes, resolution status, and evidenceUrl (proof image),
 * and attaches it directly to the delivery report for users and admins to view.
 */
export async function syncClickyfiedDeliveryReport(
  reportId: string,
  actorLabel = "Clickyfied Sync"
): Promise<{ changed: boolean; error?: string }> {
  try {
    const report = await prisma.deliveryReport.findUnique({
      where: { id: reportId },
      include: {
        order: {
          select: {
            id: true,
            providerReference: true,
            externalReference: true,
            network: true,
            phoneNumber: true,
            gbAmount: true,
            status: true,
          },
        },
      },
    });

    if (!report || !report.order) return { changed: false };

    // If report is already REFUNDED, no further sync needed
    if (report.status === "REFUNDED") {
      return { changed: false };
    }

    // Parse provider order ID and entry ID
    let providerOrderId = "";
    let providerEntryId: string | number | undefined = undefined;
    if (report.order.providerReference?.startsWith("CLICKYFIED:")) {
      const rawRef = report.order.providerReference.replace("CLICKYFIED:", "").trim();
      const [pId, eId] = rawRef.split(":");
      providerOrderId = pId;
      if (eId) providerEntryId = eId;
    } else if (report.order.providerReference) {
      const [pId, eId] = report.order.providerReference.trim().split(":");
      providerOrderId = pId;
      if (eId) providerEntryId = eId;
    }

    const config = await getProviderRoutingConfig();
    if (!config.clickyfied.enabled) return { changed: false };
    const client = new ClickyfiedClient(config.clickyfied);

    // If order was part of a batch (e.g. CF-BATCH-000011), resolve its true canonical batch order ID
    let batchCanonicalOrderId: string | null = null;
    if (report.order.externalReference?.startsWith("CF-BATCH-")) {
      try {
        const resolved = await client.resolveCanonicalOrderId(report.order.externalReference.trim());
        if (resolved && resolved.startsWith("order-")) {
          batchCanonicalOrderId = resolved;
        }
      } catch {}
    }

    // If order belongs to a batch, prioritize the true batch order ID over any hijacked providerOrderId
    if (batchCanonicalOrderId && providerOrderId !== batchCanonicalOrderId) {
      providerOrderId = batchCanonicalOrderId;
    }

    // Identify all possible Clickify order identifier candidates (batch canonical first)
    const idCandidates: string[] = [];
    if (batchCanonicalOrderId) idCandidates.push(batchCanonicalOrderId);
    if (providerOrderId) idCandidates.push(providerOrderId);
    if (report.order.externalReference) {
      idCandidates.push(report.order.externalReference.trim());
    }
    idCandidates.push(`TSK-ORD-${report.order.id}`);
    idCandidates.push(`order-${report.order.id}`);

    const uniqueIds = Array.from(new Set(idCandidates.filter(Boolean)));
    if (uniqueIds.length === 0) return { changed: false };

    let res: any = null;
    let orderRes: any = null;

    // Robust multi-ID polling: check candidates until valid data is received
    for (const cid of uniqueIds) {
      if (!res) {
        try {
          const repRes = await client.getNotReceivedStatus(cid);
          if (repRes && (repRes.reports || repRes.report || repRes.data || repRes.status)) {
            res = repRes;
          }
        } catch {}
      }
      if (!orderRes) {
        try {
          const ordRes = await client.getOrderStatus(cid);
          if (ordRes && (ordRes.status || ordRes.raw)) {
            orderRes = ordRes;
          }
        } catch {}
      }
      if (res && orderRes) break;
    }

    if (!res && !orderRes) return { changed: false };

    // Check if the Clickyfied order had multiple entries or linked orders in our DB
    const returnedEntries: Array<{ id?: string | number; orderEntryId?: string | number; entryId?: string | number; number?: string; status?: string; currentStatus?: string }> =
      orderRes?.raw?.order?.entries || orderRes?.raw?.entries || [];

    const linkedCount = await prisma.order.count({
      where: {
        OR: [
          { providerReference: `CLICKYFIED:${providerOrderId}` },
          { providerReference: { startsWith: `CLICKYFIED:${providerOrderId}:` } },
        ],
      },
    });
    const isMultiEntryBatch = returnedEntries.length > 1 || linkedCount > 1;

    // Action 6: Extract reports from res (handling all Clickyfied response formats)
    const reportsList: any[] = Array.isArray(res?.reports)
      ? res.reports
      : res?.report
      ? [res.report]
      : Array.isArray(res?.data?.reports)
      ? res.data.reports
      : res?.data?.report
      ? [res.data.report]
      : Array.isArray(res?.data)
      ? res.data
      : [];

    let repData: any = null;
    let reportBelongsToOrder = false;
    const orderPhone9 = report.order.phoneNumber
      ? normalizePhoneLast9(report.order.phoneNumber)
      : null;

    if (reportsList.length > 0) {
      repData = reportsList.find((r: any) => {
        if (providerEntryId && (r.orderEntryId || r.entryId || r.id) && String(r.orderEntryId || r.entryId || r.id) === String(providerEntryId)) {
          return true;
        }
        const rPhone = r.number || r.phoneNumber || r.phone || r.recipient;
        if (orderPhone9 && rPhone && normalizePhoneLast9(rPhone) === orderPhone9) {
          return true;
        }
        if (r.reportId && report.adminNote && (report.adminNote.includes(`[PROVIDER_REPORT_ID:${r.reportId}]`) || report.adminNote.includes(`CLICKYFIED_REPORT_ID:${r.reportId}`))) {
          return true;
        }
        return false;
      });

      if (repData) {
        reportBelongsToOrder = true;
      } else if (reportsList.length === 1) {
        const cand = reportsList[0];
        if (!isMultiEntryBatch) {
          repData = cand;
          reportBelongsToOrder = true;
        } else {
          // In a multi-entry batch, candidate is ONLY for this order if:
          // 1. Cand entryId matches providerEntryId
          // 2. Cand phone matches orderPhone9
          // 3. Cand reportId matches this report's stored reportId
          // 4. Cand notes specify a refund that matches this order's exact gbAmount (at ~3.75 GHS/GB)
          const candEntryId = cand.orderEntryId || cand.entryId || cand.id;
          const candPhone = cand.number || cand.phoneNumber || cand.phone || cand.recipient;
          const candNotes = cand.adminNotes || cand.adminNote || cand.notes || cand.resolutionNote || "";

          if (candEntryId && providerEntryId && String(candEntryId) === String(providerEntryId)) {
            repData = cand;
            reportBelongsToOrder = true;
          } else if (candPhone && orderPhone9 && normalizePhoneLast9(candPhone) === orderPhone9) {
            repData = cand;
            reportBelongsToOrder = true;
          } else if (cand.reportId && report.adminNote && (report.adminNote.includes(`[PROVIDER_REPORT_ID:${cand.reportId}]`) || report.adminNote.includes(`CLICKYFIED_REPORT_ID:${cand.reportId}`))) {
            repData = cand;
            reportBelongsToOrder = true;
          } else if (!candEntryId && !candPhone) {
            const ghsMatch = String(candNotes).match(/Refund(?:ed)?\s+(?:GHS|GH₵)?\s*([0-9]+(?:\.[0-9]+)?)/i);
            const gbMatch = String(candNotes).match(/Refund(?:ed)?\s+([0-9]+(?:\.[0-9]+)?)\s*GB/i);
            if (ghsMatch) {
              const refundedGhs = parseFloat(ghsMatch[1]);
              const expectedGhs = (report.order.gbAmount || 0) * 3.75;
              if (Math.abs(refundedGhs - expectedGhs) <= 0.1) {
                repData = cand;
                reportBelongsToOrder = true;
              }
            } else if (gbMatch) {
              const refundedGb = parseFloat(gbMatch[1]);
              if (Math.abs(refundedGb - (report.order.gbAmount || 0)) <= 0.1) {
                repData = cand;
                reportBelongsToOrder = true;
              }
            }
          }
        }
      }
    }

    if (!repData && !isMultiEntryBatch) {
      repData = res?.report || res?.data?.report || res?.data || res || {};
      reportBelongsToOrder = true;
    }

    const rawStatus = String(repData?.status || repData?.currentStatus || repData?.reportStatus || "").toLowerCase();
    const adminNotes =
      repData?.adminNotes ||
      repData?.adminNote ||
      repData?.notes ||
      repData?.resolutionNote ||
      repData?.message ||
      null;
    const notesLower = String(adminNotes || "").toLowerCase();
    const resolutionStr = String(
      repData?.resolution || repData?.resolutionType || repData?.action || repData?.decision || ""
    ).toLowerCase();

    const rawOrderStatus = String(
      orderRes?.status || orderRes?.raw?.status || orderRes?.order?.status || ""
    ).toLowerCase();
    const orderSummary = orderRes?.raw?.order?.entrySummary || orderRes?.raw?.entrySummary;
    const orderMappedStatus = rawOrderStatus ? mapClickyfiedStatus(rawOrderStatus, orderSummary) : null;

    let phoneEntryFailed = false;
    let phoneEntryDelivered = false;
    if (report.order.phoneNumber) {
      const matchedEntry = returnedEntries.find(
        (e) =>
          (providerEntryId && (e.id || e.orderEntryId || e.entryId) && String(e.id || e.orderEntryId || e.entryId) === String(providerEntryId)) ||
          ((e.number || (e as any).phoneNumber || (e as any).phone || (e as any).recipient) &&
            normalizePhoneLast9((e.number || (e as any).phoneNumber || (e as any).phone || (e as any).recipient)!) === orderPhone9)
      );
      if (matchedEntry) {
        const entrySt = String(matchedEntry.currentStatus || matchedEntry.status || "").toLowerCase();
        phoneEntryFailed = ["failed", "refund", "refunded", "cancelled", "rejected", "error"].includes(entrySt);
        phoneEntryDelivered = ["confirmed_sent", "delivered"].includes(entrySt);

        const foundEId = matchedEntry.orderEntryId ?? matchedEntry.entryId ?? matchedEntry.id;
        if (foundEId && providerOrderId) {
          await prisma.order
            .update({
              where: { id: report.order.id },
              data: { providerReference: `CLICKYFIED:${providerOrderId}:${foundEId}` },
            })
            .catch(() => {});
        }
      }
    }

    const evidenceUrl =
      repData?.evidenceUrl ||
      repData?.evidence_url ||
      repData?.proofUrl ||
      repData?.proof_url ||
      repData?.imageUrl ||
      repData?.image_url ||
      repData?.evidence?.url ||
      null;

    // 1. Check if Clickyfied explicitly resolved as a refund:
    const isExplicitRefund =
      Boolean(repData) &&
      reportBelongsToOrder &&
      (["refund", "refunded"].includes(rawStatus) ||
        resolutionStr === "refund" ||
        resolutionStr === "refunded" ||
        Boolean(notesLower.match(/refund(?:ed)?\s+(?:ghs|gh₵)?\s*[0-9]+/i)) ||
        Boolean(notesLower.match(/refund(?:ed)?\s+[0-9]+(?:\.[0-9]+)?\s*gb/i)));

    // 2. Check if Clickyfied explicitly resolved as confirmed sent:
    const isExplicitConfirmedSent =
      Boolean(repData) &&
      reportBelongsToOrder &&
      !isExplicitRefund &&
      (["confirmed_sent", "delivered"].includes(rawStatus) ||
        resolutionStr === "confirmed_sent" ||
        resolutionStr === "delivered");

    // 3. Check if Clickyfied explicitly resolved (e.g. proof provided or resolved):
    const isExplicitResolved =
      Boolean(repData) &&
      reportBelongsToOrder &&
      !isExplicitRefund &&
      !isExplicitConfirmedSent &&
      (["resolved", "completed", "closed"].includes(rawStatus) ||
        resolutionStr === "resolved" ||
        Boolean(evidenceUrl));

    // 4. Check if rejected / cancelled:
    const isExplicitRejected =
      Boolean(repData) &&
      reportBelongsToOrder &&
      !isExplicitRefund &&
      (["rejected", "cancelled", "canceled"].includes(rawStatus) ||
        resolutionStr === "rejected" ||
        resolutionStr === "cancelled");

    let newStatus = report.status;
    const isAlreadyDeliveredOrResolved = ["DELIVERED", "CONFIRM_SENT", "RESOLVED"].includes(report.status);

    if (isAlreadyDeliveredOrResolved && !reportBelongsToOrder) {
      newStatus = report.status;
    } else if (isExplicitRefund) {
      newStatus = "REFUNDED";
    } else if (isExplicitConfirmedSent || (phoneEntryDelivered && !isExplicitRefund)) {
      newStatus = "CONFIRM_SENT";
    } else if (isExplicitResolved) {
      newStatus = "RESOLVED";
    } else if (isExplicitRejected) {
      newStatus = "REJECTED";
    } else if (phoneEntryFailed) {
      newStatus = "REFUNDED";
    } else if (["pending_resolution", "pending", "investigating"].includes(rawStatus) && reportBelongsToOrder) {
      newStatus = "INVESTIGATING";
    }

    let proofImage = report.proofImage;
    let proofImageMime = report.proofImageMime;
    let newProofAttached = false;

    // If report is resolved as REFUNDED, clear any previously attached delivery proof
    if (newStatus === "REFUNDED") {
      proofImage = null;
      proofImageMime = null;
    }

    if (evidenceUrl && (!report.proofImage || report.proofImage.startsWith("http"))) {
      try {
        const imgRes = await fetch(evidenceUrl, {
          headers: { "User-Agent": "Tskconnect/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (imgRes.ok) {
          const contentType = imgRes.headers.get("content-type") || "image/jpeg";
          const buffer = Buffer.from(await imgRes.arrayBuffer());
          proofImage = buffer.toString("base64");
          proofImageMime = contentType;
          newProofAttached = true;
        } else {
          proofImage = evidenceUrl;
          proofImageMime = "image/jpeg";
          newProofAttached = true;
        }
      } catch {
        proofImage = evidenceUrl;
        proofImageMime = "image/jpeg";
        newProofAttached = true;
      }
    }

    const statusChanged = newStatus !== report.status;
    const notesChanged = Boolean(reportBelongsToOrder && adminNotes && adminNotes !== report.adminResponse);

    if (statusChanged || notesChanged || newProofAttached) {
      const resolutionDate = repData?.resolutionDate ? new Date(repData.resolutionDate) : undefined;
      await prisma.deliveryReport.update({
        where: { id: report.id },
        data: {
          status: newStatus,
          ...(reportBelongsToOrder && adminNotes ? { adminResponse: adminNotes } : {}),
          respondedAt: resolutionDate || report.respondedAt || new Date(),
          ...(newProofAttached
            ? {
                proofImage,
                proofImageMime,
                proofImageUploadedAt: new Date(),
                proofImageUploadedBy: "Clickyfied API",
              }
            : {}),
          ...(newStatus === "RESOLVED" || newStatus === "DELIVERED" || newStatus === "CONFIRM_SENT" || newStatus === "REFUNDED"
            ? {
                resolvedAt: resolutionDate || report.resolvedAt || new Date(),
                resolvedBy: report.resolvedBy || "Clickyfied API",
              }
            : {}),
        },
      });

      // If order failed/refunded, update order to FAILED (which refunds wallet or flags storefront)
      if (newStatus === "REFUNDED" && report.order.id) {
        try {
          await changeOrderStatus(
            report.order.id,
            "FAILED",
            adminNotes || "Order failed on Clickyfied and was refunded",
            { id: "system", label: actorLabel },
            { force: true }
          );
        } catch (orderErr) {
          console.error("Failed to update order status during delivery report refund:", orderErr);
        }
      }

      // If report is CONFIRM_SENT / DELIVERED / RESOLVED and order was in FAILED, restore order to SUCCESS
      if (
        (newStatus === "CONFIRM_SENT" || newStatus === "DELIVERED" || newStatus === "RESOLVED") &&
        report.order.id &&
        report.order.status === "FAILED"
      ) {
        try {
          await changeOrderStatus(
            report.order.id,
            "SUCCESS",
            adminNotes || `Issue resolved by Clickyfied provider (${newStatus})`,
            { id: "system", label: actorLabel },
            { force: true }
          );
        } catch (orderErr) {
          console.error("Failed to restore order status during delivery confirmation/resolution:", orderErr);
        }
      }

      if (newProofAttached) {
        await prisma.deliveryReportEvent.create({
          data: {
            reportId: report.id,
            type: "EVIDENCE_UPLOADED",
            message: `Delivery proof image received from Clickyfied${evidenceUrl ? ` (${evidenceUrl})` : ""}`,
            actorLabel,
          },
        });
      }

      if (statusChanged) {
        await prisma.deliveryReportEvent.create({
          data: {
            reportId: report.id,
            type: (newStatus === "CONFIRM_SENT" || newStatus === "DELIVERED") ? "MARKED_DELIVERED" : newStatus === "REFUNDED" ? "REFUND" : "RESOLVED",
            message: `Clickyfied report update: ${newStatus}. Notes: ${adminNotes || "None"}`,
            actorLabel,
          },
        });
      }

      return { changed: true };
    }

    return { changed: false };
  } catch (err: any) {
    return { changed: false, error: err?.message || "Report sync failed" };
  }
}

/**
 * Bulk dispatch a list of order IDs according to network routing
 */
export async function dispatchOrdersBatch(orderIds: number[]): Promise<{
  total: number;
  dispatched: number;
  failed: number;
  skippedManual: number;
  results: Array<{ orderId: number; result: ProviderDispatchResult }>;
}> {
  let dispatched = 0;
  let failed = 0;
  let skippedManual = 0;
  const results: Array<{ orderId: number; result: ProviderDispatchResult }> = [];

  for (const id of orderIds) {
    try {
      const result = await dispatchOrder(id, { skipThresholdTrigger: true });
      results.push({ orderId: id, result });
      if (result.provider === "MANUAL") {
        skippedManual += 1;
      } else if (result.success) {
        dispatched += 1;
      } else {
        failed += 1;
      }
    } catch (err: any) {
      failed += 1;
      results.push({
        orderId: id,
        result: { success: false, provider: "MANUAL", error: err?.message || "Internal error" },
      });
    }
  }

  // Trigger threshold check if pending MTN orders accumulated >= threshold
  try {
    const { checkAndTriggerMtnBatch } = await import("./clickyfied-batch");
    await checkAndTriggerMtnBatch("THRESHOLD");
  } catch {
    // Ignore trigger check errors in background
  }

  return {
    total: orderIds.length,
    dispatched,
    failed,
    skippedManual,
    results,
  };
}
