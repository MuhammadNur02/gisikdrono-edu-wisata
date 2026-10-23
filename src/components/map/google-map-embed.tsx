'use client';

import { MapPinned } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { mapCopy } from '@/lib/copy/map';

export interface GoogleMapEmbedProps {
  // From googleMapsEmbedUrl (src/lib/utils/geo.ts): the one Google path the CSP lets a frame load.
  embedUrl: string;
}

// The frame shares the 16:9 box of the button that asks for it, so loading it moves nothing.
const FRAME_CLASS = 'relative aspect-video overflow-hidden rounded-xl border border-border bg-muted';
// Google's map needs its scripts, its own origin and the link that opens the map on Google; nothing else, so the
// frame can neither navigate this page nor submit forms.
const FRAME_SANDBOX = 'allow-scripts allow-same-origin allow-popups';

// Mounted only after the visitor asks for it; it takes the focus the button had.
function GoogleFrame({ embedUrl }: GoogleMapEmbedProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);
  useEffect(() => {
    frameRef.current?.focus();
  }, []);
  return (
    <div className={FRAME_CLASS}>
      <iframe
        ref={frameRef}
        src={embedUrl}
        title={mapCopy.googleFrame}
        sandbox={FRAME_SANDBOX}
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
        className="absolute inset-0 size-full border-0"
      />
    </div>
  );
}

// docs/PRD.md FR-PUB-18 with the click-to-load of the gallery's YouTube player (docs/Security.md §8.2): nothing
// from Google loads until the visitor presses the button, so Google learns the visitor's address only then.
export function GoogleMapEmbed({ embedUrl }: GoogleMapEmbedProps) {
  const [isRequested, setIsRequested] = useState(false);
  if (isRequested) return <GoogleFrame embedUrl={embedUrl} />;
  return (
    <div className={`${FRAME_CLASS} flex flex-col items-center justify-center gap-3 p-6 text-center`}>
      <span className="flex size-12 items-center justify-center rounded-full bg-background text-muted-foreground shadow-card">
        <MapPinned aria-hidden className="size-6" strokeWidth={1.5} />
      </span>
      <Button
        type="button"
        variant="secondary"
        onClick={() => {
          setIsRequested(true);
        }}
      >
        {mapCopy.showGoogle}
      </Button>
      <p className="max-w-sm text-caption text-muted-foreground">{mapCopy.googleHint}</p>
    </div>
  );
}
