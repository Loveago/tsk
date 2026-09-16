import { prisma } from "../prisma";
import { changeOrderStatus } from "../orders";
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
  options: { force?: boolean } = {}
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
    try {
      const bundleId = await client.resolveBundleId(order.network, order.gbAmount);
      const webhookUrl = `${appBaseUrl}/api/webhooks/providers/bigwindata`;

      const purchaseRes = await client.purchase({
        bundleId,
        recipient: order.phoneNumber,
        idempotencyKey: `TSK-ORD-${order.id}`,
        webhookUrl,
      });

      const providerRef = `BIGWIN:${purchaseRes.orderId || purchaseRes.order_id || purchaseRes.reference}`;

      // Update provider reference
      await prisma.order.update({
        where: { id: order.id },
        data: {
          providerReference: providerRef,
          failureReason: null,
        },
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
      const errMsg = err?.message || "Failed to dispatch order to Bigwindata";
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

    const client = new ClickyfiedClient(config.clickyfied);
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

      const submitRes = await client.submitOrder({
        externalReference,
        entries: [{ number: order.phoneNumber, allocationGB: order.gbAmount }],
        callbackUrl,
        callbackSigningSecret: signingSecret || undefined,
        idempotencyKey: externalReference,
      });

      const orderId = submitRes.orderId || externalReference;
      const providerRef = `CLICKYFIED:${orderId}`;

      const rawAny = submitRes.raw as any;
      const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
      const rawStatus = rawAny?.order?.status || submitRes.status || rawAny?.status;
      const mappedStatus = mapClickyfiedStatus(rawStatus, summary);

      await prisma.order.update({
        where: { id: order.id },
        data: {
          providerReference: providerRef,
          externalReference: order.externalReference || externalReference,
          failureReason: null,
        },
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
        success: true,
        provider: "CLICKYFIED",
        providerReference: providerRef,
        status: mappedStatus,
        raw: submitRes,
      };
    } catch (err: any) {
      const errMsg = err?.message || "Failed to dispatch order to Clickyfied";
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
  if (entrySummary && typeof entrySummary.total === "number" && entrySummary.total > 0) {
    const total = entrySummary.total;
    const sent = entrySummary.sent ?? 0;
    const error = entrySummary.error ?? 0;
    const processing = entrySummary.processing ?? 0;
    const pending = entrySummary.pending ?? 0;

    if (sent >= total) return "SUCCESS";
    if (error >= total) return "FAILED";
    if (processing > 0) return "PROCESSING";
    if (pending >= total) return "PENDING";
  }

  const s = (rawStatus || "").trim().toLowerCase();
  if (["completed", "delivered", "sent", "processed", "success"].includes(s)) {
    return "SUCCESS";
  }
  if (processedAt && !["failed", "rejected", "error", "unsuccessful", "cancelled", "canceled"].includes(s)) {
    return "SUCCESS";
  }
  if (["processing", "in_progress", "sending", "in-progress"].includes(s)) {
    return "PROCESSING";
  }
  if (["failed", "rejected", "error", "unsuccessful"].includes(s)) {
    return "FAILED";
  }
  if (["cancelled", "canceled"].includes(s)) {
    return "CANCELLED";
  }
  if (["pending", "accepted", "submitted", "queued", "created"].includes(s)) {
    return "PENDING";
  }

  return "PENDING";
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

    const providerId = order.providerReference.replace("CLICKYFIED:", "").trim();
    if (!providerId) return { changed: false };

    lastCheckedOrders.set(orderId, now);

    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    const res = await client.getOrderStatus(providerId);
    const rawAny = res.raw as any;
    const summary = rawAny?.order?.entrySummary || rawAny?.entrySummary;
    const rawStatus = rawAny?.order?.status || res.status || rawAny?.status;
    const processedAt = rawAny?.order?.processedAt || rawAny?.processedAt;

    const targetStatus = mapClickyfiedStatus(rawStatus, summary, processedAt);

    if (targetStatus && targetStatus !== order.status) {
      await changeOrderStatus(
        order.id,
        targetStatus,
        `Synced with Clickyfied (${rawStatus || targetStatus})`,
        { id: "system", label: actorLabel },
        { force: true }
      );
      return { changed: true, previousStatus: order.status, newStatus: targetStatus };
    }

    return { changed: false, newStatus: order.status };
  } catch (err: any) {
    // If rate limited by Clickify (429), silently return unchanged without throwing
    if (err?.status === 429 || err?.message?.includes("429") || err?.message?.includes("Polling too frequently")) {
      return { changed: false, error: "Rate limit: wait 30s" };
    }
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
          },
        },
      },
    });

    if (!report || !report.order) return { changed: false };

    // If report is already closed AND has proof image attached (or is REFUNDED), no further sync needed
    if (
      report.status === "REFUNDED" ||
      ((report.status === "RESOLVED" || report.status === "DELIVERED" || report.status === "REJECTED") &&
        report.proofImageMime &&
        report.proofImage)
    ) {
      return { changed: false };
    }

    // Identify Clickify order identifier
    let clickyfiedId = report.order.providerReference?.startsWith("CLICKYFIED:")
      ? report.order.providerReference.replace("CLICKYFIED:", "").trim()
      : null;

    if (!clickyfiedId && report.order.externalReference) {
      clickyfiedId = report.order.externalReference;
    }

    if (!clickyfiedId) {
      const config = await getProviderRoutingConfig();
      const route = config.networkRoutes[report.order.network] || config.defaultProvider;
      if (route === "CLICKYFIED") {
        clickyfiedId = `TSK-ORD-${report.order.id}`;
      }
    }

    if (!clickyfiedId) return { changed: false };

    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    let res: any;
    try {
      res = await client.getNotReceivedStatus(clickyfiedId);
    } catch (apiErr: any) {
      res = null;
    }

    let orderRes: any = null;
    try {
      orderRes = await client.getOrderStatus(clickyfiedId);
    } catch {
      orderRes = null;
    }

    if (!res && !orderRes) return { changed: false };

    const repData =
      Array.isArray(res?.reports) && res.reports.length > 0
        ? res.reports[0]
        : res?.report || res?.data || res || {};

    const rawStatus = String(repData?.status || "").toLowerCase();
    const adminNotes =
      repData?.adminNotes ||
      repData?.adminNote ||
      repData?.notes ||
      repData?.resolutionNote ||
      null;
    const notesLower = String(adminNotes || "").toLowerCase();

    const rawOrderStatus = String(
      orderRes?.status || orderRes?.raw?.status || orderRes?.order?.status || ""
    ).toLowerCase();
    const orderSummary = orderRes?.raw?.order?.entrySummary || orderRes?.raw?.entrySummary;
    const orderMappedStatus = rawOrderStatus ? mapClickyfiedStatus(rawOrderStatus, orderSummary) : null;

    const isFailedOrRefunded =
      ["failed", "refund", "refunded", "fail", "failure", "unsuccessful"].includes(rawStatus) ||
      orderMappedStatus === "FAILED" ||
      ["failed", "cancelled", "canceled", "rejected", "error", "unsuccessful", "refunded"].includes(rawOrderStatus) ||
      notesLower.includes("refund") ||
      notesLower.includes("failed") ||
      notesLower.includes("fail ");

    let newStatus = report.status;
    if (isFailedOrRefunded) {
      newStatus = "REFUNDED";
    } else if (["confirmed_sent", "sent", "delivered"].includes(rawStatus)) {
      newStatus = "DELIVERED";
    } else if (["resolved", "completed"].includes(rawStatus)) {
      newStatus = "RESOLVED";
    } else if (["rejected", "cancelled", "canceled"].includes(rawStatus)) {
      newStatus = "REJECTED";
    } else if (["pending_resolution", "pending", "investigating"].includes(rawStatus)) {
      newStatus = "INVESTIGATING";
    }

    const evidenceUrl =
      repData.evidenceUrl ||
      repData.evidence_url ||
      repData.proofUrl ||
      repData.proof_url ||
      repData.imageUrl ||
      repData.image_url ||
      repData.evidence?.url ||
      null;

    let proofImage = report.proofImage;
    let proofImageMime = report.proofImageMime;
    let newProofAttached = false;

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
    const notesChanged = Boolean(adminNotes && adminNotes !== report.adminResponse);

    if (statusChanged || notesChanged || newProofAttached) {
      await prisma.deliveryReport.update({
        where: { id: report.id },
        data: {
          status: newStatus,
          adminResponse: adminNotes || report.adminResponse,
          ...(newProofAttached
            ? {
                proofImage,
                proofImageMime,
                proofImageUploadedAt: new Date(),
                proofImageUploadedBy: "Clickyfied API",
              }
            : {}),
          ...(newStatus === "RESOLVED" || newStatus === "DELIVERED" || newStatus === "REFUNDED"
            ? {
                resolvedAt: report.resolvedAt || new Date(),
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
            type: newStatus === "DELIVERED" ? "MARKED_DELIVERED" : newStatus === "REFUNDED" ? "REFUND" : "RESOLVED",
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
      const result = await dispatchOrder(id);
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

  return {
    total: orderIds.length,
    dispatched,
    failed,
    skippedManual,
    results,
  };
}
