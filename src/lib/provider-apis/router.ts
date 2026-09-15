import { prisma } from "../prisma";
import { changeOrderStatus } from "../orders";
import { BigwindataClient, DEFAULT_BIGWINDATA_API_KEY, DEFAULT_BIGWINDATA_BASE_URL } from "./bigwindata";
import { ClickyfiedClient, DEFAULT_CLICKYFIED_API_KEY, DEFAULT_CLICKYFIED_CLIENT_ID, DEFAULT_CLICKYFIED_SANDBOX_URL, generateClickyfiedReference } from "./clickyfied";
import type { ProviderRoutingConfig, ProviderType, ProviderDispatchResult } from "./types";

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
 * Determine which provider serves a given network
 */
export async function getProviderForNetwork(
  network: string,
  packageNameOrType?: string | null
): Promise<ProviderType> {
  const config = await getProviderRoutingConfig();
  if (!config.enabled) {
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

  return config.defaultProvider || "MANUAL";
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
  if (!config.enabled) {
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
      const callbackUrl = `${appBaseUrl}/api/webhooks/providers/clickyfied`;
      // Use user-requested pattern: order-1788XXXXXXXXX
      const externalReference = generateClickyfiedReference(order.id);

      const submitRes = await client.submitOrder({
        externalReference,
        entries: [{ number: order.phoneNumber, allocationGB: order.gbAmount }],
        callbackUrl,
        callbackSigningSecret: config.clickyfied.callbackSigningSecret,
        idempotencyKey: externalReference,
      });

      const orderId = submitRes.orderId || externalReference;
      const providerRef = `CLICKYFIED:${orderId}`;

      await prisma.order.update({
        where: { id: order.id },
        data: {
          providerReference: providerRef,
          externalReference: order.externalReference || externalReference,
          failureReason: null,
        },
      });

      await changeOrderStatus(
        order.id,
        "PROCESSING",
        `Dispatched via Clickyfied API (Order: ${orderId})`,
        { id: "system", label: "Clickyfied API" },
        { force: true }
      );

      return {
        success: true,
        provider: "CLICKYFIED",
        providerReference: providerRef,
        status: "PROCESSING",
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
