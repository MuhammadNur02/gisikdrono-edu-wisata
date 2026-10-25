import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';
import type { Json } from '@/db/types';

// public.save_package (Task P4.3.11, 20261028080100): a package, a combo's legs and its tiers in one transaction. It
// runs as the caller (security invoker) on the session client, so the grants, policies and triggers decide as they do
// for a direct write.

export interface SavedTier {
  // The id of one of the package's tiers it keeps, or null for a new one.
  id: string | null;
  minPax: number;
  maxPax: number | null;
  pricePerPax: number;
}

export interface PackageSave {
  // null for a new package.
  packageId: string | null;
  // Every column save_package takes, snake_case; rw_id on a new package only.
  fields: Record<string, Json>;
  // A combo's RWs in visiting order; null keeps the legs it has.
  legRwIds: number[] | null;
  tiers: readonly SavedTier[];
}

function tierJson(tier: SavedTier): Json {
  return {
    id: tier.id,
    min_pax: tier.minPax,
    max_pax: tier.maxPax,
    price_per_pax: tier.pricePerPax,
  };
}

export async function savePackage(client: DatabaseClient, save: PackageSave): Promise<string> {
  const id = await resultOf(
    client.rpc('save_package', {
      p_package_id: save.packageId ?? undefined,
      p_package: save.fields,
      p_leg_rw_ids: save.legRwIds ?? undefined,
      p_tiers: save.tiers.map(tierJson),
    }),
  );
  return z.uuid().parse(id);
}
