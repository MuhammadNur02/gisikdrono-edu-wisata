// Volume tiers of a package (tour_package_price_tiers, Task P4.3.05, REC-13). The exclusion index refuses two tiers
// whose ranges share a group size; the form checks the wanted set here first, and save_package (20261028080100)
// writes it in an order that never trips the index on the way there.

// tour_package_price_tiers.max_pax NULL is open-ended; the exclusion index reads it as this.
const OPEN_END = Number.POSITIVE_INFINITY;
// A combo visits two RWs or more before it may go on sale (tour_packages_legs_guard, 0004).
export const MIN_COMBO_RWS = 2;

export interface TierRange {
  minPax: number;
  maxPax: number | null;
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

// tour_packages_legs_guard: a combo goes on sale only once its saved legs visit two different RWs.
export function comboMayPublish(legRwIds: readonly number[]): boolean {
  return new Set(legRwIds).size >= MIN_COMBO_RWS;
}

// One step of the list moved up or down, the others kept in order.
export function moveLeg<T>(legs: readonly T[], index: number, offset: -1 | 1): T[] {
  const target = index + offset;
  if (target < 0 || target >= legs.length) return [...legs];
  const moved = [...legs];
  const [leg] = moved.splice(index, 1);
  if (leg !== undefined) moved.splice(target, 0, leg);
  return moved;
}
