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

const controlClassName =
  'flex size-11 items-center justify-center rounded-full border border-border bg-background transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

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
    <div className="flex items-center justify-center gap-1">
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
              index === selected ? 'bg-primary' : 'bg-border',
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
      className="space-y-2"
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
