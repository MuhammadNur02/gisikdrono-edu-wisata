'use client';

import { ArrowRight, ChevronDown, ExternalLink, Locate } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useId } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { NEUTRAL_ACCENT_CLASSES, rwAccentClasses, type RwId } from '@/config/rw';
import { mapCopy } from '@/lib/copy/map';
import { cn } from '@/lib/utils/cn';
import type { RwAreaSelection, RwAreaSummary } from '@/types/map';

export interface RwAreaListProps {
  areas: readonly RwAreaSummary[];
  selection: RwAreaSelection | null;
  onToggle: (rw: RwId) => void;
  onHover: (rw: RwId | null) => void;
  // Shows a point on the map with its card open.
  onLocate: (pointId: string) => void;
}

type AreaPoint = RwAreaSummary['points'][number];
type AreaUnit = NonNullable<RwAreaSummary['unit']>;

// `01`, `02`: the row numbers of a kampung's points.
const ROW_NUMBER_DIGITS = 2;

function buttonIdOf(rw: RwId): string {
  return `rw-area-${String(rw)}`;
}

function panelIdOf(rw: RwId): string {
  return `rw-area-${String(rw)}-panel`;
}

interface PointRowProps {
  point: AreaPoint;
  index: number;
  onLocate: RwAreaListProps['onLocate'];
}

function PointRow({ point, index, onLocate }: PointRowProps) {
  return (
    <li className="flex min-h-13 items-center gap-3 border-t border-border py-2.5">
      <span className="w-6 shrink-0 font-display text-body-sm font-bold text-rw tabular-nums">
        {String(index + 1).padStart(ROW_NUMBER_DIGITS, '0')}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-body-md font-semibold">{point.name}</span>
        <span className="flex flex-wrap items-center gap-2 text-caption text-muted-foreground">
          {point.typeLabel}
          {point.isEstimate ? (
            <Badge variant="neutral" size="sm">
              {mapCopy.estimateBadge}
            </Badge>
          ) : null}
        </span>
      </span>
      {point.routeUrl ? (
        <button
          type="button"
          aria-label={mapCopy.locate(point.name)}
          onClick={() => {
            onLocate(point.id);
          }}
          className="flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-rw"
        >
          <Locate aria-hidden className="size-4.5" />
        </button>
      ) : null}
    </li>
  );
}

// What opens under an edu-tourism RW: its own page and the route to it.
function EduPanel({ area, unit }: { area: RwAreaSummary; unit: AreaUnit }) {
  return (
    <div className="space-y-3 pb-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href={unit.path}>
            {mapCopy.areaRwPage(unit.name)}
            <ArrowRight data-icon="trailing" aria-hidden />
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <a
            href={area.routeUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={mapCopy.areaRouteTo(area.label)}
          >
            <ExternalLink aria-hidden />
            {mapCopy.routeToOffice}
          </a>
        </Button>
      </div>
      {area.centreIsEstimate ? (
        <p className="text-caption text-muted-foreground">{mapCopy.centreEstimated}</p>
      ) : null}
    </div>
  );
}

interface AreaItemProps extends Pick<RwAreaListProps, 'onToggle' | 'onHover' | 'onLocate'> {
  area: RwAreaSummary;
  isOpen: boolean;
}

// An edu-tourism RW leads with its 4 x 22 accent bar and its programme; another RW with a neutral dot and its number.
function AreaName({ area }: { area: RwAreaSummary }) {
  if (!area.unit) {
    return (
      <>
        <span
          aria-hidden
          className={cn('size-2.5 shrink-0 rounded-full', NEUTRAL_ACCENT_CLASSES.fill)}
        />
        <span className="min-w-0 flex-1 text-body-md font-medium">{area.label}</span>
      </>
    );
  }
  return (
    <>
      <span aria-hidden className="h-5.5 w-1 shrink-0 rounded-full bg-rw-fill" />
      <span className="min-w-0 flex-1 font-display text-lg font-bold">
        {`${area.label} · ${area.unit.shortName}`}
      </span>
    </>
  );
}

// A disclosure button per RW: the keyboard and screen-reader path to what clicking the area on the map shows.
// Hovering or focusing it highlights the area on the map. An edu-tourism RW leads with its 4 x 22 accent bar.
function AreaButton({ area, isOpen, onToggle, onHover }: AreaItemProps) {
  const highlight = () => {
    onHover(area.rw);
  };
  const clearHighlight = () => {
    onHover(null);
  };
  return (
    <button
      type="button"
      id={buttonIdOf(area.rw)}
      aria-expanded={isOpen}
      aria-controls={isOpen ? panelIdOf(area.rw) : undefined}
      onClick={() => {
        onToggle(area.rw);
      }}
      onMouseEnter={highlight}
      onMouseLeave={clearHighlight}
      onFocus={highlight}
      onBlur={clearHighlight}
      className="flex min-h-13 w-full items-center gap-3 rounded-md py-2 text-left transition-colors hover:text-rw motion-reduce:transition-none"
    >
      <AreaName area={area} />
      <ChevronDown
        aria-hidden
        className={cn(
          'size-4.5 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none',
          isOpen && 'rotate-180',
        )}
      />
    </button>
  );
}

// An edu-tourism RW lists its points under the button, always in view; the disclosure holds its page and route.
function AreaPoints({ area, onLocate }: Pick<AreaItemProps, 'area' | 'onLocate'>) {
  if (area.points.length === 0) {
    return (
      <p className="border-t border-border py-3 text-body-sm text-muted-foreground">
        {mapCopy.areaNoPoints}
      </p>
    );
  }
  return (
    <ol>
      {area.points.map((point, index) => (
        <PointRow key={point.id} point={point} index={index} onLocate={onLocate} />
      ))}
    </ol>
  );
}

function AreaItem(props: AreaItemProps) {
  const { area, isOpen, onLocate } = props;
  const itemClass = area.unit
    ? cn('rounded-xl bg-card px-5 pt-2 pb-3', rwAccentClasses(area.unit.accentKey).scope)
    : 'rounded-lg bg-card/60 px-4';
  return (
    <li className={itemClass}>
      <AreaButton {...props} />
      {isOpen ? (
        <div
          id={panelIdOf(area.rw)}
          role="region"
          aria-labelledby={buttonIdOf(area.rw)}
          className="pt-1"
        >
          {area.unit ? (
            <EduPanel area={area} unit={area.unit} />
          ) : (
            <p className="pb-3 text-body-sm text-muted-foreground">{mapCopy.areaNotEdu}</p>
          )}
        </div>
      ) : null}
      {area.unit ? <AreaPoints area={area} onLocate={onLocate} /> : null}
    </li>
  );
}

interface AreaGroupProps extends Pick<
  RwAreaListProps,
  'selection' | 'onToggle' | 'onHover' | 'onLocate'
> {
  title: string;
  areas: readonly RwAreaSummary[];
  listClassName: string;
}

// Each group is a list named by its heading, so a screen reader announces "Kampung eduwisata, list, 3 items".
function AreaGroup({ title, areas, selection, listClassName, ...handlers }: AreaGroupProps) {
  const headingId = useId();
  if (areas.length === 0) return null;
  return (
    <div className="space-y-3">
      <h3 id={headingId} className="text-meta-caps text-muted-foreground">
        {title}
      </h3>
      <ul aria-labelledby={headingId} className={listClassName}>
        {areas.map((area) => (
          <AreaItem key={area.rw} area={area} isOpen={selection?.rw === area.rw} {...handlers} />
        ))}
      </ul>
    </div>
  );
}

// An area clicked on the map opens here and is scrolled into view, at once for a visitor who asked for less motion.
function useRevealMapSelection(selection: RwAreaSelection | null) {
  const prefersReducedMotion = useReducedMotion() === true;
  useEffect(() => {
    if (selection?.source !== 'map') return;
    document
      .getElementById(buttonIdOf(selection.rw))
      ?.scrollIntoView({ block: 'nearest', behavior: prefersReducedMotion ? 'auto' : 'smooth' });
  }, [selection, prefersReducedMotion]);
}

// docs/PRD.md FR-PUB-18 and DESIGN-SPEC §3.9 `Daftar titik`: the edu-tourism RWs as columns with every point numbered
// (each can be shown on the map), then the kelurahan's other RWs. Each RW opens its page and route in place.
export function RwAreaList({ areas, selection, onToggle, onHover, onLocate }: RwAreaListProps) {
  useRevealMapSelection(selection);
  const handlers = { selection, onToggle, onHover, onLocate };
  return (
    <div className="space-y-10">
      <AreaGroup
        title={mapCopy.areaListEdu}
        areas={areas.filter((area) => area.unit !== null)}
        listClassName="grid items-start gap-4 md:gap-6 lg:grid-cols-3"
        {...handlers}
      />
      <AreaGroup
        title={mapCopy.areaListOther}
        areas={areas.filter((area) => area.unit === null)}
        listClassName="grid items-start gap-2 sm:grid-cols-2 lg:grid-cols-5"
        {...handlers}
      />
    </div>
  );
}
