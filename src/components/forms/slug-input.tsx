'use client';

import { useEffect, useState } from 'react';
import type * as React from 'react';

import { InputWithPrefix } from '@/components/forms/input-with-prefix';
import { slugify } from '@/lib/utils/slugify';

export interface SlugInputProps extends Omit<
  React.ComponentProps<'input'>,
  'value' | 'onChange' | 'prefix'
> {
  value: string;
  onChange: (slug: string) => void;
  // The title the slug follows until someone edits the slug by hand.
  source: string;
  // The public path in front of the slug, shown as a chip: '/paket-wisata/'.
  prefix: string;
}

// Public slugs are Indonesian, lowercase words joined by dashes (CLAUDE.md §3.3). New items follow
// their title; once an officer types in the field, the slug stays theirs. It is tidied on blur.
export function SlugInput({ value, onChange, source, prefix, onBlur, ...props }: SlugInputProps) {
  const [isEditedByHand, setIsEditedByHand] = useState(
    () => value !== '' && value !== slugify(source),
  );

  // Only writes when the slug would actually change, so a new onChange function each render cannot loop.
  useEffect(() => {
    const followed = slugify(source);
    if (!isEditedByHand && followed !== value) onChange(followed);
  }, [source, isEditedByHand, value, onChange]);

  return (
    <InputWithPrefix
      prefix={prefix}
      autoCapitalize="none"
      autoCorrect="off"
      spellCheck={false}
      value={value}
      onChange={(event) => {
        setIsEditedByHand(true);
        onChange(event.target.value.toLowerCase().replace(/\s+/g, '-'));
      }}
      onBlur={(event) => {
        onChange(slugify(value));
        onBlur?.(event);
      }}
      {...props}
    />
  );
}
