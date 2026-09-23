import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { BigwindataClient } from "@/lib/provider-apis/bigwindata";
import { ClickyfiedClient, generateClickyfiedReference } from "@/lib/provider-apis/clickyfied";
import { GhconnectClient } from "@/lib/provider-apis/ghconnect";
import { BigwinTelecelClient } from "@/lib/provider-apis/bigwin-telecel";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";
import { handleRouteError, apiError } from "@/lib/api-helpers";

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();
    const body = await request.json();
    const { action, provider, network = "MTN", recipient = "0257467983", gbAmount = 1 } = body;

    const config = await getProviderRoutingConfig();

    if (action === "test_bigwin_telecel_packages") {
      const client = new BigwinTelecelClient(config.bigwinTelecel);
      const packages = await client.getPackages();
      return NextResponse.json({ success: true, packages });
    }

    if (action === "test_bigwin_telecel_transactions") {
      const client = new BigwinTelecelClient(config.bigwinTelecel);
      const transactions = await client.getTransactions();
      return NextResponse.json({ success: true, transactions });
    }

    if (action === "test_bigwindata_balance") {
      const client = new BigwindataClient(config.bigwindata);
      const balance = await client.getBalance();
      return NextResponse.json({ success: true, balance });
    }

    if (action === "test_ghconnect_balance") {
      const client = new GhconnectClient(config.ghconnect);
      const balance = await client.getBalance();
      return NextResponse.json({ success: true, balance });
    }

    if (action === "test_bigwindata_bundles") {
      const client = new BigwindataClient(config.bigwindata);
      const bundles = await client.getBundles(body.networkCode);
      return NextResponse.json({ success: true, bundles });
    }

    if (action === "test_clickyfied_billing") {
      const client = new ClickyfiedClient(config.clickyfied);
      const billing = await client.getCurrentBilling(body.date);
      return NextResponse.json({ success: true, billing });
    }

    if (action === "test_clickyfied_verify") {
      const client = new ClickyfiedClient(config.clickyfied);
      const res = await client.verifyNumbers([recipient]);
      return NextResponse.json({ success: true, verification: res });
    }

    if (action === "test_order") {
      if (provider === "BIGWINDATA") {
        const client = new BigwindataClient(config.bigwindata);
        const bundleId = await client.resolveBundleId(network, gbAmount);
        const purchase = await client.purchase({
          bundleId,
          recipient,
          idempotencyKey: `TEST-ORD-${Date.now()}`,
        });
        return NextResponse.json({ success: true, provider: "BIGWINDATA", purchase });
      }

      if (provider === "CLICKYFIED") {
        const client = new ClickyfiedClient(config.clickyfied);
        const externalReference = generateClickyfiedReference();
        const order = await client.submitOrder({
          externalReference,
          entries: [{ number: recipient, allocationGB: gbAmount }],
          idempotencyKey: externalReference,
        });
        return NextResponse.json({ success: true, provider: "CLICKYFIED", order });
      }

      if (provider === "GHCONNECT") {
        const client = new GhconnectClient(config.ghconnect);
        const reference = `${Date.now()}`;
        const net = (network || "").trim().toUpperCase();
        const isBigTime = net === "AIRTELTIGO_BIGTIME" || net.includes("BIGTIME");
        const isIshare =
          !isBigTime &&
          (net === "AIRTELTIGO_ISHARE" ||
            net === "AT_ISHARE" ||
            net.includes("ISHARE") ||
            net === "AIRTELTIGO" ||
            net === "AT");

        const order = isIshare
          ? await client.createIshareBundleOrder({
              reference,
              msisdn: recipient,
              capacityMb: Math.round(gbAmount * 1000),
            })
          : await client.purchaseBundle({
              network: net.includes("TELECEL") ? "telecel" : isBigTime ? "atbigtime" : "mtn",
              reference,
              msisdn: recipient,
              capacity: gbAmount,
            });
        return NextResponse.json({ success: true, provider: "GHCONNECT", order });
      }

      if (provider === "BIGWIN_TELECEL") {
        const client = new BigwinTelecelClient(config.bigwinTelecel);
        const reference = `TEST-TEL-${Date.now()}`;
        const order = await client.sendDataBundle({
          phone: recipient,
          dataGB: gbAmount,
          reference,
        });
        return NextResponse.json({ success: true, provider: "BIGWIN_TELECEL", order });
      }

      return apiError(400, "Unsupported provider for test order");
    }

    return apiError(400, `Unknown action: ${action}`);
  } catch (err: any) {
    return handleRouteError(err);
  }
}
