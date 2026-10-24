import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@/components/ui/button';

// The way back from a create or edit page to its list.
export function BackLink({ href, label }: { href: string; label: string }) {
  return (
    <Button asChild variant="ghost" size="sm" className="self-start max-md:min-h-11">
      <Link href={href}>
        <ArrowLeft aria-hidden />
        {label}
      </Link>
    </Button>
  );
}
