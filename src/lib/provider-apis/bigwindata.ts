import crypto from "crypto";
import type { BigwindataBundle, BigwindataConfig } from "./types";

export const DEFAULT_BIGWINDATA_BASE_URL = "https://bigwindatagh.com/api";
export const DEFAULT_BIGWINDATA_API_KEY = "ak_eaccfe263cfab291ea6e240ad52c2a954c1d9b5df580864f";

// In-memory bundle cache with 10-minute TTL to reduce repetitive network calls
let cachedBundles: { timestamp: number; data: BigwindataBundle[] } | null = null;
const CACHE_TTL_MS = 10 * 60 * 1000;

export class BigwindataClient {
  private apiKey: string;
  private baseUrl: string;
  private webhookSecret: string;

  constructor(config?: Partial<BigwindataConfig>) {
    this.apiKey = config?.apiKey || process.env.BIGWINDATA_API_KEY || DEFAULT_BIGWINDATA_API_KEY;
    this.baseUrl = (config?.baseUrl || process.env.BIGWINDATA_BASE_URL || DEFAULT_BIGWINDATA_BASE_URL).replace(/\/+$/, "");
    this.webhookSecret = config?.webhookSecret || process.env.BIGWINDATA_WEBHOOK_SECRET || "";
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      "X-API-Key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(options.headers as Record<string, string> || {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        throw new Error(`Bigwindata HTTP ${res.status}: Invalid JSON response: ${text.slice(0, 150)}`);
      }

      if (!res.ok) {
        const errorMsg =
          json?.errors?.join(", ") ||
          json?.message ||
          json?.error ||
          `Bigwindata request failed with status ${res.status}`;
        throw new Error(errorMsg);
      }

      if (json && json.status === "error") {
        const errorMsg = json?.errors?.join(", ") || json?.message || "Bigwindata returned error status";
        throw new Error(errorMsg);
      }

      return json as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("Bigwindata request timed out after 20 seconds");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check Bigwindata wallet balance
   */
  async getBalance(): Promise<{ balance: string; rawBalance: number; currency: string }> {
    const res = await this.request<{
      status: string;
      data: { balance: string; rawBalance: number; currency: string };
    }>("/balance");

    return res.data;
  }

  /**
   * Fetch active catalogue bundles, optionally filtered by network_code
   * network_code: mtn | mtn_xpress | telecel | at_ishare | at_bigtime
   */
  async getBundles(networkCode?: string, forceRefresh = false): Promise<BigwindataBundle[]> {
    const now = Date.now();
    if (!forceRefresh && cachedBundles && now - cachedBundles.timestamp < CACHE_TTL_MS) {
      if (!networkCode) return cachedBundles.data;
      return cachedBundles.data.filter((b) => b.network_code.toLowerCase() === networkCode.toLowerCase());
    }

    try {
      const res = await this.request<{ status: string; data: BigwindataBundle[] }>("/bundles");
      if (Array.isArray(res.data)) {
        cachedBundles = { timestamp: now, data: res.data };
      }
    } catch (err) {
      if (networkCode) {
        const res = await this.request<{ status: string; data: BigwindataBundle[] }>(
          `/bundles?network_code=${encodeURIComponent(networkCode)}`
        );
        return res.data || [];
      }
      throw err;
    }

    if (!cachedBundles) return [];
    if (!networkCode) return cachedBundles.data;
    return cachedBundles.data.filter((b) => b.network_code.toLowerCase() === networkCode.toLowerCase());
  }

  /**
   * Map standard application network names and subtypes to Bigwindata network codes
   */
  mapNetworkToCode(network: string, packageType?: string | null): string {
    const net = (network || "").trim().toUpperCase();
    const netClean = net.replace(/[\s_-]+/g, "");
    const type = (packageType || "").trim().toUpperCase();
    const typeClean = type.replace(/[\s_-]+/g, "");

    if (netClean.includes("XPRESS") || typeClean.includes("XPRESS")) {
      return "mtn_xpress";
    }
    if (netClean.includes("BIGTIME") || typeClean.includes("BIGTIME")) {
      return "at_bigtime";
    }
    if (netClean.includes("ISHARE") || typeClean.includes("ISHARE")) {
      return "at_ishare";
    }

    switch (net) {
      case "MTN":
        return "mtn";
      case "TELECEL":
        return "telecel";
      case "AIRTELTIGO":
        // Default AirtelTigo to ishare or bigtime based on naming
        return "at_ishare";
      default:
        return net.toLowerCase();
    }
  }

  /**
   * Resolve a bundle ID for a specific network and GB amount
   */
  async resolveBundleId(network: string, gbAmount: number): Promise<number> {
    const networkCode = this.mapNetworkToCode(network);
    const bundles = await this.getBundles();

    // 1. Check exact network_code match
    let match = bundles.find(
      (b) =>
        b.network_code.toLowerCase() === networkCode.toLowerCase() &&
        (Math.abs(b.capacity_gb - gbAmount) < 0.01 || b.label.toLowerCase().includes(`${gbAmount}gb`))
    );

    // 2. If network is MTN and not found under 'mtn', check 'mtn_xpress'
    if (!match && networkCode === "mtn") {
      match = bundles.find(
        (b) =>
          b.network_code.toLowerCase() === "mtn_xpress" &&
          (Math.abs(b.capacity_gb - gbAmount) < 0.01 || b.label.toLowerCase().includes(`${gbAmount}gb`))
      );
    }

    // 3. If network is AirtelTigo and not found, check alternate AT subtype
    if (!match && (networkCode === "at_ishare" || networkCode === "at_bigtime")) {
      const altCode = networkCode === "at_ishare" ? "at_bigtime" : "at_ishare";
      match = bundles.find(
        (b) =>
          b.network_code.toLowerCase() === altCode &&
          (Math.abs(b.capacity_gb - gbAmount) < 0.01 || b.label.toLowerCase().includes(`${gbAmount}gb`))
      );
    }

    if (!match) {
      throw new Error(
        `No Bigwindata bundle found for network "${network}" (${networkCode}) with ${gbAmount}GB`
      );
    }

    return match.id;
  }

  /**
   * Purchase a single bundle for a recipient
   */
  async purchase(params: {
    bundleId: number;
    recipient: string;
    idempotencyKey?: string;
    webhookUrl?: string;
  }): Promise<{
    orderId: number;
    order_id: number;
    reference: string;
    status: string;
    price: string;
    rawPrice: number;
    balance?: string;
    rawBalance?: number;
  }> {
    // Normalization of recipient: 10-digit Ghanaian format (e.g. 0XXXXXXXXX)
    let recipient = params.recipient.trim();
    if (recipient.startsWith("+233")) recipient = "0" + recipient.slice(4);
    else if (recipient.startsWith("233")) recipient = "0" + recipient.slice(3);

    const payload: Record<string, unknown> = {
      bundle_id: params.bundleId,
      recipient,
    };
    if (params.idempotencyKey) payload.idempotency_key = params.idempotencyKey;
    if (params.webhookUrl) payload.webhook_url = params.webhookUrl;

    const res = await this.request<{
      status: string;
      data: {
        id?: number;
        order_id?: number;
        reference: string;
        status: string;
        price: string;
        rawPrice: number;
        balance?: string;
        rawBalance?: number;
      };
    }>("/purchase", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    const resData = res.data;
    const orderId = resData.id ?? resData.order_id ?? 0;

    return {
      orderId,
      order_id: orderId,
      reference: resData.reference,
      status: resData.status,
      price: resData.price,
      rawPrice: resData.rawPrice,
      balance: resData.balance,
      rawBalance: resData.rawBalance,
    };
  }

  /**
   * Verify HMAC-SHA256 signature on incoming webhook payload
   */
  verifyWebhookSignature(rawBody: string, signature: string, customSecret?: string): boolean {
    const secret = customSecret || this.webhookSecret;
    if (!secret) {
      // If no secret configured, treat as unverified or log warning
      return true;
    }
    if (!signature) return false;

    try {
      const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
      const expectedBuf = Buffer.from(expected);
      const sigBuf = Buffer.from(signature);
      if (expectedBuf.length !== sigBuf.length) return false;
      return crypto.timingSafeEqual(expectedBuf, sigBuf);
    } catch {
      return false;
    }
  }
}
