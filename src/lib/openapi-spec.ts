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
      BatchOrderEntry: {
        type: "object",
        required: ["number", "allocationGB"],
        properties: {
          number: { type: "string", example: "0541234567", description: "Recipient Ghanaian mobile phone number" },
          allocationGB: { type: "number", example: 5, description: "Data allocation volume in GB" },
        },
      },
      FilteredOutEntry: {
        type: "object",
        properties: {
          number: { type: "string", example: "0240000000" },
          allocationGB: { type: "number", example: 5 },
          reason: { type: "string", example: "Number is blocked by provider" },
          type: { type: "string", enum: ["blocked", "invalid", "duplicate", "in_flight", "unavailable"], example: "blocked" },
        },
      },
      BatchOrderRequest: {
        type: "object",
        required: ["entries"],
        properties: {
          externalReference: { type: "string", example: "invoice-20260903-batch-001" },
          reference: { type: "string", example: "invoice-20260903-batch-001" },
          network: { type: "string", enum: ["MTN", "TELECEL", "AIRTELTIGO"], example: "MTN" },
          callbackUrl: { type: "string", example: "https://partner.example.com/webhooks/orders" },
          callbackSigningSecret: { type: "string", example: "partner-secret-key" },
          entries: {
            type: "array",
            items: { $ref: "#/components/schemas/BatchOrderEntry" },
            example: [
              { number: "0541234567", allocationGB: 5 },
              { number: "0541234568", allocationGB: 10 },
            ],
          },
        },
      },
      BatchOrderResponse: {
        type: "object",
        properties: {
          orderId: { type: "string", example: "API-CF-BATCH-000185" },
          batchCode: { type: "string", example: "CF-BATCH-000185" },
          externalReference: { type: "string", example: "invoice-20260903-batch-001" },
          status: { type: "string", enum: ["pending", "processing", "processed", "failed"], example: "pending" },
          cost: { type: "number", example: 55.0 },
          estimatedCost: { type: "number", example: 55.0 },
          totalCount: { type: "integer", example: 2 },
          processedCount: { type: "integer", example: 0 },
          reused: { type: "boolean", example: false },
          message: { type: "string", example: "Order submitted successfully" },
          entries: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "integer", example: 101 },
                number: { type: "string", example: "0541234567" },
                allocationGB: { type: "number", example: 5 },
                status: { type: "string", example: "pending" },
              },
            },
          },
          filteredOutEntries: {
            type: "array",
            items: { $ref: "#/components/schemas/FilteredOutEntry" },
          },
          order: {
            type: "object",
            properties: {
              orderId: { type: "string", example: "API-CF-BATCH-000185" },
              externalReference: { type: "string", example: "invoice-20260903-batch-001" },
              status: { type: "string", example: "pending" },
              totalCount: { type: "integer", example: 2 },
              processedCount: { type: "integer", example: 0 },
              createdAt: { type: "string", format: "date-time" },
              updatedAt: { type: "string", format: "date-time" },
              entries: { type: "array", items: { type: "object" } },
            },
          },
        },
      },
      Order: {
        type: "object",
        properties: {
          orderId: { type: "string", example: "API-839201" },
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
            example: ["API-839201", "API-839202"],
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
      NumberVerifyRequest: {
        type: "object",
        required: ["numbers"],
        properties: {
          numbers: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 100,
            example: ["0241234567", "0201234567", "0261234567"],
            description: "List of Ghanaian phone numbers to verify (max 100 per request). Accepts 0XXXXXXXXX, +233XXXXXXXXX, or 233XXXXXXXXX formats.",
          },
          network: {
            type: "string",
            enum: ["MTN", "TELECEL", "AIRTELTIGO"],
            example: "MTN",
            description: "Optional target network to check verification for. If querying ported numbers for MTN, set network to 'MTN'.",
          },
        },
      },
      NumberVerifyResult: {
        type: "object",
        properties: {
          verified: {
            type: "array",
            items: { type: "string" },
            example: ["0241234567"],
            description: "List of valid numbers that are verified and ready for ordering",
          },
          unverified: {
            type: "array",
            items: { type: "string" },
            example: ["0549999999"],
            description: "List of valid MTN numbers that are not yet in the verified database",
          },
          invalid: {
            type: "array",
            items: { type: "string" },
            example: ["not-a-number"],
            description: "List of input strings that could not be parsed as valid Ghanaian phone numbers",
          },
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                number:          { type: "string", example: "0241234567", description: "Normalized 10-digit Ghanaian number" },
                network:         { type: "string", nullable: true, enum: ["MTN", "TELECEL", "AIRTELTIGO", null], example: "MTN" },
                valid:           { type: "boolean", example: true, description: "Whether the number is a valid Ghanaian mobile number" },
                verified:        { type: "boolean", example: true, description: "Whether the number exists in our verified database" },
                canOrder:        { type: "boolean", example: true, description: "Whether an order can currently be placed for this number" },
                isPorted:        { type: "boolean", example: false, description: "Whether this number is ported to MTN from another network" },
                originalNetwork: { type: "string", nullable: true, example: "TELECEL", description: "Original network based on phone prefix if ported" },
                note:            { type: "string", nullable: true, example: "Sandbox mode: all valid MTN numbers are treated as verified" },
              },
            },
          },
          summary: {
            type: "object",
            properties: {
              total:      { type: "integer", example: 3 },
              verified:   { type: "integer", example: 2 },
              unverified: { type: "integer", example: 0 },
              invalid:    { type: "integer", example: 1 },
            },
          },
        },
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/numbers/verify": {
      post: {
        summary: "Verify Phone Numbers",
        description:
          "Check whether one or more Ghanaian mobile phone numbers are present in our verified database **before placing an order**. " +
          "Use this endpoint to pre-screen recipients and surface actionable status to your users before they hit the ordering flow.\n\n" +
          "**MTN only**: MTN numbers are subject to a verification gate — they must appear in our verified database for an order to succeed when verification is enabled. " +
          "Telecel and AirtelTigo numbers always return `verified: true`.\n\n" +
          "**Sandbox mode**: All valid MTN numbers are treated as verified so you can test ordering flows without real DB entries.\n\n" +
          "**Batch**: Up to **100 numbers** per request. Split larger lists into batches.",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/NumberVerifyRequest" },
              examples: {
                mixed: {
                  summary: "Mixed networks and an invalid number",
                  value: { numbers: ["0241234567", "0201234567", "0261234567", "not-a-number"] },
                },
                single: {
                  summary: "Single MTN number",
                  value: { numbers: ["0541234567"] },
                },
                international: {
                  summary: "International format (+233)",
                  value: { numbers: ["+233241234567", "+233201234567"] },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Verification results for each number",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiResponseSuccess" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/NumberVerifyResult" },
                      },
                    },
                  ],
                },
                example: {
                  success: true,
                  requestId: "req_4f2a1b3c",
                  data: {
                    results: [
                      { number: "0241234567", network: "MTN",       valid: true,  verified: true,  canOrder: true  },
                      { number: "0201234567", network: "TELECEL",   valid: true,  verified: true,  canOrder: true,  note: "TELECEL numbers do not require pre-verification" },
                      { number: "0261234567", network: "AIRTELTIGO",valid: true,  verified: true,  canOrder: true,  note: "AIRTELTIGO numbers do not require pre-verification" },
                      { number: "not-a-number", network: null,     valid: false, verified: false, canOrder: false, note: "Invalid Ghanaian phone number. Accepted formats: 0241234567, +233241234567, 233241234567" },
                    ],
                    summary: { total: 4, verified: 3, unverified: 0, invalid: 1 },
                  },
                },
              },
            },
          },
          "400": {
            description: "Bad request — missing or malformed numbers array",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
          "401": {
            description: "Missing or invalid API key",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
          "403": {
            description: "Insufficient scope (requires numbers:verify)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
          "429": {
            description: "Rate limit exceeded",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
        },
      },
      get: {
        summary: "Verify Phone Numbers via Query Parameter",
        description: "Alternative query-parameter based verification. Pass a single number (?number=0241234567) or comma-separated list (?numbers=0241234567,0201234567).",
        parameters: [
          {
            name: "number",
            in: "query",
            required: false,
            schema: { type: "string", example: "0241234567" },
            description: "Single Ghanaian phone number to verify",
          },
          {
            name: "numbers",
            in: "query",
            required: false,
            schema: { type: "string", example: "0241234567,0201234567" },
            description: "Comma-separated list of Ghanaian phone numbers to verify",
          },
          {
            name: "network",
            in: "query",
            required: false,
            schema: { type: "string", enum: ["MTN", "TELECEL", "AIRTELTIGO"], example: "MTN" },
            description: "Optional target network to verify against (e.g. check if a ported number is verified for MTN)",
          },
        ],
        responses: {
          "200": {
            description: "Verification results",
            content: {
              "application/json": {
                schema: {
                  allOf: [
                    { $ref: "#/components/schemas/ApiResponseSuccess" },
                    {
                      type: "object",
                      properties: {
                        data: { $ref: "#/components/schemas/NumberVerifyResult" },
                      },
                    },
                  ],
                },
              },
            },
          },
          "400": {
            description: "Bad request — missing number or numbers query parameter",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
          "401": {
            description: "Missing or invalid API key",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
          "403": {
            description: "Insufficient scope (requires numbers:verify)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
          "429": {
            description: "Rate limit exceeded",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } },
          },
        },
      },
    },
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
        summary: "Create Data Order (Single or Batch)",
        description:
          "Creates and queues a new mobile data order. Accepts either a single order payload (`recipient`, `packageId`) or a batch order payload (`entries: [{ number, allocationGB }]`). Automatically filters blocked/invalid numbers. Requires Idempotency-Key header for safe retries.",
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
          content: {
            "application/json": {
              schema: {
                oneOf: [
                  { $ref: "#/components/schemas/CreateOrderRequest" },
                  { $ref: "#/components/schemas/BatchOrderRequest" },
                ],
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Order accepted (returns single order or batch payload)",
            content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseSuccess" } } },
          },
          "400": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
          "402": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
          "409": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
          "503": { content: { "application/json": { schema: { $ref: "#/components/schemas/ApiResponseError" } } } },
        },
      },
    },
    "/orders/batch": {
      post: {
        summary: "Submit Batch Order",
        description:
          "Dedicated endpoint to submit batch data orders for multiple recipients. Accepts an array of `entries: [{ number, allocationGB }]`. Blocked or invalid numbers are automatically segregated into `filteredOutEntries`. If at least one valid entry exists, 201 Created is returned.",
        parameters: [
          {
            name: "Idempotency-Key",
            in: "header",
            required: false,
            schema: { type: "string" },
            description: "Unique key to ensure idempotent submission.",
          },
        ],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: { $ref: "#/components/schemas/BatchOrderRequest" },
            },
          },
        },
        responses: {
          "201": {
            description: "Batch order created",
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
            description: "The Tskconnect order ID, e.g. API-839201 or 839201",
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

