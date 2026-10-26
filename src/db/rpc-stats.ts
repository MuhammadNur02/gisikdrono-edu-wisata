import 'server-only';

import { z } from 'zod';

import { resultOf, type DatabaseClient } from '@/db/rpc-result';

// public.visit_stats (Task P4.2.01, 20261027080200_stats_rpcs.sql): a staff member's figures per day, week or month of
// a period of at most 12 months, an RW admin's forced to their own RW; zero-filled buckets, no personal data.

const bucketSchema = z.object({
  bucket: z.string(),
  bookings: z.number(),
  pax_booked: z.number(),
  pax_checked_in: z.number(),
  tickets_used: z.number(),
  products_sold: z.number(),
  gross_amount: z.number().nullable(),
});

export type VisitStatsBucket = z.infer<typeof bucketSchema>;

export interface VisitStatsQuery {
  from: string;
  to: string;
  rwId: number | null;
  granularity: 'day' | 'week' | 'month';
}

export async function rpcVisitStats(
  client: DatabaseClient,
  query: VisitStatsQuery,
): Promise<VisitStatsBucket[]> {
  const answer = await resultOf(
    client.rpc('visit_stats', {
      p_from: query.from,
      p_to: query.to,
      p_granularity: query.granularity,
      ...(query.rwId === null ? {} : { p_rw_id: query.rwId }),
    }),
  );
  return z.array(bucketSchema).parse(answer);
}
