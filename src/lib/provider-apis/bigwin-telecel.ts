import type { BigwinTelecelConfig } from "./types";

export const DEFAULT_BIGWIN_TELECEL_BASE_URL = "https://bigwinportal.com";
export const DEFAULT_BIGWIN_TELECEL_API_KEY = "tbk_23bab40f4c1a4c54600b14ededb7a7d37ed0cc44257732b4016e2c9abdaca528";

export interface BigwinTelecelPackage {
  _id: string;
  name: string;
  dataGB: number;
  priceGHS: number;
  description?: string;
  stockEnabled?: boolean;
  stockQuantity?: number;
}

export interface BigwinTelecelSendResult {
  success: boolean;
  transactionId?: string;
  reference?: string;
  status?: string;
  message?: string;
  raw: any;
}

export interface BigwinTelecelStatusResult {
  success: boolean;
  status?: "success" | "failed" | "pending" | string;
  transactionId?: string;
  reference?: string;
  phone?: string;
  dataGB?: number;
  message?: string;
  raw: any;
}

/**
 * Normalizes Ghanaian phone numbers for Telecel Ghana (10 digits starting with 0, e.g. 050XXXXXXX, 020XXXXXXX).
 */
export function formatTelecelPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("233") && digits.length >= 12) {
    return `0${digits.slice(3, 12)}`;
  }
  if (digits.length === 9) {
    return `0${digits}`;
  }
  if (digits.length === 10 && digits.startsWith("0")) {
    return digits;
  }
  return digits.length > 10 ? digits.slice(-10) : digits;
}

export class BigwinTelecelClient {
  private apiKey: string;
  private baseUrl: string;

  constructor(config?: Partial<BigwinTelecelConfig>) {
    this.apiKey = (config?.apiKey || process.env.BIGWIN_TELECEL_API_KEY || DEFAULT_BIGWIN_TELECEL_API_KEY).trim();
    this.baseUrl = (config?.baseUrl || process.env.BIGWIN_TELECEL_BASE_URL || DEFAULT_BIGWIN_TELECEL_BASE_URL).replace(/\/+$/, "");
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;
    const headers: Record<string, string> = {
      "x-api-key": this.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...((options.headers as Record<string, string>) || {}),
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
        throw new Error(`Bigwin Telecel HTTP ${res.status}: Invalid JSON response: ${text.slice(0, 150)}`);
      }

      if (!res.ok) {
        const errorMsg =
          json?.message ||
          json?.error ||
          json?.errors?.join(", ") ||
          `Bigwin Telecel request failed with status ${res.status}`;
        throw new Error(errorMsg);
      }

      return json as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        throw new Error("Bigwin Telecel request timed out after 20 seconds");
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Fetch list of available Telecel data packages
   */
  async getPackages(): Promise<BigwinTelecelPackage[]> {
    const res = await this.request<any>("/api/v1/packages");
    if (Array.isArray(res)) return res;
    if (Array.isArray(res?.packages)) return res.packages;
    if (Array.isArray(res?.data)) return res.data;
    return [];
  }

  /**
   * Send data bundle to recipient phone
   */
  async sendDataBundle(params: {
    phone: string;
    dataGB: number;
    reference?: string;
  }): Promise<BigwinTelecelSendResult> {
    const formattedPhone = formatTelecelPhone(params.phone);
    const body: Record<string, any> = {
      phone: formattedPhone,
      dataGB: Number(params.dataGB),
    };
    if (params.reference) {
      body.reference = params.reference;
    }

    const res = await this.request<any>("/api/v1/share/send", {
      method: "POST",
      body: JSON.stringify(body),
    });

    const success = res.success === true || res.status === "success" || res.status === "pending";
    const transactionId = res.transactionId || res.transaction_id || res.id || res.data?.transactionId;
    const reference = res.reference || res.data?.reference || params.reference;
    const status = res.status || (res.success ? "success" : "pending");

    return {
      success,
      transactionId,
      reference,
      status,
      message: res.message,
      raw: res,
    };
  }

  /**
   * Check order status by reference or transactionId
   */
  async getOrderStatus(params: {
    reference?: string;
    transactionId?: string;
  }): Promise<BigwinTelecelStatusResult> {
    const query = new URLSearchParams();
    if (params.transactionId) {
      query.set("transactionId", params.transactionId);
    } else if (params.reference) {
      query.set("reference", params.reference);
    } else {
      throw new Error("Either reference or transactionId is required to check order status.");
    }

    try {
      const res = await this.request<any>(`/api/v1/share/status?${query.toString()}`, {
        method: "GET",
      });

      const rawStatus = (res.status || "").toLowerCase().trim();
      return {
        success: res.success !== false,
        status: rawStatus || (res.success ? "success" : undefined),
        transactionId: res.transactionId || res.transaction_id,
        reference: res.reference,
        phone: res.phone,
        dataGB: res.dataGB,
        message: res.message,
        raw: res,
      };
    } catch (err: any) {
      if (err.message && err.message.toLowerCase().includes("not found")) {
        return {
          success: false,
          status: "not_found",
          message: err.message,
          raw: { error: err.message },
        };
      }
      throw err;
    }
  }

  /**
   * List transactions
   */
  async getTransactions(page = 1): Promise<{ transactions: any[]; pagination: any }> {
    const res = await this.request<any>(`/api/v1/transactions?page=${page}`, {
      method: "GET",
    });
    return {
      transactions: Array.isArray(res.transactions) ? res.transactions : [],
      pagination: res.pagination || {},
    };
  }
}
