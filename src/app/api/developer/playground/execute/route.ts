import { NextRequest, NextResponse } from "next/server";

// Endpoints that create real orders — these get a fully-mocked sandbox response.
// Everything else (reads, webhook ping, balance, etc.) is proxied transparently.
const ORDER_MUTATION_PATHS = ["/v1/orders", "/v1/orders/batch"];

function isOrderMutation(method: string, path: string): boolean {
  if (method !== "POST") return false;
  const clean = path.split("?")[0].replace(/\/$/, "");
  return ORDER_MUTATION_PATHS.includes(clean);
}

function makeRequestId(): string {
  return `req_sandbox_${Math.random().toString(36).slice(2, 10)}`;
}

function mockSingleOrderResponse(body: any, requestId: string) {
  const now = new Date().toISOString();
  const orderId = `SANDBOX-${Math.floor(100000 + Math.random() * 900000)}`;
  return {
    success: true,
    data: {
      orderId,
      reference: body?.reference ?? body?.externalReference ?? null,
      network: (body?.network ?? "MTN").toUpperCase(),
      package: body?.packageId ?? "mtn-1gb",
      recipient: body?.recipient ?? body?.phoneNumber ?? "05XXXXXXXX",
      amount: 0,
      status: "PROCESSING",
      isSandbox: true,
      createdAt: now,
    },
    requestId,
    _playground: {
      sandboxed: true,
      note: "Simulated sandbox response — no order created, no balance deducted.",
    },
  };
}

function mockBatchOrderResponse(body: any, requestId: string) {
  const now = new Date().toISOString();
  const batchCode = `SANDBOX-BATCH-${Math.floor(100000 + Math.random() * 900000)}`;
  const entries: any[] = Array.isArray(body?.entries) ? body.entries : [];

  const entriesFormatted = entries.map((e: any, i: number) => ({
    id: 90000 + i,
    number: e.number ?? e.phoneNumber ?? `05${String(i).padStart(8, "0")}`,
    allocationGB: e.allocationGB ?? e.gbAmount ?? 1,
    status: "PROCESSING",
    failureReason: null,
    createdAt: now,
    completedAt: null,
  }));

  return {
    success: true,
    data: {
      orderId: `API-${batchCode}`,
      batchCode,
      externalReference: body?.externalReference ?? "BATCH-SANDBOX",
      status: "PENDING",
      cost: 0,
      estimatedCost: 0,
      totalCount: entriesFormatted.length,
      processedCount: 0,
      reused: false,
      message: "Batch order submitted successfully",
      entries: entriesFormatted,
      filteredOutEntries: [],
      isSandbox: true,
      order: {
        orderId: `API-${batchCode}`,
        externalReference: body?.externalReference ?? "BATCH-SANDBOX",
        status: "PENDING",
        totalCount: entriesFormatted.length,
        processedCount: 0,
        createdAt: now,
        updatedAt: now,
        entries: entriesFormatted,
      },
    },
    requestId,
    _playground: {
      sandboxed: true,
      note: "Simulated sandbox response — no orders created, no balance deducted.",
    },
  };
}

export async function POST(request: NextRequest) {
  let payload: {
    method: string;
    path: string;
    body?: string;
    apiKey?: string;
    idempotencyKey?: string;
  };

  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const { method, path, body, apiKey, idempotencyKey } = payload;

  if (!method || !path) {
    return NextResponse.json({ error: "method and path are required" }, { status: 400 });
  }

  const requestId = makeRequestId();

  // ── Sandboxed order mutations ──────────────────────────────────────────────
  if (isOrderMutation(method, path)) {
    let parsedBody: any = {};
    try {
      if (body) parsedBody = JSON.parse(body);
    } catch {
      // treat as empty body
    }

    const isBatchEndpoint = path.replace(/\/$/, "").split("?")[0] === "/v1/orders/batch";
    const hasBatchEntries = Array.isArray(parsedBody?.entries);

    const mockData =
      isBatchEndpoint || hasBatchEntries
        ? mockBatchOrderResponse(parsedBody, requestId)
        : mockSingleOrderResponse(parsedBody, requestId);

    return NextResponse.json(mockData, {
      status: 201,
      headers: {
        "X-Request-ID": requestId,
        "X-Playground-Sandbox": "true",
        "X-RateLimit-Limit": "60",
        "X-RateLimit-Remaining": "59",
        "X-RateLimit-Reset": String(Math.ceil((Date.now() + 60_000) / 1000)),
      },
    });
  }

  // ── Safe pass-through for reads and non-mutating endpoints ────────────────
  const baseUrl = request.nextUrl.origin;
  const targetUrl = `${baseUrl}${path.startsWith("/") ? path : `/${path}`}`;

  const forwardHeaders: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (apiKey?.trim()) forwardHeaders["Authorization"] = `Bearer ${apiKey.trim()}`;
  if (idempotencyKey?.trim()) forwardHeaders["Idempotency-Key"] = idempotencyKey.trim();

  const fetchOptions: RequestInit = { method, headers: forwardHeaders };
  if (method === "POST" && body?.trim()) fetchOptions.body = body.trim();

  const startTime = Date.now();

  try {
    const res = await fetch(targetUrl, fetchOptions);
    const latency = Date.now() - startTime;

    let responseBody: any;
    try {
      responseBody = await res.json();
    } catch {
      responseBody = { raw: await res.text() };
    }

    const responseHeaders: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      responseHeaders[key] = val;
    });

    return NextResponse.json(
      { proxied: true, status: res.status, headers: responseHeaders, body: responseBody, latencyMs: latency },
      { status: 200 }
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        proxied: true,
        status: 500,
        headers: {},
        body: { error: err.message ?? "Fetch failed" },
        latencyMs: Date.now() - startTime,
      },
      { status: 200 }
    );
  }
}
