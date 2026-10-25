import { ArrowRight, CalendarClock, MapPin } from 'lucide-react';
import Link from 'next/link';

import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { WhatsAppIcon } from '@/components/layout/whatsapp-icon';
import { Button } from '@/components/ui/button';
import { ARTS_KAMPUNG_HERITAGE } from '@/config/home';
import { APP_TZ } from '@/config/site';
import { SCHEDULE_TYPE_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { rwPageCopy } from '@/lib/copy/rw-page';
import { cn } from '@/lib/utils/cn';
import { formatInstantTimeRange } from '@/lib/utils/dates';
import { joinWithAnd } from '@/lib/utils/lists';
import { packagePath } from '@/lib/utils/paths';
import type { ScheduleOccurrence } from '@/types/schedule';

const dayFormat = new Intl.DateTimeFormat('id-ID', { timeZone: APP_TZ, day: '2-digit' });
const weekdayFormat = new Intl.DateTimeFormat('id-ID', { timeZone: APP_TZ, weekday: 'short' });
const monthFormat = new Intl.DateTimeFormat('id-ID', { timeZone: APP_TZ, month: 'short' });
const longDateFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: APP_TZ,
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

// The date block: the next event filled in the RW accent, the others on its tint (DESIGN-SPEC §3.3).
function DateBlock({ startsAt, isNext }: { startsAt: string; isNext: boolean }) {
  const date = new Date(startsAt);
  return (
    <time
      dateTime={startsAt}
      className={cn(
        'flex h-21 w-19 shrink-0 flex-col items-center justify-center rounded-lg',
        isNext ? 'bg-rw-fill text-on-accent' : 'bg-rw-soft text-rw',
      )}
    >
      <span className="sr-only">{longDateFormat.format(date)}</span>
      <span aria-hidden className="text-meta-caps">
        {weekdayFormat.format(date)}
      </span>
      <span aria-hidden className="font-display text-3xl leading-none font-extrabold">
        {dayFormat.format(date)}
      </span>
      <span aria-hidden className="text-meta-caps">
        {monthFormat.format(date)}
      </span>
    </time>
  );
}

function ScheduleRow({ occurrence, isNext }: { occurrence: ScheduleOccurrence; isNext: boolean }) {
  const { schedule } = occurrence;
  const meta = [formatInstantTimeRange(occurrence.startsAt, occurrence.endsAt), schedule.venue]
    .filter((part) => part !== null)
    .join(' · ');
  return (
    <li className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-border py-5.5">
      <DateBlock startsAt={occurrence.startsAt} isNext={isNext} />
      <div className="min-w-0 flex-1 space-y-1.5">
        <h3 className="flex flex-wrap items-center gap-x-3 gap-y-1 font-display text-lg font-bold md:text-xl">
          {schedule.title}
          <span className="rounded-full bg-rw-soft px-3 py-0.5 font-sans text-caption font-semibold text-rw">
            {SCHEDULE_TYPE_LABELS[schedule.scheduleType]}
          </span>
        </h3>
        <p className="flex items-center gap-2 text-body-md text-ink-2">
          <MapPin aria-hidden className="size-4 shrink-0" />
          {meta}
        </p>
      </div>
      {schedule.packageSlug ? (
        <Link
          href={packagePath(schedule.packageSlug)}
          className="inline-flex min-h-11 items-center gap-2 text-label font-semibold text-rw-strong underline-offset-4 hover:underline"
        >
          {rwPageCopy.schedule.relatedPackage}
          <ArrowRight aria-hidden className="size-4" />
        </Link>
      ) : null}
    </li>
  );
}

// No published performance ahead (the data of 2026-10): say so and offer WhatsApp (DESIGN-SPEC §3.3, empty state).
function ScheduleEmpty({ chatUrl }: { chatUrl: string }) {
  const dances = joinWithAnd(ARTS_KAMPUNG_HERITAGE.dances.map((dance) => `Tari ${dance}`));
  return (
    <div className="flex reveal flex-col gap-5 rounded-xl bg-rw-soft p-6 md:flex-row md:items-center md:gap-6 md:p-7">
      <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-card text-rw">
        <CalendarClock aria-hidden className="size-6" />
      </span>
      <div className="flex-1 space-y-1">
        <p className="font-display text-lg font-bold text-rw-strong md:text-xl">
          {rwPageCopy.schedule.emptyTitle}
        </p>
        <p className="text-body-md text-ink-2">{rwPageCopy.schedule.emptyBody(dances)}</p>
      </div>
      <Button variant="whatsapp" asChild className="rounded-full">
        <a href={chatUrl} target="_blank" rel="noopener noreferrer">
          <WhatsAppIcon className="size-5" />
          {copy.layout.whatsAppChat}
        </a>
      </Button>
    </div>
  );
}

export interface RwScheduleProps {
  id: string;
  occurrences: readonly ScheduleOccurrence[];
  allHref: string;
  chatUrl: string;
}

// DESIGN-SPEC §3.3 Jadwal pertunjukan (#jadwal), for an RW that runs a performance schedule, right after its profile:
// the next five performances (FR-PUB-09), or the empty state while none is announced.
export function RwSchedule({ id, occurrences, allHref, chatUrl }: RwScheduleProps) {
  const titleId = `${id}-judul`;
  return (
    <SectionShell id={id} labelledBy={titleId} className="scroll-mt-header-nav lg:pt-12">
      <div className="space-y-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            titleId={titleId}
            eyebrow={rwPageCopy.schedule.eyebrow}
            title={rwPageCopy.schedule.title}
            description={rwPageCopy.schedule.description}
            size="compact"
          />
          <Link
            href={allHref}
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-label-lg font-semibold text-rw-strong underline-offset-4 hover:underline"
          >
            {rwPageCopy.schedule.all}
            <ArrowRight aria-hidden className="size-4.5" />
          </Link>
        </div>
        {occurrences.length > 0 ? (
          <ol className="border-b border-border">
            {occurrences.map((occurrence, index) => (
              <ScheduleRow
                key={`${occurrence.schedule.id}-${occurrence.startsAt}`}
                occurrence={occurrence}
                isNext={index === 0}
              />
            ))}
          </ol>
        ) : (
          <ScheduleEmpty chatUrl={chatUrl} />
        )}
      </div>
    </SectionShell>
  );
}
