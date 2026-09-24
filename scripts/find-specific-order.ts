import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";

async function main() {
  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  const arg = process.argv[2];
  if (arg && arg.startsWith("order-")) {
    console.log(`Directly querying Clickyfied for order ${arg}...`);
    const details = await client.getOrderStatus(arg);
    console.log("Order details:", JSON.stringify(details.raw, null, 2));
    return;
  }

  const searchPhone = arg || "0592161688";
  console.log(`Searching for ${searchPhone} across Clickyfied orders (paginated)...`);

  for (const offset of [0, 50, 100, 150, 200, 250, 300, 400, 500]) {
    console.log(`Checking orders at offset ${offset}...`);
    const orders = await client.listOrders(50, offset);
    if (!orders || orders.length === 0) break;

    for (const o of orders) {
      const oId = String(o.orderId || o.id);
      const jsonStr = JSON.stringify(o);
      // Check if phone is in summary
      if (jsonStr.includes("0592161688") || jsonStr.includes("592161688")) {
        console.log(`\n>>> FOUND IN SUMMARY of ORDER: ${oId} <<<`);
        console.log(jsonStr);
        return;
      }

      // Check full details
      try {
        const details = await client.getOrderStatus(oId);
        const detailsStr = JSON.stringify(details.raw);
        if (detailsStr.includes("0592161688") || detailsStr.includes("592161688")) {
          console.log(`\n>>> FOUND IN DETAILED ORDER: ${oId} <<<`);
          console.log(detailsStr);
          return;
        }
      } catch (err) {}
    }
  }

  console.log("Finished pagination search.");
}

main().catch(console.error);
