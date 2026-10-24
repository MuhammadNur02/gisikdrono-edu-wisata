'use client';

import { CatalogueError } from '@/components/marketing/catalogue-error';

// DESIGN-SPEC §3.14: the list could not load. Only the page's title, trail name and noun come with it: an error boundary is a
// client component, so it carries none of the page's data or copy module.
const TITLE = 'Pilih paket kunjunganmu';
const CRUMB = 'Paket wisata';
const NOUN = 'Paket';

export default function ListError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <CatalogueError title={TITLE} crumb={CRUMB} noun={NOUN} reset={reset} />;
}
