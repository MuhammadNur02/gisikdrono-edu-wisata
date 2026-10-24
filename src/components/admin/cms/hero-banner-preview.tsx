'use client';

import { PhotoFrame } from '@/components/marketing/photo';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { IMAGE_SIZES } from '@/config/images';
import { contentListsCopy } from '@/lib/copy/content-lists';
import type { HeroBannerAdmin } from '@/types/cms';

const text = contentListsCopy.banners;

export interface HeroBannerPreviewProps {
  banner: HeroBannerAdmin | null;
  // The featured product's name, when the banner links one.
  productName: string | null;
  onClose: () => void;
}

function Slide({ banner, productName }: { banner: HeroBannerAdmin; productName: string | null }) {
  return (
    <div className="relative flex aspect-video overflow-hidden rounded-xl">
      <PhotoFrame
        image={{
          path: banner.imagePath,
          alt: '',
          width: null,
          height: null,
          placeholderColour: null,
        }}
        sizes={IMAGE_SIZES.split}
        className="absolute inset-0 rounded-none"
      />
      <div aria-hidden className="absolute inset-0 bg-brand-deep/60" />
      <div className="relative flex flex-col justify-end gap-2 p-4 text-white">
        <p className="text-h3 text-balance">{banner.title}</p>
        {banner.subtitle ? (
          <p className="text-body-sm text-pretty text-brand-ice">{banner.subtitle}</p>
        ) : null}
        <div className="flex flex-wrap gap-2 text-caption">
          {banner.ctaLabel ? (
            <span className="rounded-md bg-primary px-3 py-1.5 text-primary-foreground">
              {banner.ctaLabel}
            </span>
          ) : null}
          {productName ? (
            <span className="rounded-md bg-background/90 px-3 py-1.5 text-foreground">
              {text.product(productName)}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// Task P4.9.02: how a banner reads on the home page before it goes live, in a Dialog from md up and a Drawer below it.
// A sketch of the slide, not the carousel itself, so the list page does not load the public hero.
export function HeroBannerPreview({ banner, productName, onClose }: HeroBannerPreviewProps) {
  return (
    <ResponsiveDialog
      open={banner !== null}
      onOpenChange={(isOpen) => {
        if (!isOpen) onClose();
      }}
      title={banner ? text.previewTitle(banner.title) : ''}
      description={text.previewNote}
      size="form"
    >
      {banner ? <Slide banner={banner} productName={productName} /> : null}
    </ResponsiveDialog>
  );
}
