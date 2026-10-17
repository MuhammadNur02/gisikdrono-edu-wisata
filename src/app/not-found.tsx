import { MapPinOff } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA, HOME_NAV_ITEM } from '@/config/nav';
import { copy } from '@/lib/copy/id';

export const metadata: Metadata = { title: copy.pages.notFound.eyebrow };

export default function NotFound() {
  const text = copy.pages.notFound;
  return (
    <StatusPage
      icon={MapPinOff}
      eyebrow={text.eyebrow}
      title={text.title}
      description={text.description}
      actions={
        <>
          <Button asChild size="lg">
            <Link href={HOME_NAV_ITEM.href}>{copy.pages.error.home}</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href={BOOKING_CTA.href}>{text.packages}</Link>
          </Button>
        </>
      }
    />
  );
}
