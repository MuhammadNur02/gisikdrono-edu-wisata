'use client';

import { useMemo, useState, type ReactNode } from 'react';

import { VariantChoiceContext, type VariantChoice } from '@/hooks/use-variant-choice';
import type { ProductVariant } from '@/types/product';

export interface VariantChoiceProviderProps {
  variants: readonly ProductVariant[];
  children: ReactNode;
}

// Nothing is picked at first, so the order message asks for a variant until the visitor chooses one; the choice
// lives in this page view only (decision of 2026-10-30).
export function VariantChoiceProvider({ variants, children }: VariantChoiceProviderProps) {
  const [chosenId, setChosenId] = useState<string | null>(null);
  const value = useMemo<VariantChoice>(
    () => ({
      variants,
      // An unavailable variant is never chosen, even if a stale event names it.
      chosen: variants.find((variant) => variant.id === chosenId && variant.isAvailable) ?? null,
      choose: setChosenId,
    }),
    [variants, chosenId],
  );
  return <VariantChoiceContext value={value}>{children}</VariantChoiceContext>;
}
