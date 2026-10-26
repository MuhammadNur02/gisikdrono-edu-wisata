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

// public.revenue_recap (Task P4.2.01, REC-07): the ledger of a period by day and beneficiary, from v_revenue_recap_daily
// under the same scope as visit_stats. The overview reads the days only.
const recapDaySchema = z.object({ day: z.string(), net_amount: z.number() });
const recapSchema = z.object({ daily: z.array(recapDaySchema) });

export type RevenueRecapDay = z.infer<typeof recapDaySchema>;

export async function rpcRevenueRecapDays(
  client: DatabaseClient,
  query: Omit<VisitStatsQuery, 'granularity'>,
): Promise<RevenueRecapDay[]> {
  const answer = await resultOf(
    client.rpc('revenue_recap', {
      p_from: query.from,
      p_to: query.to,
      ...(query.rwId === null ? {} : { p_rw_id: query.rwId }),
    }),
  );
  return recapSchema.parse(answer).daily;
}
