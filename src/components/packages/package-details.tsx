import { CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

import { RwTag } from '@/components/layout/rw-tag';
import { CaptionedPhoto } from '@/components/marketing/photo';
import { TextBlock } from '@/components/marketing/text-block';
import { IMAGE_SIZES } from '@/config/images';
import { copy } from '@/lib/copy/id';
import type { PackageDetail } from '@/types/package';

function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-h3">{title}</h2>
      {children}
    </section>
  );
}

function CheckList({ items }: { items: readonly string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-2 text-body">
          <CheckCircle2 aria-hidden className="mt-1 size-4 shrink-0 text-success" />
          {item}
        </li>
      ))}
    </ul>
  );
}

function Itinerary({ pkg }: { pkg: PackageDetail }) {
  return (
    <ol className="space-y-4 border-l border-border pl-5">
      {pkg.itinerary.map((step) => (
        <li key={`${String(step.order)}-${step.title}`} className="space-y-1">
          <p className="flex flex-wrap items-center gap-2 text-body-sm text-muted-foreground">
            {step.time ? <span className="tabular-nums">{step.time}</span> : null}
            {step.rwId ? <RwTag rwId={step.rwId} /> : null}
          </p>
          <h3 className="text-h4">{step.title}</h3>
          {step.description ? (
            <p className="text-body text-muted-foreground">{step.description}</p>
          ) : null}
        </li>
      ))}
    </ol>
  );
}

// docs/PRD.md FR-PUB-12: what the visit holds. Each block shows only when the CMS filled it (StyleGuide §6.9);
// the first image is the cover above, the rest follow here with the package name as caption (G8).
export function PackageDetails({ pkg }: { pkg: PackageDetail }) {
  const moreImages = pkg.images.slice(1);
  return (
    <div className="space-y-12">
      {pkg.descriptionMd ? <TextBlock text={pkg.descriptionMd} /> : null}
      {pkg.highlights.length > 0 ? (
        <DetailBlock title={copy.catalogue.highlights}>
          <CheckList items={pkg.highlights} />
        </DetailBlock>
      ) : null}
      {pkg.inclusions.length > 0 ? (
        <DetailBlock title={copy.catalogue.inclusions}>
          <CheckList items={pkg.inclusions} />
        </DetailBlock>
      ) : null}
      {pkg.itinerary.length > 0 ? (
        <DetailBlock title={copy.catalogue.itinerary}>
          <Itinerary pkg={pkg} />
        </DetailBlock>
      ) : null}
      {moreImages.length > 0 ? (
        <ul className="grid gap-4 sm:grid-cols-2">
          {moreImages.map((image) => (
            <li key={image.path}>
              <CaptionedPhoto
                image={image}
                caption={pkg.name}
                sizes={IMAGE_SIZES.card}
                aspectClassName="aspect-4/3"
              />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
