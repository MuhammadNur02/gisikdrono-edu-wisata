import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

export interface SectionLinkProps {
  href: string;
  // Names the destination (docs/StyleGuide.md §9.2): `Lihat semua paket`.
  label: string;
}

// The `see all` link that closes a section.
export function SectionLink({ href, label }: SectionLinkProps) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-11 items-center gap-2 rounded-md text-body-sm font-medium text-primary-text underline-offset-4 hover:underline"
    >
      {label}
      <ArrowRight aria-hidden className="size-4" />
    </Link>
  );
}
