import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { Container } from '@/components/layout/container';
import { Button } from '@/components/ui/button';
import { BOOKING_CTA } from '@/config/nav';
import { homeCopy } from '@/lib/copy/home';

export interface CtaBandProps {
  id: string;
}

// The three kampung, as three dots in their highlight colours over the eyebrow.
const RW_DOTS = ['bg-rw05-hi', 'bg-rw13-hi', 'bg-rw08-hi'] as const;

// The negative bottom margin lays the band over the footer's top margin, so the footer's night wave rises straight
// out of the forest (DESIGN-SPEC §3.1: a Divider/Wave in night closes the band into the footer).
const MEET_FOOTER = '-mb-6 md:-mb-10 lg:-mb-14';

// DESIGN-SPEC §3.1 `CTA akhir`: the closing forest band with the light kawung at 7 %, centred, a primary xl button and
// an on-photo one; stacked at full width on a phone. Each line rises in 80 ms after the one before (§4, Final CTA).
export function CtaBand({ id }: CtaBandProps) {
  const titleId = `${id}-judul`;
  return (
    <section
      id={id}
      aria-labelledby={titleId}
      className={`kawung bg-forest-night py-18 text-white ring-on-dark kawung-7 md:py-28 lg:pt-32 lg:pb-38 ${MEET_FOOTER}`}
    >
      <Container className="flex flex-col items-center gap-5 text-center reveal-stagger md:gap-6">
        <span aria-hidden className="flex reveal gap-2">
          {RW_DOTS.map((dot) => (
            <span key={dot} className={`size-2.5 rounded-full ${dot}`} />
          ))}
        </span>
        <p className="reveal text-eyebrow text-gold">{homeCopy.cta.eyebrow}</p>
        <h2 id={titleId} className="max-w-205 reveal text-display text-balance reveal-lg">
          {homeCopy.cta.title}
        </h2>
        <p className="max-w-155 reveal text-body-lg text-pretty text-on-forest">
          {homeCopy.cta.description}
        </p>
        <div className="flex w-full reveal flex-col gap-3 pt-3 sm:w-auto sm:flex-row">
          <Button size="xl" asChild className="max-sm:h-14">
            <Link href={BOOKING_CTA.href}>
              {BOOKING_CTA.label}
              <ArrowRight data-icon="trailing" aria-hidden />
            </Link>
          </Button>
          <Button size="xl" variant="onPhoto" asChild className="max-sm:h-14">
            <Link href={BOOKING_CTA.href}>{homeCopy.cta.secondary}</Link>
          </Button>
        </div>
      </Container>
    </section>
  );
}
