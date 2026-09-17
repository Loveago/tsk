import { prisma } from "./prisma";

export interface RecordOrderApiLogParams {
  orderId?: number | null;
  provider: "CLICKYFIED" | "BIGWINDATA" | string;
  action:
    | "SUBMIT_ORDER"
    | "SYNC_ORDER"
    | "CHECK_STATUS"
    | "NOT_RECEIVED"
    | "TEST_CONNECTION"
    | string;
  endpoint: string;
  method?: string;
  requestPayload?: unknown;
  responsePayload?: unknown;
  statusCode?: number | null;
  success: boolean;
  errorMessage?: string | null;
  providerReference?: string | null;
  durationMs?: number | null;
}

/**
 * Redacts sensitive tokens or secrets from serialized payloads.
 */
function sanitizePayload(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  try {
    let str = typeof value === "string" ? value : JSON.stringify(value);
    // Redact bearer tokens or api keys if present
    str = str.replace(/("?(?:apiKey|api_key|secret|token|password)"?\s*:\s*)"([^"]+)"/gi, '$1"***"');
    str = str.replace(/Bearer\s+[A-Za-z0-9\-_.]+/gi, "Bearer ***");
    // Limit to 65,000 characters to prevent database bloat
    if (str.length > 65000) {
      str = str.slice(0, 65000) + "... [truncated]";
    }
    return str;
  } catch {
    return String(value).slice(0, 5000);
  }
}

/**
 * Records an external Provider API log for an order dispatch, sync, or diagnostic call.
 * This runs safely in the background so that any logging anomaly never disrupts order processing.
 */
export async function recordOrderApiLog(params: RecordOrderApiLogParams): Promise<void> {
  try {
    const requestStr = sanitizePayload(params.requestPayload);
    const responseStr = sanitizePayload(params.responsePayload);

    await prisma.orderApiLog.create({
      data: {
        orderId: params.orderId ?? null,
        provider: params.provider.toUpperCase(),
        action: params.action.toUpperCase(),
        endpoint: params.endpoint,
        method: (params.method || "POST").toUpperCase(),
        requestPayload: requestStr,
        responsePayload: responseStr,
        statusCode: params.statusCode ?? null,
        success: params.success,
        errorMessage: params.errorMessage ? String(params.errorMessage).slice(0, 5000) : null,
        providerReference: params.providerReference ? String(params.providerReference).slice(0, 255) : null,
        durationMs: params.durationMs ?? null,
      },
    });
  } catch (err) {
    console.error("[OrderApiLog] Failed to record API log:", err);
  }
}
