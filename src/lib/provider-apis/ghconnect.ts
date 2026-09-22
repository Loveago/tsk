import type { GhconnectConfig } from "./types";

export const DEFAULT_GHCONNECT_BASE_URL = "https://ghdataconnect.com/api";

export interface GhconnectOrderResponse {
  success: boolean;
  message?: string;
  data?: {
    order_id?: number;
    reference?: string;
    status?: string;
    recipient?: string;
    network?: string;
    capacity?: number;
    price?: number;
    payment_status?: string;
    created_at?: string;
    delivered_at?: string | null;
  };
  error?: string;
  reference?: string;
  status?: string;
  raw?: any;
}

export interface GhconnectPurchaseBundleInput {
  network: string; // "mtn" | "telecel" | "atbigtime" | "atishare"
  reference: string;
  msisdn: string;
  capacity?: number;
  capacityGb?: number;
}

export interface GhconnectIshareOrderInput {
  reference: string;
  msisdn: string;
  capacity?: number;
  capacityMb?: number;
  capacityGb?: number;
}

/**
 * Normalizes a Ghanaian phone number to 10 digits starting with '0' (e.g. 0276895857)
 * matching the GHConnect API documentation requirements.
 */
export function formatGhconnectPhone(phone: string | null | undefined): string {
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

export class GhconnectClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config?: Partial<GhconnectConfig>) {
    this.apiKey = config?.apiKey || process.env.GHCONNECT_API_KEY || "";
    this.baseUrl = (config?.baseUrl || process.env.GHCONNECT_BASE_URL || DEFAULT_GHCONNECT_BASE_URL).replace(
      /\/+$/,
      ""
    );
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    if (!this.apiKey) {
      throw new Error("GHConnect API Key is not configured");
    }

    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
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
      });

      const text = await res.text();
      let json: any = null;
      try {
        json = text ? JSON.parse(text) : {};
      } catch {
        json = { rawText: text };
      }

      if (!res.ok) {
        const errorMsg =
          json?.message || json?.error || `GHConnect request failed with HTTP ${res.status}`;
        const err = new Error(errorMsg) as any;
        err.status = res.status;
        err.rawResponse = json;
        err.rawText = text;
        throw err;
      }

      if (json && json.success === false) {
        const errorMsg = json?.message || json?.error || "GHConnect operation failed";
        const err = new Error(errorMsg) as any;
        err.status = 400;
        err.rawResponse = json;
        throw err;
      }

      return json as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("GHConnect request timed out after 25 seconds");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Check GHConnect wallet balance via GET /v1/getWalletBalance
   */
  async getBalance(): Promise<{ balance: string; rawBalance: number; currency: string }> {
    const res = await this.request<{
      success: boolean;
      data: { balance: string };
    }>("/v1/getWalletBalance");

    const rawBalance = parseFloat(res?.data?.balance || "0");
    return {
      balance: `GHS ${res?.data?.balance ?? "0.00"}`,
      rawBalance,
      currency: "GHS",
    };
  }

  /**
   * Get all networks and bundles via GET /v1/getAllNetworks
   */
  async getAllNetworks(): Promise<any> {
    return this.request<any>("/v1/getAllNetworks");
  }

  /**
   * Dedicated iShare endpoint via POST /v1/createIshareBundleOrder (capacity in MB).
   * For AirtelTigo iShare, GHConnect uses purchased gigabyte allocation rather than
   * the GHS wallet balance.
   */
  async createIshareBundleOrder(input: GhconnectIshareOrderInput): Promise<GhconnectOrderResponse> {
    let capacityMb = 1000;
    if (typeof input.capacityMb === "number" && input.capacityMb > 0) {
      capacityMb = Math.round(input.capacityMb);
    } else if (typeof input.capacityGb === "number" && input.capacityGb > 0) {
      capacityMb = Math.round(input.capacityGb * 1000);
    } else if (typeof input.capacity === "number" && input.capacity > 0) {
      capacityMb = input.capacity >= 100 ? Math.round(input.capacity) : Math.round(input.capacity * 1000);
    }

    const payload = {
      reference: String(input.reference).trim(),
      msisdn: formatGhconnectPhone(input.msisdn),
      capacity: capacityMb,
    };

    const res = await this.request<any>("/v1/createIshareBundleOrder", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      ...res,
      reference: res?.data?.reference || res?.reference || input.reference,
      status: res?.data?.status || res?.status || (res?.success ? "pending" : "failed"),
      raw: res,
    };
  }

  /**
   * Place bundle order via POST /v1/purchaseBundle (capacity in GB).
   * Networks accepted: mtn, telecel, atishare, atbigtime
   * Deducts from GHS wallet balance.
   */
  async purchaseBundle(input: GhconnectPurchaseBundleInput): Promise<GhconnectOrderResponse> {
    const cap = input.capacityGb ?? input.capacity ?? 1;
    const payload = {
      network: input.network.toLowerCase().trim(),
      reference: String(input.reference).trim(),
      msisdn: formatGhconnectPhone(input.msisdn),
      capacity: cap,
    };

    const res = await this.request<any>("/v1/purchaseBundle", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    return {
      ...res,
      reference: res?.data?.reference || res?.reference || input.reference,
      status: res?.data?.status || res?.status || (res?.success ? "pending" : "failed"),
      raw: res,
    };
  }

  /**
   * Check order status via GET /v1/checkOrderStatus/:reference
   */
  async checkOrderStatus(reference: string): Promise<GhconnectOrderResponse> {
    const cleanRef = reference.trim();
    const res = await this.request<any>(
      `/v1/checkOrderStatus/${encodeURIComponent(cleanRef)}`
    );

    return {
      ...res,
      reference: res?.data?.reference || res?.reference || cleanRef,
      status: res?.data?.status || res?.status || (res?.success ? "pending" : "failed"),
      raw: res,
    };
  }
}
