/**
 * Quick sanity tests for the Send Order line parser.
 * Run with: npx tsx scripts/test-order-parse.ts
 */
import { parseOrderLine, NETWORK_LABELS } from "../src/lib/order-parse";

const packages = [
  { network: "MTN", gbAmount: 1, price: 3.8 },
  { network: "MTN", gbAmount: 5, price: 15 },
  { network: "MTN", gbAmount: 10, price: 28 },
  { network: "TELECEL", gbAmount: 1, price: 3.5 },
  { network: "TELECEL", gbAmount: 10, price: 15 },
  { network: "AIRTELTIGO", gbAmount: 2, price: 5 },
];

interface Case {
  name: string;
  line: string;
  defaultNetwork: string;
  expect: { phoneNumber: string; network: string; gbAmount: number; price: number } | null;
}

const cases: Case[] = [
  // --- user's examples: select MTN -> "number gb" per line ---
  {
    name: "MTN selected, comma separated",
    line: "0535308873,1",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0535308873", network: "MTN", gbAmount: 1, price: 3.8 },
  },
  {
    name: "Telecel selected, space separated with gb suffix",
    line: "0507904981 10gb",
    defaultNetwork: "TELECEL",
    expect: { phoneNumber: "0507904981", network: "TELECEL", gbAmount: 10, price: 15 },
  },
  {
    name: "bare number and gb",
    line: "0241234567 5",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0241234567", network: "MTN", gbAmount: 5, price: 15 },
  },
  {
    name: "tab separated",
    line: "0241234567\t10",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0241234567", network: "MTN", gbAmount: 10, price: 28 },
  },
  // --- phone normalization ---
  {
    name: "spaces inside phone",
    line: "024 123 4567, 1",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0241234567", network: "MTN", gbAmount: 1, price: 3.8 },
  },
  {
    name: "spaced country code",
    line: "+233 53 530 8873,1",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0535308873", network: "MTN", gbAmount: 1, price: 3.8 },
  },
  {
    name: "phone with spaces + explicit network",
    line: "024 123 4567 MTN 5",
    defaultNetwork: "TELECEL",
    expect: { phoneNumber: "0241234567", network: "MTN", gbAmount: 5, price: 15 },
  },
  {
    name: "+233 country code",
    line: "+233535308873,1",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0535308873", network: "MTN", gbAmount: 1, price: 3.8 },
  },
  {
    name: "Excel-dropped leading zero (9 digits)",
    line: "535308873,1",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0535308873", network: "MTN", gbAmount: 1, price: 3.8 },
  },
  // --- legacy 3-column lines still work ---
  {
    name: "legacy phone,network,gb overrides selection",
    line: "0241234567,MTN,5",
    defaultNetwork: "TELECEL",
    expect: { phoneNumber: "0241234567", network: "MTN", gbAmount: 5, price: 15 },
  },
  {
    name: "phone,gb,network order also detected",
    line: "0271234567,2,AirtelTigo",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0271234567", network: "AIRTELTIGO", gbAmount: 2, price: 5 },
  },
  {
    name: "vodafone alias",
    line: "0507904981,10,Vodafone",
    defaultNetwork: "MTN",
    expect: { phoneNumber: "0507904981", network: "TELECEL", gbAmount: 10, price: 15 },
  },
  // --- decimals ---
  {
    name: "decimal gb",
    line: "0241234567,1.5gb",
    defaultNetwork: "MTN",
    expect: null, // no 1.5GB MTN package -> skipped
  },
  // --- invalid lines -> skipped ---
  { name: "missing gb", line: "0241234567", defaultNetwork: "MTN", expect: null },
  { name: "gb=0", line: "0241234567,0", defaultNetwork: "MTN", expect: null },
  { name: "invalid phone", line: "hello,5", defaultNetwork: "MTN", expect: null },
  { name: "invalid prefix", line: "0212345678,1", defaultNetwork: "MTN", expect: null },
  { name: "unpriced gb", line: "0241234567,999", defaultNetwork: "MTN", expect: null },
  { name: "gb not offered on selected network", line: "0241234567,5", defaultNetwork: "TELECEL", expect: null },
  { name: "empty line", line: "   ", defaultNetwork: "MTN", expect: null },
];

let failures = 0;
for (const c of cases) {
  const got = parseOrderLine(c.line, packages, c.defaultNetwork);
  const ok =
    c.expect === null
      ? got === null
      : got !== null &&
        got.phoneNumber === c.expect.phoneNumber &&
        got.network === c.expect.network &&
        got.gbAmount === c.expect.gbAmount &&
        got.price === c.expect.price;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${c.name}  (${JSON.stringify(c.line)}) -> ${JSON.stringify(got)}`
  );
}

console.log(`\nLabels: ${JSON.stringify(NETWORK_LABELS)}`);
console.log(failures === 0 ? `\nAll ${cases.length} tests passed ✓` : `\n${failures} test(s) FAILED`);
process.exit(failures === 0 ? 0 : 1);