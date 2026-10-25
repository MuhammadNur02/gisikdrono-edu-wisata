'use client';

import { ArrowRight, Navigation, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { RwTag } from '@/components/layout/rw-tag';
import { PhotoFrame } from '@/components/marketing/photo';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mapCopy } from '@/lib/copy/map';
import { uiCopy } from '@/lib/copy/ui';
import type { GeoMarker } from '@/types/map';

export interface PointCardProps {
  marker: GeoMarker;
  onClose: () => void;
}

function useCloseOnEscape(onClose: () => void) {
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', close);
    return () => {
      document.removeEventListener('keydown', close);
    };
  }, [onClose]);
}

function CardActions({ marker }: { marker: GeoMarker }) {
  return (
    <div className="flex flex-wrap gap-2 pt-1">
      <Button size="sm" variant="secondary" asChild className="max-md:flex-1">
        <a
          href={marker.routeUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={mapCopy.routeTo(marker.name)}
        >
          {mapCopy.route}
          <Navigation aria-hidden />
        </a>
      </Button>
      {marker.rwPath ? (
        <Button
          size="sm"
          variant="ghost"
          asChild
          className="max-md:flex-1 max-md:border max-md:border-foreground"
        >
          <Link href={marker.rwPath}>
            {mapCopy.rwPage(marker.rw.label)}
            <ArrowRight data-icon="trailing" aria-hidden />
          </Link>
        </Button>
      ) : null}
    </div>
  );
}

function CardHeader({ marker, onClose }: PointCardProps) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <RwTag rw={marker.rw} detail={marker.detail ?? undefined} />
        <button
          type="button"
          onClick={onClose}
          className="-mt-1.5 -mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X aria-hidden className="size-4.5" />
          <span className="sr-only">{uiCopy.close}</span>
        </button>
      </div>
      <h3 className="flex flex-wrap items-center gap-2 font-display text-lg font-bold md:text-xl">
        {marker.name}
        {marker.isEstimate ? (
          <Badge variant="neutral" size="sm">
            {mapCopy.estimateBadge}
          </Badge>
        ) : null}
      </h3>
    </>
  );
}

// DESIGN-SPEC §3.9 point card: over the map's top left on a wide screen (360 px, 8 px up and in), a bottom sheet with a
// grabber on a phone (it slides up). The photo when the point has one, the RW badge with the point's type, the name,
// the description, the route and the RW page. It takes the focus as it opens; Esc or the close button
// closes it and the focus goes back to its hotspot.
export function PointCard({ marker, onClose }: PointCardProps) {
  useCloseOnEscape(onClose);
  const cardRef = useRef<HTMLElement>(null);
  // The focus moves into the card as it opens, so a keyboard user reads it and reaches its actions next.
  useEffect(() => {
    cardRef.current?.focus();
  }, []);
  return (
    <section
      ref={cardRef}
      tabIndex={-1}
      aria-label={marker.name}
      className="absolute inset-x-0 bottom-0 z-20 card-enter overflow-hidden rounded-t-2xl bg-card shadow-lg outline-none md:inset-x-auto md:top-6 md:bottom-auto md:left-6 md:w-90 md:rounded-2xl"
    >
      <span
        aria-hidden
        className="mx-auto mt-2.5 block h-1 w-10 rounded-full bg-border-strong md:hidden"
      />
      {marker.image ? (
        <PhotoFrame
          image={marker.image}
          sizes="360px"
          aspectClassName="h-37.5"
          className="rounded-none max-md:hidden"
        />
      ) : null}
      <div className="space-y-2.5 p-5 pt-4 md:pt-5">
        <CardHeader marker={marker} onClose={onClose} />
        {marker.description ? (
          <p className="text-body-md text-ink-2">{marker.description}</p>
        ) : null}
        <CardActions marker={marker} />
      </div>
    </section>
  );
}
