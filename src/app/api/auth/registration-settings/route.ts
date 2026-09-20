import { NextResponse } from "next/server";
import { getSignupCodeMode } from "@/lib/signup-codes";
import { getSetting } from "@/lib/orders";
import { isPaystackConfigured } from "@/lib/paystack";
import { handleRouteError } from "@/lib/api-helpers";

export async function GET() {
  try {
    const [signupCodeMode, allowRegSetting, feeEnabledSetting, feeAmountSetting, feeDescSetting, paystackReady] =
      await Promise.all([
        getSignupCodeMode(),
        getSetting("allow_user_registration", "true"),
        getSetting("signup_fee_enabled", "false"),
        getSetting("signup_fee_amount", "0"),
        getSetting("signup_fee_description", "Account Activation Fee"),
        isPaystackConfigured(),
      ]);

    const feeAmount = parseFloat(feeAmountSetting) || 0;
    const isFeeEnabled = feeEnabledSetting === "true" && feeAmount > 0;

    return NextResponse.json({
      signupCodeMode,
      allowRegistration: allowRegSetting !== "false",
      signupFee: {
        enabled: isFeeEnabled,
        amount: feeAmount,
        currency: "GHS",
        description: feeDescSetting || "Account Activation Fee",
        paystackConfigured: paystackReady,
      },
    });
  } catch (err) {
    return handleRouteError(err);
  }
}
