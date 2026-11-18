import { createHmac, timingSafeEqual } from "crypto";
import type { AdhgroupConfig } from "./types";

export const DEFAULT_ADHGROUP_BASE_URL = "https://www.adhgroupgh.com/api/v1";

export interface AdhgroupOffer {
  name: string;
  isp: string;
  type: string;
  description?: string;
  offerSlug: string;
  volumes: Array<number | string>;
}

export interface AdhgroupValidateResultItem {
  phone?: string;
  recipient?: string;
  eligible: boolean;
  code?: string;
  reason?: string;
}

export interface AdhgroupSingleOrderResponse {
  success: boolean;
  message?: string;
  error?: string;
  type?: string;
  orderId?: string;
  reference?: string;
  status?: string;
  order?: {
    orderId?: string;
    reference?: string;
    status?: string;
    recipient?: string;
    volume?: number | string;
    price?: number;
    amount?: number;
    timestamp?: string;
  };
  price?: number;
  amount?: number;
  skipped?: Array<{ phone?: string; recipient?: string; reason?: string; code?: string }>;
}

export interface AdhgroupOrderStatusResponse {
  success: boolean;
  order?: {
    orderId: string;
    reference?: string;
    status: string;
    recipient?: string;
    volume?: number | string;
    timestamp?: string;
    reason?: string;
  };
  status?: string;
  error?: string;
  type?: string;
}

/**
 * Normalizes a Ghanaian phone number to 10 digits starting with '0' (e.g. 0241234567).
 */
export function formatAdhgroupPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length === 12) {
    return `0${digits.slice(3)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  return digits;
}

/**
 * Maps internal network name to ADH Group v1 path segment ("mtn" | "telecel" | "at").
 */
export function mapNetworkToAdhgroupPath(network: string): "mtn" | "telecel" | "at" {
  const norm = (network || "").trim().toUpperCase();
  if (norm.includes("MTN")) return "mtn";
  if (norm.includes("TELECEL") || norm.includes("VODAFONE")) return "telecel";
  if (norm.includes("AIRTEL") || norm === "AT" || norm.includes("ISHARE") || norm.includes("BIGTIME")) {
    return "at";
  }
  throw new Error(`Unsupported network for ADH Group: ${network}`);
}

/**
 * Checks whether an error type / message from ADH Group represents an MTN restriction / unverified rejection.
 */
export function isAdhgroupMtnRejectionError(err: any): boolean {
  const errType = String(err?.errorType || err?.rawResponse?.type || "").toUpperCase();
  const msg = String(err?.message || err?.rawResponse?.error || "").toLowerCase();
  return (
    errType === "MTN_RESTRICTION" ||
    msg.includes("mtn_restriction") ||
    msg.includes("restricted") ||
    msg.includes("not verified") ||
    msg.includes("ineligible") ||
    msg.includes("not eligible")
  );
}

/**
 * Verifies ADH Group v1 webhook HMAC-SHA256 signature (`sha256=<hex>`).
 */
export function verifyAdhgroupWebhookSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string
): boolean {
  if (!secret || !signatureHeader) return false;
  const trimmed = signatureHeader.trim();
  const providedHex = trimmed.startsWith("sha256=") ? trimmed.slice(7) : trimmed;
  const expectedHex = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(providedHex, "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

export class AdhgroupClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config?: Partial<AdhgroupConfig>) {
    this.apiKey = (config?.apiKey || process.env.ADHGROUP_API_KEY || "").trim();
    this.baseUrl = (
      config?.baseUrl ||
      process.env.ADHGROUP_BASE_URL ||
      DEFAULT_ADHGROUP_BASE_URL
    ).replace(/\/+$/, "");
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error("ADH Group API Key is not configured");
    }

    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((options.headers as Record<string, string>) || {}),
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, {
        ...options,
        headers,
        signal: controller.signal,
        cache: "no-store",
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { rawText: text };
      }

      if (!res.ok || (json && json.success === false)) {
        const errorMsg =
          json?.error || json?.message || `ADH Group request failed with HTTP ${res.status}`;
        const err = new Error(errorMsg) as any;
        err.status = res.status;
        err.errorType = json?.type;
        err.rawResponse = json;
        err.rawText = text;
        throw err;
      }

      return json as T;
    } catch (err: any) {
      if (err?.name === "AbortError") {
        const timeoutErr = new Error("ADH Group API request timed out after 25s") as any;
        timeoutErr.status = 504;
        throw timeoutErr;
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  async getBalance(): Promise<{ success: boolean; balance: number; currency: string; timestamp?: string }> {
    return this.request("/balance", { method: "GET" });
  }

  async getOffers(): Promise<{ success: boolean; offers: AdhgroupOffer[]; authMethod?: string }> {
    return this.request("/offers", { method: "GET" });
  }

  async validateRecipient(input: {
    phone: string;
    network?: string;
    offerSlug?: string;
  }): Promise<{
    eligible: boolean;
    code?: string;
    reason?: string;
    raw: any;
  }> {
    const phone = formatAdhgroupPhone(input.phone);
    const body: Record<string, unknown> = {
      phone,
      network: (input.network || "MTN").toUpperCase(),
    };
    if (input.offerSlug?.trim()) {
      body.offerSlug = input.offerSlug.trim();
    }

    const res = await this.request<any>("/orders/validate-recipient", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const first: AdhgroupValidateResultItem | undefined = Array.isArray(res?.results)
      ? res.results[0]
      : res;

    return {
      eligible: Boolean(first?.eligible),
      code: first?.code,
      reason: first?.reason,
      raw: res,
    };
  }

  async validateRecipients(input: {
    phones: string[];
    network?: string;
    offerSlug?: string;
  }): Promise<{ results: AdhgroupValidateResultItem[]; raw: any }> {
    const body: Record<string, unknown> = {
      phones: input.phones.map((p) => formatAdhgroupPhone(p)),
      network: (input.network || "MTN").toUpperCase(),
    };
    if (input.offerSlug?.trim()) {
      body.offerSlug = input.offerSlug.trim();
    }
    const res = await this.request<any>("/orders/validate-recipients", {
      method: "POST",
      body: JSON.stringify(body),
    });
    return {
      results: Array.isArray(res?.results) ? res.results : [],
      raw: res,
    };
  }

  async placeSingleDataOrder(input: {
    network: string;
    gbAmount: number;
    phone: string;
    offerSlug?: string;
    metadata?: Record<string, unknown>;
  }): Promise<AdhgroupSingleOrderResponse> {
    const networkPath = mapNetworkToAdhgroupPath(input.network);
    const volumeLabel = Number.isInteger(input.gbAmount)
      ? `${input.gbAmount}GB`
      : `${input.gbAmount}GB`;
    const body: Record<string, unknown> = {
      type: "single",
      volume: volumeLabel,
      phone: formatAdhgroupPhone(input.phone),
    };
    if (input.offerSlug?.trim()) {
      body.offerSlug = input.offerSlug.trim();
    }
    if (input.metadata) {
      body.metadata = input.metadata;
    }

    return this.request<AdhgroupSingleOrderResponse>(`/order/${networkPath}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async placeBulkDataOrder(input: {
    network: string;
    items: Array<{ volume: number | string; phone: string }>;
    offerSlug?: string;
  }): Promise<any> {
    const networkPath = mapNetworkToAdhgroupPath(input.network);
    const body: Record<string, unknown> = {
      type: "bulk",
      items: input.items.map((item) => ({
        volume: item.volume,
        recipient: formatAdhgroupPhone(item.phone),
      })),
    };
    if (input.offerSlug?.trim()) {
      body.offerSlug = input.offerSlug.trim();
    }

    return this.request<any>(`/order/${networkPath}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  async getOrderStatus(identifier: string): Promise<AdhgroupOrderStatusResponse> {
    return this.request<AdhgroupOrderStatusResponse>(
      `/order/status/${encodeURIComponent(identifier)}`,
      { method: "GET" }
    );
  }

  async getBulkOrderStatus(identifiers: string[]): Promise<any> {
    return this.request<any>("/order/status/bulk", {
      method: "POST",
      body: JSON.stringify({ identifiers }),
    });
  }
}
