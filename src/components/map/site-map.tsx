'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';
import { PLAN_ASPECT_CLASS } from '@/config/map';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.13, §10.1: the plan, react-zoom-pan-pinch and the hotspots reach the browser after the
// page itself, behind a skeleton of the plan's proportions (next/dynamic with ssr: false must sit in a client file).
export const SiteMap = dynamic(
  () => import('@/components/map/site-map-svg').then((module) => module.SiteMapSvg),
  {
    ssr: false,
    loading: () => <Skeleton className={cn('w-full rounded-xl', PLAN_ASPECT_CLASS)} />,
  },
);
