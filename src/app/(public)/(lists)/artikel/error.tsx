'use client';

import { CatalogueError } from '@/components/marketing/catalogue-error';

// DESIGN-SPEC §3.14: the list could not load. Only the page's title and noun come with it: an error boundary is a
// client component, so it carries none of the page's data or copy module.
const TITLE = 'Kabar dari kampung';
const NOUN = 'Artikel';

export default function ListError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <CatalogueError title={TITLE} noun={NOUN} reset={reset} />;
}
