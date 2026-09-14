export const openApiSpec = {
  openapi: "3.1.0",
  info: {
    title: "Tskconnect Developer API Platform",
    version: "1.0.0",
    description:
      "Production-ready developer API for Tskconnect. Automate Ghanaian mobile data bundles (MTN, Telecel, AirtelTigo) directly from your applications, reseller stores, websites, and platforms.",
    contact: {
      name: "Tskconnect Developer Support",
      url: "/",
    },
  },
  servers: [
    {
      url: "/v1",
      description: "Relative API Endpoint",
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "API Key (e.g. ck_live_... or ck_test_...)",
        description: "Authenticate by providing your Bearer API key in the Authorization header.",
      },
    },
    schemas: {
      ApiResponseSuccess: {
        type: "object",
        properties: {
          success: { type: "boolean", example: true },
          data: { type: "object" },
          requestId: { type: "string", example: "req_9f8e7d6c5b" },
        },
        required: ["success", "data", "requestId"],
      },
      ApiResponseError: {
        type: "object",
        properties: {
          success: { type: "boolean", example: false },
          error: {
            type: "object",
            properties: {
              code: { type: "string", example: "INVALID_RECIPIENT" },
              message: { type: "string", example: "The recipient number is invalid." },
            },
            required: ["code", "message"],
          },
          requestId: { type: "string", example: "req_9f8e7d6c5b" },
        },
        required: ["success", "error", "requestId"],
      },
      Network: {
        type: "object",
        properties: {
          id: { type: "string", example: "mtn" },
          name: { type: "string", example: "MTN" },
          status: { type: "string", enum: ["AVAILABLE", "UNAVAILABLE"], example: "AVAILABLE" },
        },
      },
      Package: {
        type: "object",
        properties: {
          id: { type: "string", example: "mtn-1gb" },
          packageId: { type: "string", example: "clxyz12345" },
          network: { type: "string", enum: ["MTN", "TELECEL", "AIRTELTIGO"], example: "MTN" },
          name: { type: "string", example: "MTN 1GB" },
          dataGb: { type: "number", example: 1 },
          price: { type: "number", example: 3.8 },
          currency: { type: "string", example: "GHS" },
          available: { type: "boolean", example: true },
        },
      },
      CreateOrderRequest: {
        type: "object",
        required: ["packageId", "recipient"],
        properties: {
          network: { type: "string", enum: ["MTN", "TELECEL", "AIRTELTIGO"], example: "MTN" },
          packageId: { type: "string", example: "mtn-1gb" },
          recipient: { type: "string", example: "0241234567" },
          reference: { type: "string", example: "SHOP-ORD-10001" },
        },
      },
      Order: {
        type: "object",
        properties: {
          orderId: { type: "string", example: "CLK-839201" },
          reference: { type: "string", example: "SHOP-ORD-10001" },
          network: { type: "string", example: "MTN" },
          package: { type: "string", example: "1GB" },
          recipient: { type: "string", example: "0241234567" },
          amount: { type: "number", example: 3.8 },
          status: {
            type: "string",
            enum: ["PENDING", "PROCESSING", "COMPLETED", "FAILED", "CANCELLED", "TEST_COMPLETED"],
            example: "COMPLETED",
          },
          createdAt: { type: "string", format: "date-time" },
          completedAt: { type: "string", format: "date-time", nullable: true },
        },
      },
      BulkStatusRequest: {
        type: "object",
        required: ["orderIds"],
        properties: {
          orderIds: {
            type: "array",
            items: { type: "string" },
            example: ["CLK-839201", "CLK-839202"],
          },
        },
      },
      Balance: {
        type: "object",
        properties: {
          balance: { type: "number", example: 150.75 },
          currency: { type: "string", example: "GHS" },
          environment: { type: "string", example: "PRODUCTION" },
        },
      },
      WebhookConfig: {
        type: "object",
        required: ["url"],
        properties: {
          url: { type: "string", example: "https://your-domain.com/webhooks/tskconnect" },
          events: {
            type: "array",
            items: { type: "string" },
            example: ["order.created", "order.completed", "order.failed"],
          },
          active: { type: "boolean", default: true },
          rotateSecret: { type: "boolean", default: false },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/networks": {
      get: {
        summary: "Retrieve Supported Networks",
        description: "Returns all supported mobile data networks with current availability status.",
        responses: {
          "200": {
            description: "List of networks",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/networks/status": {
      get: {
        summary: "Retrieve Network Availability Status",
        description: "Returns real-time health, order processing, and maintenance status for each network.",
        responses: {
          "200": {
            description: "Network health statuses",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/packages": {
      get: {
        summary: "Retrieve Data Packages",
        description: "Returns master data bundles with live pricing configured for your account tier.",
        parameters: [
          {
            name: "network",
            in: "query",
            schema: { type: "string", enum: ["mtn", "telecel", "airteltigo"] },
            description: "Filter packages by network provider",
          },
          {
            name: "available",
            in: "query",
            schema: { type: "boolean" },
            description: "Filter by availability status",
          },
        ],
        responses: {
          "200": {
            description: "Available packages catalog",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/orders": {
      get: {
        summary: "List Order History",
        description: "Returns paginated orders created through the API for your account.",
        parameters: [
          { name: "page", in: "query", schema: { type: "integer", default: 1 } },
          { name: "limit", in: "query", schema: { type: "integer", default: 20 } },
          { name: "status", in: "query", schema: { type: "string" } },
          { name: "network", in: "query", schema: { type: "string" } },
          { name: "reference", in: "query", schema: { type: "string" } },
          { name: "recipient", in: "query", schema: { type: "string" } },
        ],
        responses: {
          "200": {
            description: "Paginated order records",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
      post: {
        summary: "Create Data Order",
        description: "Creates and queues a new mobile data order. Requires Idempotency-Key header for safe retries.",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string" },
            description: "Unique string to prevent duplicate orders on network timeouts/retries.",
          },
        ],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/CreateOrderRequest" } } },
        },
        responses: {
          "201": {
            description: "Order accepted",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
          "400": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
          "402": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
          "409": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
          "503": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
        },
      },
    },
    "/orders/{id}": {
      get: {
        summary: "Get Order by ID",
        description: "Fetches details and status of an order created by your account.",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The Tskconnect order ID, e.g. CLK-839201 or 839201",
          },
        ],
        responses: {
          "200": {
            description: "Order record details",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
          "404": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
        },
      },
    },
    "/orders/reference/{reference}": {
      get: {
        summary: "Get Order by External Reference",
        description: "Retrieves an order using your own external reference string.",
        parameters: [
          {
            name: "reference",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "External reference supplied when the order was created.",
          },
        ],
        responses: {
          "200": {
            description: "Order record details",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
          "404": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
        },
      },
    },
    "/orders/status": {
      post: {
        summary: "Bulk Order Status",
        description: "Checks current status for up to 100 order IDs in a single request.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/BulkStatusRequest" } } },
        },
        responses: {
          "200": {
            description: "Array of order status results",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/balance": {
      get: {
        summary: "Check Account Wallet Balance",
        description: "Returns your current Tskconnect wallet balance in GHS.",
        responses: {
          "200": {
            description: "Wallet balance amount",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/webhooks": {
      get: {
        summary: "Get Webhook Settings and Recent Deliveries",
        description: "Returns configured webhook URL, active events, and recent delivery attempts.",
        responses: {
          "200": {
            description: "Webhook configuration",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
      post: {
        summary: "Configure or Update Webhook",
        description: "Configures webhook endpoint URL and event subscriptions. Generates HMAC signature secret.",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { $ref: "#/components/schemas/WebhookConfig" } } },
        },
        responses: {
          "200": {
            description: "Updated webhook configuration and secret",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/webhooks/test": {
      post: {
        summary: "Send Test Webhook",
        description: "Sends a test webhook delivery immediately to verify your endpoint handler and signature verification.",
        responses: {
          "200": {
            description: "Test delivery result",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/status": {
      get: {
        summary: "API System Status",
        description: "Public health check of API platform and carrier networks.",
        responses: {
          "200": {
            description: "System health check result",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
    "/request-id": {
      get: {
        summary: "Generate or Validate Request ID",
        description: "Returns a fresh or validated unique X-Request-ID for diagnostic tracing.",
        responses: {
          "200": {
            description: "Request ID result",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
        },
      },
    },
  },
};

/**
 * Returns the OpenAPI specification customized with the dynamic origin of the deployment/host.
 */
export function getOpenApiSpec(origin?: string) {
  const cleanOrigin = origin ? origin.replace(/\/$/, "") : "";
  const serverUrl = cleanOrigin ? `${cleanOrigin}/v1` : "/v1";
  return {
    ...openApiSpec,
    info: {
      ...openApiSpec.info,
      contact: {
        ...openApiSpec.info.contact,
        url: cleanOrigin || openApiSpec.info.contact.url,
      },
    },
    servers: [
      {
        url: serverUrl,
        description: cleanOrigin ? "Current API Host" : "Production API Server",
      },
      {
        url: "/v1",
        description: "Relative API Endpoint",
      },
    ],
  };
}

