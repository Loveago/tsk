import { getProviderRoutingConfig } from "../src/lib/provider-apis/router";
import { ClickyfiedClient } from "../src/lib/provider-apis/clickyfied";

async function main() {
  const config = await getProviderRoutingConfig();
  const client = new ClickyfiedClient(config.clickyfied);

  const sampleNumbers = [
    { id: 13273, phone: "0592161688", gb: 3 },
    { id: 13274, phone: "0538177025", gb: 10 },
    { id: 13275, phone: "0240991874", gb: 2 },
    { id: 13276, phone: "0548255195", gb: 2 },
    { id: 13277, phone: "0599528609", gb: 1 },
  ];

  console.log("Checking Clickyfied for sample 'missing' orders...");
  for (const item of sampleNumbers) {
    console.log(`\nChecking Order #${item.id} (${item.phone}, ${item.gb}GB)...`);
    const found = await client.findOrderByPhone(item.phone);
    if (found) {
      console.log(`  -> FOUND ON CLICKYFIED!`, found);
    } else {
      console.log(`  -> NOT found in recent 100 Clickyfied orders.`);
    }
  }
}

main().catch(console.error);
