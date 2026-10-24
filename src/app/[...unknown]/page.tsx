import { notFound } from 'next/navigation';

// An address no route matches would get Next.js' prerendered /_not-found, whose scripts carry no nonce. Under a private
// prefix (/dashboard, /reservasi, /v, the auth pages) the middleware sends the per-request nonce policy with
// 'strict-dynamic', which then blocks every script of that page (Task P5.4.01). Rendering the 404 per request lets
// Next.js stamp the nonce on it; a public address gets the static policy, which needs none. The root not-found.tsx
// stays static on purpose: the ISR pages' own notFound() renders it, and a dynamic API there would break them.
export const dynamic = 'force-dynamic';

export default function UnknownAddressPage(): never {
  notFound();
}
