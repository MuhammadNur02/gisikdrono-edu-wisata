'use client';

import dynamic from 'next/dynamic';

import { Skeleton } from '@/components/ui/skeleton';

// docs/StyleGuide.md §5.12: page-flip and the viewer reach the browser only on /e-booklet/[slug], after the
// page itself, behind a 3:2 skeleton (next/dynamic with ssr: false must sit in a client file).
export const Flipbook = dynamic(
  () => import('@/components/booklet/flipbook-viewer').then((module) => module.FlipbookViewer),
  { ssr: false, loading: () => <Skeleton className="aspect-3/2 w-full rounded-xl" /> },
);
