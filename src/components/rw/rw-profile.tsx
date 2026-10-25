import { Clock3, MapPin, Sun, Users, type LucideIcon } from 'lucide-react';

import { SectionShell } from '@/components/layout/section';
import { SectionHeading } from '@/components/layout/section-heading';
import { CaptionedPhoto } from '@/components/marketing/photo';
import { Badge } from '@/components/ui/badge';
import { IMAGE_SIZES } from '@/config/images';
import { RW_PAGE_VOICE, rwPageCopy } from '@/lib/copy/rw-page';
import type { RwGalleryPhoto } from '@/lib/utils/rw-photos';
import type { SessionSummary } from '@/lib/utils/session-summary';
import type { PackageSummary } from '@/types/package';
import type { RwUnitProfile } from '@/types/rw-unit';

const PARAGRAPH_BREAK = /\n\s*\n/;
// `Sesi Pagi` reads `Pagi` in the facts strip.
const SESSION_PREFIX = /^Sesi\s+/i;
// The profile shows two photos side by side.
const PAIR = 2;
// A strip of one fact says too little; it shows from two.
const MIN_FACTS = 2;

function paragraphsOf(markdown: string | null): string[] {
  if (!markdown) return [];
  return markdown
    .split(PARAGRAPH_BREAK)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export interface RwProfileProps {
  id: string;
  unit: RwUnitProfile;
  photos: readonly RwGalleryPhoto[];
}

// The profile text (rw_units.description_md, then vision_md): the first paragraph larger, in ink, the others in ink-2.
// React escapes it; Markdown marks show as written until a renderer is chosen (CLAUDE.md §7.8).
function ProfileText({ unit }: { unit: RwUnitProfile }) {
  const [first, ...rest] = [...paragraphsOf(unit.descriptionMd), ...paragraphsOf(unit.visionMd)];
  if (first === undefined) return null;
  return (
    <div className="space-y-5 reveal-stagger lg:pt-3">
      <p className="reveal text-body-lg text-pretty text-foreground">{first}</p>
      {rest.map((paragraph) => (
        <p
          key={paragraph}
          className="reveal text-body text-pretty text-ink-2 md:text-lg md:leading-relaxed"
        >
          {paragraph}
        </p>
      ))}
    </div>
  );
}

function DrivenBy({ names }: { names: readonly string[] }) {
  return (
    <div className="reveal space-y-3">
      <p className="text-meta-caps text-muted-foreground max-lg:sr-only">
        {rwPageCopy.profile.drivenBy}
      </p>
      <ul className="flex flex-wrap gap-2">
        {names.map((name) => (
          <li key={name}>
            <Badge variant="rw" dot className="max-md:before:hidden">
              {name}
            </Badge>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Two photos side by side under the text, 440 px tall: the wide one first; a phone shows the first only.
function PhotoPair({ photos }: { photos: readonly RwGalleryPhoto[] }) {
  if (photos.length === 0) return null;
  return (
    <div className="mt-12 grid gap-6 md:mt-16 md:grid-cols-3">
      {photos.slice(0, PAIR).map((photo, index) => (
        <CaptionedPhoto
          key={photo.id}
          image={photo.image}
          caption={photo.caption}
          sizes={index === 0 ? IMAGE_SIZES.split : '(min-width: 768px) 400px, 100vw'}
          aspectClassName="aspect-4/3 md:aspect-auto md:h-110"
          className={index === 0 ? 'reveal md:col-span-2' : 'reveal max-md:hidden'}
        />
      ))}
    </div>
  );
}

// DESIGN-SPEC §3.3 Profil (#profil): the heading in the RW accent and who runs the kampung on the left, the profile on
// the right, then the photo pair.
export function RwProfile({ id, unit, photos }: RwProfileProps) {
  const titleId = `${id}-judul`;
  const voice = RW_PAGE_VOICE[unit.id];
  return (
    <SectionShell id={id} labelledBy={titleId} className="scroll-mt-header-nav lg:pb-24">
      <div className="grid gap-8 lg:grid-cols-12 lg:gap-x-6">
        <div className="space-y-8 lg:col-span-5">
          <SectionHeading
            titleId={titleId}
            eyebrow={rwPageCopy.profile.eyebrow}
            title={voice?.profileTitle ?? rwPageCopy.profile.fallbackTitle(unit.shortName)}
          />
          {voice ? <DrivenBy names={voice.drivenBy} /> : null}
        </div>
        <div className="lg:col-span-6 lg:col-start-7">
          <ProfileText unit={unit} />
        </div>
      </div>
      <PhotoPair photos={photos} />
    </SectionShell>
  );
}

interface Fact {
  icon: LucideIcon;
  label: string;
  value: string;
}

// `08:30:00` reads `08.30`.
function clockOf(time: string): string {
  return time.slice(0, 'HH:MM'.length).replace(':', '.');
}

function slotName(label: string | null, startTime: string): string {
  const time = clockOf(startTime);
  return label ? `${label.replace(SESSION_PREFIX, '')} ${time}` : time;
}

// The facts the data gives: the RW's points, its shortest package, its session times and seats.
function factsOf(
  pointCount: number,
  packages: readonly PackageSummary[],
  sessions: SessionSummary,
): Fact[] {
  const copy = rwPageCopy.facts;
  const facts: Fact[] = [];
  if (pointCount > 0)
    facts.push({ icon: MapPin, label: copy.points, value: copy.pointsValue(pointCount) });
  const durations = packages.flatMap((pkg) => (pkg.durationMinutes ? [pkg.durationMinutes] : []));
  if (durations.length > 0) {
    facts.push({
      icon: Clock3,
      label: copy.duration,
      value: copy.durationValue(Math.min(...durations)),
    });
  }
  if (sessions.slots.length > 0) {
    const value = sessions.slots.map((slot) => slotName(slot.label, slot.startTime)).join(' · ');
    facts.push({ icon: Sun, label: copy.sessions, value });
  }
  if (sessions.capacity !== null) {
    facts.push({ icon: Users, label: copy.capacity, value: copy.capacityValue(sessions.capacity) });
  }
  return facts;
}

// DESIGN-SPEC §3.3 facts strip, on the RW tint: each item rises 12 px in, 60 ms after the one before (§4).
export interface RwFactsProps {
  pointCount: number;
  packages: readonly PackageSummary[];
  sessions: SessionSummary;
}

export function RwFacts({ pointCount, packages, sessions }: RwFactsProps) {
  const facts = factsOf(pointCount, packages, sessions);
  if (facts.length < MIN_FACTS) return null;
  return (
    <div className="bg-rw-soft">
      <dl className="mx-auto grid max-w-7xl grid-cols-2 gap-x-6 gap-y-5 px-5 py-6 reveal-stagger md:grid-cols-4 md:px-10 md:py-7">
        {facts.map(({ icon, label, value }) => {
          const Icon = icon;
          return (
            <div
              key={label}
              className="relative flex reveal flex-col justify-center gap-0.5 md:min-h-11 md:pl-14.5"
            >
              <dt className="text-caption text-rw-strong">
                <span className="absolute top-1/2 left-0 flex size-11 -translate-y-1/2 items-center justify-center rounded-full bg-card max-md:hidden">
                  <Icon aria-hidden className="size-5" />
                </span>
                {label}
              </dt>
              <dd className="font-display text-lg font-bold text-rw-strong">{value}</dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
