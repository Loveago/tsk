import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";

async function main() {
  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  const phone = "0536904247"; // Order 12875
  console.log(`Checking Clickyfied for phone ${phone}...`);

  const res = await client.findOrderByPhone(phone);
  console.log("Result:", JSON.stringify(res, null, 2));

  // Also let us list the 5 most recent orders on Clickyfied account to see what they look like
  const recentOrders = await client.listOrders(5, 0);
  console.log("\nRecent 5 orders on Clickyfied account:");
  for (const o of recentOrders) {
    console.log(`  ID: ${o.orderId || o.id} | ExtRef: ${o.externalReference} | Status: ${o.status} | Entries: ${o.entries?.length || 0}`);
  }
}

main().catch(console.error);
