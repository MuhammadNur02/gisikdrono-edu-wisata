'use client';

import { m } from 'motion/react';
import { Fragment } from 'react';

import { revealViewport } from '@/lib/motion/transitions';
import { fadeInUp, staggerContainer } from '@/lib/motion/variants';

const WORD_SEPARATOR = ' ';

export interface SplitWordsProps {
  text: string;
}

// docs/StyleGuide.md §7.3 (decision of 2026-10-23): the words of one home headline fade up one after another as it
// comes into view, after reactbits.dev's SplitText idea (MIT + Commons Clause; re-implemented with motion, no GSAP
// and no blur, no source copied). Screen readers hear the sentence once, from the hidden copy; the animated words
// are hidden from them. Reduced motion keeps the fade only (MotionConfig). Used once, below the first screen.
export function SplitWords({ text }: SplitWordsProps) {
  const words = text.split(WORD_SEPARATOR);
  return (
    <>
      <span className="sr-only">{text}</span>
      <m.span
        aria-hidden
        variants={staggerContainer(words.length)}
        initial="hidden"
        whileInView="visible"
        viewport={revealViewport}
      >
        {words.map((word, index) => (
          <Fragment key={index}>
            {index > 0 ? WORD_SEPARATOR : null}
            <m.span variants={fadeInUp} className="inline-block">
              {word}
            </m.span>
          </Fragment>
        ))}
      </m.span>
    </>
  );
}
