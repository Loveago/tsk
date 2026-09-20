import type { ClickyfiedConfig, NumberVerificationResult } from "./types";
import { normalizeGhanaPhoneNumber } from "@/lib/phone-utils";

export const DEFAULT_CLICKYFIED_SANDBOX_URL = "https://sandbox.clickyfied4u.com";
export const DEFAULT_CLICKYFIED_PROD_URL = "https://www.clickyfied4u.com";
export const DEFAULT_CLICKYFIED_API_KEY = "TTGmkuEePjeQl9HpxOuEYM3bILy2FiZhP8gv9GgwsKeJsMqv7BKWSTZ-WN6Y-DSN";
export const DEFAULT_CLICKYFIED_CLIENT_ID = "ext-topskankatest-001";

/**
 * Generates an external reference for Clickyfied orders matching pattern:
 * order-1788XXXXXXXXX (where X are 9 random digits or padded digits)
 */
export function generateClickyfiedReference(seedId?: number | string): string {
  // Generate a random 9-digit sequence
  const random9 = Math.floor(100000000 + Math.random() * 900000000).toString();
  return `order-1788${random9}`;
}

export class ClickyfiedClient {
  private apiKey: string;
  private baseUrl: string;
  private clientId: string;
  private callbackSigningSecret: string;

  constructor(config?: Partial<ClickyfiedConfig>) {
    this.apiKey = config?.apiKey || process.env.CLICKYFIED_API_KEY || DEFAULT_CLICKYFIED_API_KEY;
    this.baseUrl = (
      config?.baseUrl ||
      process.env.CLICKYFIED_BASE_URL ||
      DEFAULT_CLICKYFIED_SANDBOX_URL
    ).replace(/\/+$/, "");
    this.clientId =
      config?.clientId || process.env.CLICKYFIED_CLIENT_ID || DEFAULT_CLICKYFIED_CLIENT_ID;
    this.callbackSigningSecret =
      config?.callbackSigningSecret || process.env.CLICKYFIED_CALLBACK_SECRET || "";
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    customHeaders: Record<string, string> = {}
  ): Promise<T> {
    // Ensure public api root is prefixed if omitted
    const cleanEndpoint = endpoint.startsWith("/") ? endpoint : `/${endpoint}`;
    const apiPath = cleanEndpoint.startsWith("/api/")
      ? cleanEndpoint
      : `/api/public/v1${cleanEndpoint}`;
    const url = `${this.baseUrl}${apiPath}`;

    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...customHeaders,
      ...(options.headers as Record<string, string> || {}),
    };

    if (this.clientId && !headers["X-Client-Id"]) {
      headers["X-Client-Id"] = this.clientId;
    }

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
        json = text ? JSON.parse(text) : null;
      } catch {
        const parseErr = new Error(
          `Clickyfied HTTP ${res.status}: Invalid JSON response: ${text.slice(0, 150)}`
        ) as Error & { status?: number; rawText?: string; endpoint?: string; url?: string };
        parseErr.status = res.status;
        parseErr.rawText = text;
        parseErr.endpoint = apiPath;
        parseErr.url = url;
        throw parseErr;
      }

      if (!res.ok) {
        const errorMsg =
          json?.message ||
          json?.error ||
          (json?.errors && JSON.stringify(json.errors)) ||
          `Clickyfied request failed with HTTP ${res.status}`;
        const err = new Error(errorMsg) as Error & {
          status?: number;
          rawResponse?: any;
          rawText?: string;
          endpoint?: string;
          url?: string;
        };
        err.status = res.status;
        err.rawResponse = json;
        err.rawText = text;
        err.endpoint = apiPath;
        err.url = url;
        throw err;
      }

      return json as T;
    } catch (err: any) {
      if (err.name === "AbortError") {
        const timeoutErr = new Error("Clickyfied request timed out after 25 seconds") as Error & {
          status?: number;
          endpoint?: string;
          url?: string;
        };
        timeoutErr.status = 504;
        timeoutErr.endpoint = apiPath;
        timeoutErr.url = url;
        throw timeoutErr;
      }
      if (!err.endpoint) err.endpoint = apiPath;
      if (!err.url) err.url = url;
      throw err;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Action 1 & Action 2: Submit an order to Clickyfied
   */
  async submitOrder(params: {
    externalReference: string;
    entries: Array<{ number: string; allocationGB: number }>;
    callbackUrl?: string;
    callbackSigningSecret?: string;
    idempotencyKey?: string;
  }): Promise<{
    orderId?: string | number;
    externalReference?: string;
    status?: string;
    entries?: Array<any>;
    reused?: boolean;
    raw: unknown;
  }> {
    const idemKey = params.idempotencyKey || params.externalReference;
    const body: Record<string, unknown> = {
      externalReference: params.externalReference,
      entries: params.entries.map((e) => {
        let num = e.number.trim();
        if (num.startsWith("+233")) num = "0" + num.slice(4);
        else if (num.startsWith("233")) num = "0" + num.slice(3);
        return { number: num, allocationGB: e.allocationGB };
      }),
    };

    const signingSecret = (params.callbackSigningSecret || this.callbackSigningSecret || "").trim();
    // Clickyfied strictly requires callbackSigningSecret whenever callbackUrl is provided
    if (params.callbackUrl && signingSecret) {
      body.callbackUrl = params.callbackUrl;
      body.callbackSigningSecret = signingSecret;
    } else if (params.callbackUrl && !signingSecret) {
      console.warn("[Clickyfied] Warning: callbackUrl omitted because callbackSigningSecret is missing (required by Clickyfied).");
    }

    const res = await this.request<any>(
      "/orders",
      {
        method: "POST",
        body: JSON.stringify(body),
      },
      {
        "Idempotency-Key": idemKey,
      }
    );

    const orderId =
      res?.order?.orderId ||
      res?.order?.id ||
      res?.id ||
      res?.orderId ||
      res?.data?.id ||
      res?.data?.orderId;
    const entries =
      res?.order?.entries ||
      res?.entries ||
      res?.data?.entries ||
      [];
    const status = res?.status || res?.data?.status || res?.order?.status || "accepted";

    return {
      orderId,
      externalReference: params.externalReference,
      status,
      entries,
      reused: !!res?.reused,
      raw: res,
    };
  }

  /**
   * Resolves an orderId or externalReference (e.g. CF-BATCH-000006) to Clickyfied's
   * canonical orderId (e.g. order-1789655697659).
   */
  async resolveCanonicalOrderId(idOrRef: string | number): Promise<string> {
    const raw = String(idOrRef).trim();
    if (raw.startsWith("order-") || raw.startsWith("ext-")) {
      return raw;
    }
    // If it is not a local batch code (like CF-BATCH-), and has length >= 10, it is already a canonical provider ID
    if (!raw.startsWith("CF-BATCH-") && !raw.startsWith("TSK-") && raw.length > 10) {
      return raw;
    }

    try {
      const res = await this.request<any>("/orders?limit=100");
      const list: any[] = res?.orders || res?.data?.orders || [];
      const match = list.find(
        (o: any) =>
          o.externalReference === raw ||
          o.orderId === raw ||
          o.id === raw
      );
      if (match?.orderId) {
        return String(match.orderId);
      }
    } catch {
      // ignore
    }

    return raw;
  }

  /**
   * Searches recent Clickyfied orders for a specific recipient phone number.
   * Returns canonical orderId, orderEntryId, and entry status.
   */
  async findOrderByPhone(phoneNumber: string): Promise<{
    orderId?: string;
    orderEntryId?: number | string;
    status?: string;
    number?: string;
    allocationGb?: number;
  } | null> {
    const rawClean = String(phoneNumber || "").trim();
    let cleanLast9 = rawClean.replace(/\D/g, "");
    if (cleanLast9.length > 9) cleanLast9 = cleanLast9.slice(-9);

    try {
      const res = await this.request<any>("/orders?limit=50");
      const orders = res?.orders || res?.data?.orders || [];
      for (const o of orders) {
        try {
          const details = await this.getOrderStatus(o.orderId);
          const entries: any[] =
            (details.raw as any)?.order?.entries || (details.raw as any)?.entries || [];
          const match = entries.find((e: any) => {
            if (!e.number) return false;
            let eNum = String(e.number).replace(/\D/g, "");
            if (eNum.length > 9) eNum = eNum.slice(-9);
            return eNum === cleanLast9;
          });
          if (match) {
            const eId = match.orderEntryId ?? match.entryId ?? match.id ?? match._id;
            return {
              orderId: String(o.orderId),
              orderEntryId:
                eId !== undefined && eId !== null
                  ? !isNaN(Number(eId))
                    ? Number(eId)
                    : eId
                  : undefined,
              status: match.status || o.status,
              number: match.number,
              allocationGb: match.allocationGB || match.allocationGb,
            };
          }
        } catch {}
      }
    } catch {}
    return null;
  }

  /**
   * Action 3: Get Order Status
   * Note: check status at most once every 30 seconds per order.
   */
  async getOrderStatus(orderId: string | number): Promise<{
    status: string;
    raw: unknown;
  }> {
    let targetId = String(orderId).trim();
    if (targetId.startsWith("CF-BATCH-") || targetId.startsWith("TSK-")) {
      try {
        targetId = await this.resolveCanonicalOrderId(targetId);
      } catch {}
    }
    const res = await this.request<any>(`/orders/${encodeURIComponent(targetId)}`);
    const status = res?.status || res?.data?.status || res?.order?.status || "UNKNOWN";
    return {
      status,
      raw: res,
    };
  }

  /**
   * Action 5 & Action 6: Report Not Received
   * Endpoint: POST /api/orders/report-not-received
   *
   * Supports both single-entry and multi-entry orders.
   * For multi-entry orders, each entry is reported individually using its orderEntryId,
   * orderId, number, and allocationGb.
   */
  async reportNotReceived(
    paramsOrOrderId:
      | {
          orderId: string | number;
          orderEntryId?: string | number;
          number?: string;
          allocationGb?: number;
        }
      | string
      | number
  ): Promise<{
    success: boolean;
    report?: any;
    message?: string;
    alreadyExists?: boolean;
    raw: unknown;
  }> {
    let orderId: string | number;
    let orderEntryId: string | number | undefined;
    let number: string | undefined;
    let allocationGb: number | undefined;

    if (typeof paramsOrOrderId === "object" && paramsOrOrderId !== null) {
      orderId = paramsOrOrderId.orderId;
      orderEntryId = paramsOrOrderId.orderEntryId;
      number = paramsOrOrderId.number;
      allocationGb = paramsOrOrderId.allocationGb;
    } else {
      orderId = paramsOrOrderId;
    }

    // Resolve canonical order ID (e.g. if CF-BATCH-000006 was provided, resolve to order-1789...)
    const canonicalOrderId = await this.resolveCanonicalOrderId(orderId);

    // Format phone number to clean Ghana format (e.g. 0541234568)
    let cleanNumber = number ? String(number).trim() : "";
    if (cleanNumber.startsWith("+233")) cleanNumber = "0" + cleanNumber.slice(4);
    else if (cleanNumber.startsWith("233")) cleanNumber = "0" + cleanNumber.slice(3);
    if (cleanNumber.length === 9 && !cleanNumber.startsWith("0")) cleanNumber = "0" + cleanNumber;

    const entryIdVal =
      orderEntryId !== undefined && orderEntryId !== null
        ? !isNaN(Number(orderEntryId))
          ? Number(orderEntryId)
          : orderEntryId
        : undefined;

    const payload: Record<string, unknown> = {};
    if (entryIdVal !== undefined) payload.orderEntryId = entryIdVal;
    if (cleanNumber) payload.number = cleanNumber;
    if (allocationGb !== undefined) payload.allocationGb = Number(allocationGb);

    // Clickyfied's JSON endpoint is /api/public/v1/orders/<order_id>/not-received.
    // When orderEntryId, number, and allocationGb are provided in the body, Clickyfied
    // creates a dedicated per-entry report for that recipient (Action 6).
    try {
      const res = await this.request<any>(
        `/orders/${encodeURIComponent(canonicalOrderId)}/not-received`,
        {
          method: "POST",
          body: Object.keys(payload).length > 0 ? JSON.stringify(payload) : undefined,
        }
      );

      return {
        success: true,
        alreadyExists: Boolean(res?.alreadyReported),
        report: res?.report,
        message: res?.message || (res?.alreadyReported ? "Already reported" : "Not received report submitted successfully"),
        raw: res,
      };
    } catch (err: any) {
      // Handle 400 when a report already exists for this entry
      const isAlreadyExists =
        err?.status === 400 &&
        (err?.rawResponse?.code === "NOT_RECEIVED_ALREADY_EXISTS" ||
          String(err?.message || "").toLowerCase().includes("already exists"));

      if (isAlreadyExists) {
        return {
          success: true,
          alreadyExists: true,
          report: err?.rawResponse?.details || err?.rawResponse?.report,
          message: "A not received report already exists for this entry",
          raw: err?.rawResponse || err,
        };
      }

      // If /orders/<id>/not-received returned 404 or 405, attempt /api/orders/report-not-received fallback
      if ((err?.status === 404 || err?.status === 405) && entryIdVal !== undefined) {
        try {
          const fallbackRes = await this.request<any>("/api/orders/report-not-received", {
            method: "POST",
            body: JSON.stringify({
              orderId: canonicalOrderId,
              orderEntryId: entryIdVal,
              number: cleanNumber,
              allocationGb: Number(allocationGb),
            }),
          });
          return {
            success: true,
            report: fallbackRes?.report,
            message: fallbackRes?.message,
            raw: fallbackRes,
          };
        } catch {
          // Rethrow original error below
        }
      }

      throw err;
    }
  }

  /**
   * Action 6: Get Not Received Status
   */
  async getNotReceivedStatus(orderId: string | number): Promise<any> {
    let targetId = String(orderId).trim();
    if (!targetId.startsWith("order-")) {
      try {
        targetId = await this.resolveCanonicalOrderId(targetId);
      } catch {}
    }
    return this.request<any>(
      `/orders/${encodeURIComponent(targetId)}/not-received`
    );
  }

  /**
   * Action 7: Verify Numbers
   * Body: { "numbers": ["0541234567", ...] }
   */
  async verifyNumbers(numbers: string[]): Promise<NumberVerificationResult> {
    if (!numbers.length) {
      return { validNumbers: [], invalidNumbers: [] };
    }

    const cleanNumbers = numbers.map((n) => {
      let s = n.trim();
      if (s.startsWith("+233")) s = "0" + s.slice(4);
      else if (s.startsWith("233")) s = "0" + s.slice(3);
      return s;
    });

    const res = await this.request<any>("/numbers/verify", {
      method: "POST",
      body: JSON.stringify({ numbers: cleanNumbers }),
    });

    // Flexible extraction based on potential Clickyfied return shapes
    let validNumbers: string[] = [];
    let invalidNumbers: string[] = [];

    if (Array.isArray(res?.valid)) {
      validNumbers = res.valid.map((n: any) => normalizeGhanaPhoneNumber(String(n || "")));
      invalidNumbers = Array.isArray(res?.invalid)
        ? res.invalid.map((n: any) => normalizeGhanaPhoneNumber(String(n || "")))
        : [];
    } else if (Array.isArray(res?.verified)) {
      validNumbers = res.verified.map((n: any) => normalizeGhanaPhoneNumber(String(n || "")));
      invalidNumbers = Array.isArray(res?.unverified)
        ? res.unverified.map((n: any) => normalizeGhanaPhoneNumber(String(n || "")))
        : [];
    } else if (Array.isArray(res?.numbers)) {
      validNumbers = res.numbers.map((n: any) => normalizeGhanaPhoneNumber(String(n || "")));
    } else if (Array.isArray(res?.results)) {
      for (const item of res.results) {
        const isFound =
          item.found === true ||
          item.valid === true ||
          item.verified === true ||
          item.status === "VERIFIED";
        const num = normalizeGhanaPhoneNumber(String(item.number || ""));
        if (isFound) {
          validNumbers.push(num);
        } else {
          invalidNumbers.push(num);
        }
      }
    } else if (Array.isArray(res?.data)) {
      for (const item of res.data) {
        const isFound =
          typeof item === "string"
            ? true
            : item.found === true || item.valid === true || item.verified === true;
        const num = normalizeGhanaPhoneNumber(
          typeof item === "string" ? item : String(item.number || "")
        );
        if (isFound) validNumbers.push(num);
        else invalidNumbers.push(num);
      }
    } else if (res?.success && !res?.invalid?.length) {
      // Fallback: if { success: true } and no invalid listed, assume all requested numbers verified
      validNumbers = cleanNumbers.map((n) => normalizeGhanaPhoneNumber(n));
    }

    return {
      validNumbers,
      invalidNumbers,
      raw: res,
    };
  }

  /**
   * Action 8: Get Current Billing
   */
  async getCurrentBilling(date?: string): Promise<any> {
    const d = date || new Date().toISOString().slice(0, 10);
    return this.request<any>(`/billing/current?date=${encodeURIComponent(d)}`);
  }
}
