'use client';

import { m } from 'motion/react';
import type { ReactNode } from 'react';

import { revealViewport } from '@/lib/motion/transitions';
import { fadeInUp, staggerContainer } from '@/lib/motion/variants';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §7.3: a section block fades up once as it scrolls into view; reduced motion keeps the fade
// only (MotionConfig). The hidden state is rendered on the server, so these wrap only blocks below the first
// viewport, never the hero, the RW mosaic right under it or the map (decision of 2026-10-23). Children stay server
// components.
export interface RevealProps {
  children: ReactNode;
  className?: string;
}

export function Reveal({ children, className }: RevealProps) {
  return (
    <m.div
      variants={fadeInUp}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      className={className}
    >
      {children}
    </m.div>
  );
}

export interface RevealListItem {
  key: string;
  node: ReactNode;
  // The item's own layout classes, added to itemClassName (a mosaic's large first item).
  className?: string;
}

export interface RevealListProps {
  items: readonly RevealListItem[];
  className?: string;
  itemClassName?: string;
}

// A card list whose items fade up one after another (§7.2 stagger, eight at most).
export function RevealList({ items, className, itemClassName }: RevealListProps) {
  return (
    <m.ul
      variants={staggerContainer(items.length)}
      initial="hidden"
      whileInView="visible"
      viewport={revealViewport}
      className={className}
    >
      {items.map((item) => (
        <m.li key={item.key} variants={fadeInUp} className={cn(itemClassName, item.className)}>
          {item.node}
        </m.li>
      ))}
    </m.ul>
  );
}
