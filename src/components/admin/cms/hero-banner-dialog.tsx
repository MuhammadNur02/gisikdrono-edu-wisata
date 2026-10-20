'use client';

import { FormDialog } from '@/components/admin/cms/form-dialog';
import { HeroBannerForm } from '@/components/admin/cms/hero-banner-form';
import { blankHeroBanner, heroBannerValues } from '@/components/admin/cms/hero-banner-values';
import { withRowId } from '@/components/admin/cms/schedule-values';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';
import type { BannerProductOption, HeroBannerAdmin } from '@/types/cms';

const text = copy.cms.banners;

type BannerAction = (values: unknown) => Promise<ActionResult<HeroBannerAdmin>>;

export interface HeroBannerDialogProps {
  // null for a new banner.
  banner: HeroBannerAdmin | null;
  products: BannerProductOption[];
  // createHeroBannerAction for a new banner, updateHeroBannerAction for one that exists.
  action: BannerAction;
}

export function HeroBannerDialog({ banner, products, action }: HeroBannerDialogProps) {
  const trigger = banner
    ? { label: copy.cms.common.edit, variant: 'ghost' as const, size: 'sm' as const }
    : { label: text.add };
  const send: BannerAction = banner ? (values) => action(withRowId(values, banner.id)) : action;
  return (
    <FormDialog trigger={trigger} title={banner ? text.editTitle : text.addTitle}>
      {(close) => (
        <HeroBannerForm
          banner={banner ? heroBannerValues(banner) : blankHeroBanner()}
          products={products}
          action={send}
          onSaved={close}
        />
      )}
    </FormDialog>
  );
}
