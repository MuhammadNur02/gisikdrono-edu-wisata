import { Video } from 'lucide-react';

import { EditGalleryItemDialog } from '@/components/admin/cms/gallery-dialogs';
import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { PhotoFrame } from '@/components/marketing/photo';
import { Badge } from '@/components/ui/badge';
import { IMAGE_SIZES } from '@/config/images';
import { GALLERY_CATEGORY_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { contentOwnerLabel } from '@/lib/utils/content-owner';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';

const text = copy.cms.galleries;

interface GalleryActions {
  updateAction: (values: unknown) => Promise<ActionResult<GalleryItemAdmin>>;
  removeAction: (input: unknown) => Promise<ActionResult<null>>;
}

export interface GalleryGridProps extends GalleryActions {
  items: GalleryItemAdmin[];
  showOwner: boolean;
}

function Preview({ item }: { item: GalleryItemAdmin }) {
  if (!item.previewPath) {
    return (
      <div
        role="img"
        aria-label={item.altText}
        className="flex aspect-4/3 items-center justify-center rounded-xl bg-muted"
      >
        <Video aria-hidden className="size-8 text-muted-foreground" />
      </div>
    );
  }
  return (
    <PhotoFrame
      image={{
        path: item.previewPath,
        alt: item.altText,
        width: null,
        height: null,
        placeholderColour: null,
      }}
      sizes={IMAGE_SIZES.thumb}
      aspectClassName="aspect-4/3"
    />
  );
}

function GalleryCard({
  item,
  showOwner,
  updateAction,
  removeAction,
}: GalleryActions & { item: GalleryItemAdmin; showOwner: boolean }) {
  return (
    <li className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3">
      <Preview item={item} />
      <div className="flex flex-wrap gap-1">
        <ContentStatusBadge status={item.status} />
        <Badge variant="neutral">{GALLERY_CATEGORY_LABELS[item.category]}</Badge>
        {item.mediaType === 'video' ? <Badge variant="info">{text.mediaTypes.video}</Badge> : null}
        {showOwner ? <Badge variant="outline">{contentOwnerLabel(item.owner)}</Badge> : null}
      </div>
      <p className="line-clamp-2 text-body-sm">{item.caption ?? item.altText}</p>
      <div className="mt-auto flex justify-end gap-1">
        <EditGalleryItemDialog item={item} action={updateAction} />
        <RemoveButton id={item.id} noun={text.noun} name={item.altText} action={removeAction} />
      </div>
    </li>
  );
}

// A provisional grid (Task P2.9.06), as the public gallery orders it; P4.3.03 brings filters and paging.
export function GalleryGrid({ items, showOwner, ...actions }: GalleryGridProps) {
  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <GalleryCard key={item.id} item={item} showOwner={showOwner} {...actions} />
      ))}
    </ul>
  );
}
