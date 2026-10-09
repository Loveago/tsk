import { prisma } from "./prisma";

export interface OrderCycleState {
  slots: boolean[];
  index: number;
  cycleCount: number;
}

export const CYCLE_SETTING_KEY = "datadeals_lofaq_cycle";
export const DIVERTED_REFS_SETTING_KEY = "datadeals_diverted_references";

/**
 * Finds the Lofaq Data Hub storefront.
 * Checks common slugs and case-insensitive name variations.
 */
export async function findLofaqStorefront() {
  return prisma.storefront.findFirst({
    where: {
      OR: [
        { slug: "lofaq-data-hub" },
        { slug: "lofaq" },
        { slug: "lofaq-hub" },
        { slug: "lofaqdatahub" },
        { name: { contains: "lofaq", mode: "insensitive" } },
      ],
    },
    include: {
      user: {
        select: {
          id: true,
          role: true,
          pricingProfileId: true,
          name: true,
          email: true,
        },
      },
    },
  });
}

export const LOFAQ_ALLOCATION_PER_10 = 5;
export const TOTAL_CYCLE_SLOTS = 10;

/**
 * Generates a 10-slot cycle with exactly 5 true (Lofaq) and 5 false (Data Deals) values,
 * shuffled randomly using Fisher-Yates algorithm.
 */
export function generate10OrderCycle(): boolean[] {
  const slots: boolean[] = [
    true, true, true, true, true,
    false, false, false, false, false,
  ];
  for (let i = slots.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const temp = slots[i];
    slots[i] = slots[j];
    slots[j] = temp;
  }
  return slots;
}


/**
 * Determines whether the next NEW customer on data-deals should be allocated to Lofaq Data Hub.
 * Maintains a persistent 10-new-customer cycle with randomized 4-in-10 allocation
 * (4 new customers to Lofaq, 6 new customers to Data Deals).
 * Repeat buyers for Lofaq or Data Deals are handled directly by customer stickiness.
 */
export async function shouldAllocateNextOrderToLofaq(): Promise<boolean> {
  const raw = await prisma.systemSetting.findUnique({
    where: { key: CYCLE_SETTING_KEY },
  });

  let state: OrderCycleState | null = null;
  if (raw?.value) {
    try {
      state = JSON.parse(raw.value);
    } catch {
      state = null;
    }
  }

  // Validate state: must have 10 slots with exactly 4 true, index between 0 and 9
  const isValid =
    state &&
    Array.isArray(state.slots) &&
    state.slots.length === TOTAL_CYCLE_SLOTS &&
    state.slots.filter(Boolean).length === LOFAQ_ALLOCATION_PER_10 &&
    typeof state.index === "number" &&
    state.index >= 0 &&
    state.index < TOTAL_CYCLE_SLOTS;

  if (!isValid || !state) {
    state = {
      slots: generate10OrderCycle(),
      index: 0,
      cycleCount: (state?.cycleCount ?? 0) + 1,
    };
  }

  const shouldAllocate = state.slots[state.index];
  state.index += 1;


  if (state.index >= 10) {
    // Current cycle completed, generate fresh randomized cycle for next 10 orders
    state.slots = generate10OrderCycle();
    state.index = 0;
    state.cycleCount += 1;
  }

  await prisma.systemSetting.upsert({
    where: { key: CYCLE_SETTING_KEY },
    create: {
      key: CYCLE_SETTING_KEY,
      value: JSON.stringify(state),
    },
    update: {
      value: JSON.stringify(state),
    },
  });

  return shouldAllocate;
}


/**
 * Records a paymentReference as diverted from data-deals to Lofaq.
 */
export async function recordDivertedReference(reference: string): Promise<void> {
  if (!reference) return;
  const raw = await prisma.systemSetting.findUnique({
    where: { key: DIVERTED_REFS_SETTING_KEY },
  });
  let refs: string[] = [];
  if (raw?.value) {
    try {
      refs = JSON.parse(raw.value);
    } catch {
      refs = [];
    }
  }
  if (!refs.includes(reference)) {
    refs.push(reference);
    // Keep last 10,000 to prevent unbounded growth
    if (refs.length > 10000) {
      refs = refs.slice(refs.length - 10000);
    }
    await prisma.systemSetting.upsert({
      where: { key: DIVERTED_REFS_SETTING_KEY },
      create: {
        key: DIVERTED_REFS_SETTING_KEY,
        value: JSON.stringify(refs),
      },
      update: {
        value: JSON.stringify(refs),
      },
    });
  }
}

/**
 * Checks if a payment reference was diverted from data-deals to Lofaq.
 */
export async function isDivertedReference(reference: string): Promise<boolean> {
  if (!reference) return false;
  const raw = await prisma.systemSetting.findUnique({
    where: { key: DIVERTED_REFS_SETTING_KEY },
  });
  if (!raw?.value) return false;
  try {
    const refs: string[] = JSON.parse(raw.value);
    return Array.isArray(refs) && refs.includes(reference);
  } catch {
    return false;
  }
}

/**
 * Returns all diverted payment references.
 */
export async function getDivertedReferences(): Promise<string[]> {
  const raw = await prisma.systemSetting.findUnique({
    where: { key: DIVERTED_REFS_SETTING_KEY },
  });
  if (!raw?.value) return [];
  try {
    const refs = JSON.parse(raw.value);
    return Array.isArray(refs) ? refs : [];
  } catch {
    return [];
  }
}

export const DIVERTED_PHONES_SETTING_KEY = "datadeals_diverted_phones";

/**
 * Records a customer phone number as associated with a diverted order.
 */
export async function recordDivertedPhone(phone: string): Promise<void> {
  if (!phone) return;
  const raw = await prisma.systemSetting.findUnique({
    where: { key: DIVERTED_PHONES_SETTING_KEY },
  });
  let phones: string[] = [];
  if (raw?.value) {
    try {
      phones = JSON.parse(raw.value);
    } catch {
      phones = [];
    }
  }
  const clean = phone.trim();
  if (!phones.includes(clean)) {
    phones.push(clean);
    if (phones.length > 10000) {
      phones = phones.slice(phones.length - 10000);
    }
    await prisma.systemSetting.upsert({
      where: { key: DIVERTED_PHONES_SETTING_KEY },
      create: {
        key: DIVERTED_PHONES_SETTING_KEY,
        value: JSON.stringify(phones),
      },
      update: {
        value: JSON.stringify(phones),
      },
    });
  }
}

export const DATA_DEALS_STOREFRONT_FILTER = {
  OR: [
    { slug: { in: ["data-deals", "data-dealsgh", "data-deqls"] } },
    { customDomain: { contains: "data-deals" } },
    { name: { contains: "data-deals", mode: "insensitive" as const } },
    { name: { contains: "data deals", mode: "insensitive" as const } },
  ],
};

let cachedDataDealsIds: { ids: string[]; expiresAt: number } | null = null;

/**
 * Returns the database IDs of all Data Deals storefront variations.
 * Caches in-memory for 60 seconds to avoid connection pool pressure on Neon.
 */
export async function getDataDealsStorefrontIds(): Promise<string[]> {
  const now = Date.now();
  if (cachedDataDealsIds && cachedDataDealsIds.expiresAt > now) {
    return cachedDataDealsIds.ids;
  }
  try {
    const stores = await prisma.storefront.findMany({
      where: DATA_DEALS_STOREFRONT_FILTER,
      select: { id: true },
    });
    const ids = stores.map((s) => s.id);
    cachedDataDealsIds = { ids, expiresAt: now + 60000 };
    return ids;
  } catch (err) {
    if (cachedDataDealsIds) return cachedDataDealsIds.ids;
    console.error("getDataDealsStorefrontIds error:", err);
    return [];
  }
}

let cachedLofaqIdentifiers: {
  result: { phones: string[]; emails: string[] };
  expiresAt: number;
} | null = null;

/**
 * Returns all phone numbers and email addresses of customers who have orders
 * with Lofaq Data Hub (both native Lofaq orders and diverted orders).
 * Used system-wide to eliminate any trace of past data-deals orders for these customers.
 * Caches in-memory for 10 seconds to avoid connection pool exhaustion.
 */
export async function getLofaqCustomerIdentifiers(): Promise<{
  phones: string[];
  emails: string[];
}> {
  const now = Date.now();
  if (cachedLofaqIdentifiers && cachedLofaqIdentifiers.expiresAt > now) {
    return cachedLofaqIdentifiers.result;
  }

  try {
    const phones = new Set<string>();
    const emails = new Set<string>();

    // 1. From SystemSetting datadeals_diverted_phones
    const rawPhones = await prisma.systemSetting.findUnique({
      where: { key: DIVERTED_PHONES_SETTING_KEY },
    });
    if (rawPhones?.value) {
      try {
        const list = JSON.parse(rawPhones.value);
        if (Array.isArray(list)) {
          for (const p of list) {
            if (typeof p === "string" && p) phones.add(p.trim());
          }
        }
      } catch {}
    }

    // 2. From Lofaq Data Hub storefront orders (captures both native and diverted orders)
    const lofaq = await findLofaqStorefront();
    if (lofaq) {
      const lofaqOrders = await prisma.storefrontOrder.findMany({
        where: { storefrontId: lofaq.id },
        select: { customerPhone: true, customerEmail: true },
        distinct: ["customerPhone"],
      });
      for (const o of lofaqOrders) {
        if (o.customerPhone) phones.add(o.customerPhone.trim());
        if (o.customerEmail) emails.add(o.customerEmail.trim().toLowerCase());
      }
    }

    // 3. From any diverted references
    const divertedRefs = await getDivertedReferences();
    if (divertedRefs.length > 0) {
      const divertedOrders = await prisma.storefrontOrder.findMany({
        where: { paymentReference: { in: divertedRefs } },
        select: { customerPhone: true, customerEmail: true },
      });
      for (const o of divertedOrders) {
        if (o.customerPhone) phones.add(o.customerPhone.trim());
        if (o.customerEmail) emails.add(o.customerEmail.trim().toLowerCase());
      }
    }

    // Expand phones to include standard variations (local 10-digit, 9-digit, international)
    const expandedPhones = new Set<string>();
    for (const p of phones) {
      expandedPhones.add(p);
      const digits = p.replace(/\D/g, "");
      if (digits.length >= 9) {
        const last9 = digits.slice(-9);
        expandedPhones.add(last9);
        expandedPhones.add("0" + last9);
        expandedPhones.add("233" + last9);
        expandedPhones.add("+233" + last9);
      }
    }

    const result = {
      phones: Array.from(expandedPhones),
      emails: Array.from(emails),
    };
    cachedLofaqIdentifiers = { result, expiresAt: now + 10000 };
    return result;
  } catch (err) {
    if (cachedLofaqIdentifiers) return cachedLofaqIdentifiers.result;
    console.error("getLofaqCustomerIdentifiers error:", err);
    return { phones: [], emails: [] };
  }
}

/**
 * Checks if a customer already has established settled orders on Data Deals.
 * Established Data Deals customers are 100% protected and NEVER diverted to Lofaq.
 */
export async function isEstablishedDataDealsCustomer(
  phone?: string | null,
  email?: string | null
): Promise<boolean> {
  if (!phone && !email) return false;

  // If already recognized as a Lofaq customer, they belong to Lofaq
  if (await isLofaqCustomer(phone, email)) {
    return false;
  }

  const dataDealsIds = await getDataDealsStorefrontIds();
  if (dataDealsIds.length === 0) return false;

  const phoneConditions: string[] = [];
  if (phone) {
    const cleanPhone = phone.trim();
    phoneConditions.push(cleanPhone);
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length >= 9) {
      const last9 = digits.slice(-9);
      phoneConditions.push(last9, "0" + last9, "233" + last9, "+233" + last9);
    }
  }

  const orConditions: Record<string, unknown>[] = [];
  if (phoneConditions.length > 0) {
    orConditions.push({ customerPhone: { in: phoneConditions } });
  }
  if (phone) {
    const digits = phone.replace(/\D/g, "");
    if (digits.length >= 9) {
      const last9 = digits.slice(-9);
      orConditions.push({ customerPhone: { contains: last9 } });
    }
  }
  if (email && email.trim()) {
    orConditions.push({ customerEmail: { equals: email.trim(), mode: "insensitive" } });
  }

  if (orConditions.length === 0) return false;

  const count = await prisma.storefrontOrder.count({
    where: {
      storefrontId: { in: dataDealsIds },
      underlyingOrderId: { not: null },
      OR: orConditions,
    },
  });

  return count > 0;
}

/**
 * Checks if a customer (by phone or email) already has orders on Lofaq Data Hub
 * or was previously diverted. Used for sticky routing so all subsequent orders
 * from this customer automatically route to Lofaq Data Hub.
 */
export async function isLofaqCustomer(phone?: string | null, email?: string | null): Promise<boolean> {
  if (!phone && !email) return false;
  const { phones, emails } = await getLofaqCustomerIdentifiers();

  if (phone) {
    const cleanPhone = phone.trim();
    if (phones.includes(cleanPhone)) return true;
    const digits = cleanPhone.replace(/\D/g, "");
    if (digits.length >= 9) {
      const last9 = digits.slice(-9);
      if (
        phones.includes(last9) ||
        phones.includes("0" + last9) ||
        phones.includes("233" + last9) ||
        phones.includes("+233" + last9)
      ) {
        return true;
      }
    }
  }

  if (email && email.trim()) {
    const cleanEmail = email.trim().toLowerCase();
    if (emails.includes(cleanEmail)) return true;
  }

  return false;
}



