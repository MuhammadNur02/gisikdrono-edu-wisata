'use client';

import useEmblaCarousel, { type UseEmblaCarouselType } from 'embla-carousel-react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { useEffect, useState, type KeyboardEvent, type ReactNode } from 'react';

import { useMediaQuery } from '@/hooks/use-media-query';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.7: slides change every 6 s and wait while the visitor points at or tabs into the
// hero, or has asked for reduced motion. Slides move only through embla's own transform, never opacity.
// It uses embla directly rather than src/components/ui/carousel, whose Button pulls in more script than the
// public page budget allows (§10.1).
const AUTOPLAY_INTERVAL_MS = 6000;
const REDUCED_MOTION = '(prefers-reduced-motion: reduce)';

type EmblaApi = UseEmblaCarouselType[1];

// Below lg the controls sit under the photo, with room under them for the wave of the section below (h-6, md:h-10),
// so it never covers a button or its focus ring; from lg they sit on its overlay, bottom right in line with the
// page content, white on the deep brand tint (redesign of 2026-10-23), raised clear of the intro's arc, which rises
// to its full height at the edges (review of PR #51).
const controlClassName =
  'flex size-11 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none lg:border-white/40 lg:bg-brand-deep/40 lg:text-white lg:hover:bg-brand-deep/60';

function useSelectedSlide(api: EmblaApi): number {
  const [selected, setSelected] = useState(0);
  useEffect(() => {
    if (!api) return;
    const onSelect = () => {
      setSelected(api.selectedScrollSnap());
    };
    api.on('select', onSelect);
    return () => {
      api.off('select', onSelect);
    };
  }, [api]);
  return selected;
}

function useAutoplay(api: EmblaApi, isPaused: boolean): void {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION);
  useEffect(() => {
    if (!api || isPaused || prefersReducedMotion) return;
    const timer = window.setInterval(() => {
      api.scrollNext();
    }, AUTOPLAY_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [api, isPaused, prefersReducedMotion]);
}

interface ControlsProps {
  api: EmblaApi;
  total: number;
  selected: number;
}

function SlideControls({ api, total, selected }: ControlsProps) {
  return (
    <div className="flex items-center justify-center gap-1 pt-2 pb-6 md:pb-10 lg:absolute lg:inset-x-0 lg:bottom-20 lg:mx-auto lg:max-w-7xl lg:justify-end lg:px-8 lg:py-0">
      <button type="button" onClick={() => api?.scrollPrev()} className={controlClassName}>
        <ArrowLeft aria-hidden className="size-4" />
        <span className="sr-only">{copy.ui.previousSlide}</span>
      </button>
      {Array.from({ length: total }, (_, index) => (
        <button
          key={index}
          type="button"
          aria-label={copy.ui.goToSlide(index + 1, total)}
          aria-current={index === selected ? 'true' : undefined}
          onClick={() => api?.scrollTo(index)}
          className="group flex size-11 items-center justify-center rounded-full focus-visible:outline-none"
        >
          <span
            className={cn(
              'size-2.5 rounded-full transition-colors group-focus-visible:ring-2 group-focus-visible:ring-ring',
              index === selected ? 'bg-primary lg:bg-white' : 'bg-border lg:bg-white/50',
            )}
          />
        </button>
      ))}
      <button type="button" onClick={() => api?.scrollNext()} className={controlClassName}>
        <ArrowRight aria-hidden className="size-4" />
        <span className="sr-only">{copy.ui.nextSlide}</span>
      </button>
    </div>
  );
}

export interface HeroCarouselProps {
  // Server-rendered slides; the first one carries the page's h1 and the LCP image.
  slides: ReactNode[];
}

// Pointing at or tabbing into the hero holds the current slide.
function usePauseHandlers(setIsPaused: (isPaused: boolean) => void) {
  const pause = () => {
    setIsPaused(true);
  };
  const resume = () => {
    setIsPaused(false);
  };
  return {
    onMouseEnter: pause,
    onMouseLeave: resume,
    onFocusCapture: pause,
    onBlurCapture: resume,
  };
}

export function HeroCarousel({ slides }: HeroCarouselProps) {
  const [viewportRef, api] = useEmblaCarousel({ loop: true });
  const [isPaused, setIsPaused] = useState(false);
  const selected = useSelectedSlide(api);
  const pauseHandlers = usePauseHandlers(setIsPaused);
  useAutoplay(api, isPaused);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowLeft') api?.scrollPrev();
    else if (event.key === 'ArrowRight') api?.scrollNext();
    else return;
    event.preventDefault();
  }

  return (
    <div
      role="region"
      aria-roledescription="carousel"
      onKeyDownCapture={handleKeyDown}
      {...pauseHandlers}
      className="relative"
    >
      <div ref={viewportRef} className="overflow-hidden">
        <div className="-ml-4 flex">
          {slides.map((slide, index) => (
            <div
              key={index}
              role="group"
              aria-roledescription="slide"
              className="min-w-0 shrink-0 grow-0 basis-full pl-4"
            >
              {slide}
            </div>
          ))}
        </div>
      </div>
      <SlideControls api={api} total={slides.length} selected={selected} />
    </div>
  );
}
