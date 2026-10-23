// Volume tiers of a package (tour_package_price_tiers, Task P4.3.05, REC-13). The exclusion index refuses two tiers
// whose ranges share a group size; these pure helpers check the wanted set first and order the writes so that a valid
// final set never trips the index on the way there. Full atomicity waits for the save_package RPC (Task P4.3.11).

// tour_package_price_tiers.max_pax NULL is open-ended; the exclusion index reads it as this.
const OPEN_END = Number.POSITIVE_INFINITY;
// A combo visits two RWs or more before it may go on sale (tour_packages_legs_guard, 0004).
export const MIN_COMBO_RWS = 2;

export interface TierRange {
  minPax: number;
  maxPax: number | null;
}

export interface StoredTier extends TierRange {
  id: string;
  pricePerPax: number;
}

export interface WantedTier extends TierRange {
  // Set for a tier that exists, so its price change is one history entry rather than a removal and an addition.
  id: string | null;
  pricePerPax: number;
}

export interface TierWritePlan {
  deletes: string[];
  // Updates that only narrow a stored range: they free sizes, so they go before anything that takes sizes.
  shrinks: StoredTier[];
  // Updates that take sizes the tier did not have, then new tiers.
  grows: StoredTier[];
  inserts: WantedTier[];
}

function upperOf(tier: TierRange): number {
  return tier.maxPax ?? OPEN_END;
}

// Two tiers overlap when neither ends before the other starts; an open-ended tier ends at infinity.
export function tiersOverlap(tiers: readonly TierRange[]): boolean {
  const sorted = tiers.toSorted((first, second) => first.minPax - second.minPax);
  return sorted.some((tier, index) => {
    const next = sorted[index + 1];
    return next !== undefined && upperOf(tier) >= next.minPax;
  });
}

function narrows(before: TierRange, after: TierRange): boolean {
  return after.minPax >= before.minPax && upperOf(after) <= upperOf(before);
}

// Deletes first, then narrowed tiers, then widened or moved ones, then new ones. A tier id the package does not have
// is dropped: the caller only ever names tiers read from the same package.
export function planTierWrites(
  stored: readonly StoredTier[],
  wanted: readonly WantedTier[],
): TierWritePlan {
  const byId = new Map(stored.map((tier) => [tier.id, tier]));
  const keptIds = new Set(wanted.flatMap((tier) => (tier.id === null ? [] : [tier.id])));
  const plan: TierWritePlan = {
    deletes: stored.filter((tier) => !keptIds.has(tier.id)).map((tier) => tier.id),
    shrinks: [],
    grows: [],
    inserts: wanted.filter((tier) => tier.id === null),
  };
  for (const tier of wanted) {
    const before = tier.id === null ? undefined : byId.get(tier.id);
    if (before === undefined || tier.id === null) continue;
    const update = { ...tier, id: tier.id };
    (narrows(before, tier) ? plan.shrinks : plan.grows).push(update);
  }
  return plan;
}

// tour_packages_legs_guard: a combo goes on sale only once its saved legs visit two different RWs.
export function comboMayPublish(legRwIds: readonly number[]): boolean {
  return new Set(legRwIds).size >= MIN_COMBO_RWS;
}
