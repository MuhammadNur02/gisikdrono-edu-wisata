'use client';

import { HeroBannerForm } from '@/components/admin/cms/hero-banner-form';
import { blankHeroBanner, heroBannerValues } from '@/components/admin/cms/hero-banner-values';
import { withRowId } from '@/components/admin/cms/schedule-values';
import type { ActionResult } from '@/types/action-result';
import type { BannerProductOption, HeroBannerAdmin } from '@/types/cms';

type BannerAction = (values: unknown) => Promise<ActionResult<HeroBannerAdmin>>;

export interface HeroBannerEditorProps {
  // null for a new banner.
  banner: HeroBannerAdmin | null;
  products: BannerProductOption[];
  actions: { create: BannerAction; update: BannerAction };
  onSaved: () => void;
}

// The banner form inside the board's sheet (Task P4.9.02), loaded on the sheet's first opening: text, photos, the
// featured product, the order and the window it shows in. An update carries the row's id beside the form's values.
export function HeroBannerEditor({ banner, products, actions, onSaved }: HeroBannerEditorProps) {
  const send: BannerAction = banner
    ? (values) => actions.update(withRowId(values, banner.id))
    : actions.create;
  return (
    <HeroBannerForm
      banner={banner ? heroBannerValues(banner) : blankHeroBanner()}
      products={products}
      action={send}
      onSaved={onSaved}
    />
  );
}
