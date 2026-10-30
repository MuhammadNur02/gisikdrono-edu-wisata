'use client';

import { createContext, use } from 'react';

import type { ProductVariant } from '@/types/product';

// The variant a visitor picked on /produk/[slug] (decision of 2026-10-30, docs/PRD.md FR-PUB-13a), shared by the photo
// in the main column and the picker and order button in the panel through VariantChoiceProvider.
export interface VariantChoice {
  variants: readonly ProductVariant[];
  chosen: ProductVariant | null;
  choose: (variantId: string) => void;
}

export const VariantChoiceContext = createContext<VariantChoice | null>(null);

export function useVariantChoice(): VariantChoice {
  const choice = use(VariantChoiceContext);
  if (choice === null) throw new Error('useVariantChoice needs a VariantChoiceProvider above it.');
  return choice;
}
