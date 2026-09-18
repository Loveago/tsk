import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { ClickyfiedClient } from "@/lib/provider-apis/clickyfied";
import { getProviderRoutingConfig } from "@/lib/provider-apis/router";
import { handleRouteError, apiError } from "@/lib/api-helpers";

/**
 * Action 8: Get Current / Daily Billing from Clickyfied
 * Endpoint: GET /api/public/v1/billing/current?date=YYYY-MM-DD
 */
export async function GET(request: NextRequest) {
  try {
    await requireAdmin();

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    const res = await client.getCurrentBilling(dateParam);
    const bill = res?.bill || res?.data?.bill || res?.data || res;

    return NextResponse.json({
      success: true,
      date: bill?.date || dateParam,
      user: bill?.user || null,
      totalAmount: Number(bill?.totalAmount ?? 0),
      totalRefunds: Number(bill?.totalRefunds ?? 0),
      netAmount: Number(bill?.netAmount ?? 0),
      totalDataGb: Number(bill?.totalData ?? 0),
      ordersCount: Array.isArray(bill?.orders) ? bill.orders.length : 0,
      refundsCount: Array.isArray(bill?.refunds) ? bill.refunds.length : 0,
      orders: bill?.orders || [],
      refunds: bill?.refunds || [],
      raw: res,
    });
  } catch (err: any) {
    return handleRouteError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    await requireAdmin();

    const body = await request.json().catch(() => ({}));
    const dateParam = body.date || new Date().toISOString().slice(0, 10);

    const config = await getProviderRoutingConfig();
    const client = new ClickyfiedClient(config.clickyfied);

    const res = await client.getCurrentBilling(dateParam);
    const bill = res?.bill || res?.data?.bill || res?.data || res;

    return NextResponse.json({
      success: true,
      date: bill?.date || dateParam,
      user: bill?.user || null,
      totalAmount: Number(bill?.totalAmount ?? 0),
      totalRefunds: Number(bill?.totalRefunds ?? 0),
      netAmount: Number(bill?.netAmount ?? 0),
      totalDataGb: Number(bill?.totalData ?? 0),
      ordersCount: Array.isArray(bill?.orders) ? bill.orders.length : 0,
      refundsCount: Array.isArray(bill?.refunds) ? bill.refunds.length : 0,
      orders: bill?.orders || [],
      refunds: bill?.refunds || [],
      raw: res,
    });
  } catch (err: any) {
    return handleRouteError(err);
  }
}
