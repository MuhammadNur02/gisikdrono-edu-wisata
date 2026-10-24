'use client';

import { useId } from 'react';

const SVG_ID_UNSAFE = /[^a-zA-Z0-9_-]/g;

// An id fit for an SVG url(#…) reference (a chart's gradient), unique per mounted component: useId() may contain
// characters a url() fragment does not accept.
export function useSvgId(prefix: string): string {
  return `${prefix}-${useId().replace(SVG_ID_UNSAFE, '')}`;
}
