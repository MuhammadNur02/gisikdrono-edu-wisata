import type { Transition } from 'motion/react';

// docs/StyleGuide.md §7.2. Motion takes seconds, so 150/200/300/500/700 ms live here as fractions and no
// component writes a literal duration.
export const duration = { micro: 0.15, short: 0.2, base: 0.3, long: 0.5, max: 0.7 } as const;

export const ease: Record<'outExpo' | 'inOut', [number, number, number, number]> = {
  outExpo: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
};

export const spring = {
  soft: { type: 'spring', stiffness: 300, damping: 30 },
  snappy: { type: 'spring', stiffness: 400, damping: 25 },
} as const satisfies Record<string, Transition>;

// Past eight items a stagger feels like waiting, so longer lists reveal together.
export const stagger = { children: 0.06, delay: 0.1, cap: 8 } as const;

// Section reveals start once, 80 px before the block enters the viewport (§7.2).
export const revealViewport = { once: true, margin: '-80px' } as const;

// Scroll-linked photos (decision of 2026-10-23, §7.3): the layer is --parallax-overscan (112 %) of its frame and
// moves 5 % of its own height each way, about 5.6 % of the frame, so no edge ever shows. This is the one movement
// exempt from the 24 px cap, and it applies to decorative photos only.
export const parallax = { shift: '5%' } as const;
