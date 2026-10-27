import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';

// The finance lists' URL filters (review of PR #80, L-5), split from finance.ts (delta review, L-f): the adjustments
// by status and the Jakarta days they were proposed on, the open issues by the days they were found. A value the URL
// got wrong is left out rather than refused.

type SearchParams = Record<string, string | string[] | undefined>;

const isoDate = z.iso.date();

export interface DayFilter {
  from: string | null;
  to: string | null;
}

export interface AdjustmentFilter extends DayFilter {
  status: (typeof DB_ENUMS.adjustment_status)[number] | null;
}

function firstOf(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function dayOf(params: SearchParams, key: string): string | null {
  const parsed = isoDate.safeParse(firstOf(params, key));
  return parsed.success ? parsed.data : null;
}

export function parseDayFilter(params: SearchParams): DayFilter {
  return { from: dayOf(params, 'from'), to: dayOf(params, 'to') };
}

export function parseAdjustmentFilter(params: SearchParams): AdjustmentFilter {
  const status = z.enum(DB_ENUMS.adjustment_status).safeParse(firstOf(params, 'status'));
  return { ...parseDayFilter(params), status: status.success ? status.data : null };
}
