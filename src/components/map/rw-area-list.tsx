'use client';

import { ArrowRight, ChevronDown, ExternalLink, MapPin } from 'lucide-react';
import { useReducedMotion } from 'motion/react';
import Link from 'next/link';
import { useEffect, useId } from 'react';

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
}

type AreaPoint = RwAreaSummary['points'][number];
type AreaUnit = NonNullable<RwAreaSummary['unit']>;

function buttonIdOf(rw: RwId): string {
  return `rw-area-${String(rw)}`;
}

function panelIdOf(rw: RwId): string {
  return `rw-area-${String(rw)}-panel`;
}

function Swatch({ area }: { area: RwAreaSummary }) {
  const fill = area.unit ? rwAccentClasses(area.unit.accentKey).fill : NEUTRAL_ACCENT_CLASSES.fill;
  return <span aria-hidden className={cn('size-3 shrink-0 rounded-full', fill)} />;
}

function PointRow({ point }: { point: AreaPoint }) {
  return (
    <li className="flex min-h-11 items-center gap-2">
      <MapPin aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="block text-body-sm font-medium">{point.name}</span>
        <span className="block text-caption text-muted-foreground">{point.typeLabel}</span>
      </span>
      {point.routeUrl ? (
        <a
          href={point.routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={mapCopy.routeTo(point.name)}
          className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-body-sm text-primary-text underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <ExternalLink aria-hidden className="size-4" />
          {mapCopy.route}
        </a>
      ) : null}
    </li>
  );
}

// What an edu-tourism RW offers: its activity points, its own page and the route to it.
function EduPanel({ area, unit }: { area: RwAreaSummary; unit: AreaUnit }) {
  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <p className="text-overline text-muted-foreground">{mapCopy.areaPoints}</p>
        {area.points.length > 0 ? (
          <ul>
            {area.points.map((point) => (
              <PointRow key={point.id} point={point} />
            ))}
          </ul>
        ) : (
          <p className="text-body-sm text-muted-foreground">{mapCopy.areaNoPoints}</p>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href={unit.path}>
            <ArrowRight aria-hidden />
            {mapCopy.areaRwPage(unit.name)}
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
    </div>
  );
}

interface AreaItemProps extends Pick<RwAreaListProps, 'onToggle' | 'onHover'> {
  area: RwAreaSummary;
  isOpen: boolean;
}

// A disclosure button per RW: the keyboard and screen-reader path to what clicking the area on the map shows.
// Hovering or focusing it highlights the area on the map.
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
      className="flex min-h-11 w-full items-center gap-3 rounded-xl px-4 py-2.5 text-left transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none motion-reduce:transition-none"
    >
      <Swatch area={area} />
      <span className="min-w-0 flex-1">
        <span className="block text-body font-medium">{area.label}</span>
        {area.unit ? (
          <span className="block text-caption text-muted-foreground">{area.unit.shortName}</span>
        ) : null}
      </span>
      <ChevronDown
        aria-hidden
        className={cn(
          'size-4 shrink-0 text-muted-foreground transition-transform motion-reduce:transition-none',
          isOpen && 'rotate-180',
        )}
      />
    </button>
  );
}

function AreaItem(props: AreaItemProps) {
  const { area, isOpen } = props;
  return (
    <li>
      <AreaButton {...props} />
      {isOpen ? (
        <div
          id={panelIdOf(area.rw)}
          role="region"
          aria-labelledby={buttonIdOf(area.rw)}
          className="px-4 pt-1 pb-4"
        >
          {area.unit ? (
            <EduPanel area={area} unit={area.unit} />
          ) : (
            <p className="text-body-sm text-muted-foreground">{mapCopy.areaNotEdu}</p>
          )}
        </div>
      ) : null}
    </li>
  );
}

interface AreaGroupProps extends Pick<RwAreaListProps, 'selection' | 'onToggle' | 'onHover'> {
  title: string;
  areas: readonly RwAreaSummary[];
}

// Each group is a list named by its heading, so a screen reader announces "Kampung eduwisata, list, 3 items".
function AreaGroup({ title, areas, selection, ...handlers }: AreaGroupProps) {
  const headingId = useId();
  if (areas.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 id={headingId} className="text-overline text-muted-foreground">
        {title}
      </h3>
      <ul
        aria-labelledby={headingId}
        className="divide-y divide-border rounded-xl border border-border bg-card"
      >
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

// docs/PRD.md FR-PUB-18: every RW of the map, the edu-tourism RWs first, each opening its programme, points, page
// and route in place.
export function RwAreaList({ areas, selection, onToggle, onHover }: RwAreaListProps) {
  useRevealMapSelection(selection);
  const handlers = { selection, onToggle, onHover };
  return (
    <div className="space-y-6">
      <AreaGroup
        title={mapCopy.areaListEdu}
        areas={areas.filter((area) => area.unit !== null)}
        {...handlers}
      />
      <AreaGroup
        title={mapCopy.areaListOther}
        areas={areas.filter((area) => area.unit === null)}
        {...handlers}
      />
    </div>
  );
}
