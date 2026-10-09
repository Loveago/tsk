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

/**
 * Generates a 10-slot cycle with exactly 2 true and 8 false values,
 * shuffled randomly using Fisher-Yates algorithm.
 */
export function generate10OrderCycle(): boolean[] {
  const slots: boolean[] = [
    true, true,
    false, false, false, false, false, false, false, false,
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
 * Determines whether the next paid order on data-deals should be allocated to Lofaq Data Hub.
 * Maintains a persistent 10-order cycle with randomized 2-in-10 allocation.
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

  // Validate state: must have 10 slots with exactly 2 true, index between 0 and 9
  const isValid =
    state &&
    Array.isArray(state.slots) &&
    state.slots.length === 10 &&
    state.slots.filter(Boolean).length === 2 &&
    typeof state.index === "number" &&
    state.index >= 0 &&
    state.index < 10;

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
