'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

// Task P4.2.02: Recharts never reaches the dashboard's first load (first-load budget 350 kB, CLAUDE.md §8). The charts
// draw only in the browser; until then a skeleton of the final size holds the space, so nothing shifts.

export const LazyRevenueArea = dynamic(
  () => import('@/components/admin/charts/revenue-area').then((module) => module.RevenueArea),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export const LazyCheckinsBar = dynamic(
  () => import('@/components/admin/charts/checkins-bar').then((module) => module.CheckinsBar),
  { ssr: false, loading: () => <Skeleton className="h-64 w-full" /> },
);

export const LazySparkline = dynamic(
  () => import('@/components/admin/kpi/sparkline').then((module) => module.Sparkline),
  { ssr: false, loading: () => <div aria-hidden className="h-8 w-24" /> },
);
