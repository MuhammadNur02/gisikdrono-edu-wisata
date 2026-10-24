'use client';

import { GalleryEditForm } from '@/components/admin/cms/gallery-edit-form';
import { GalleryForm } from '@/components/admin/cms/gallery-form';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

type GalleryAction = (values: unknown) => Promise<ActionResult<GalleryItemAdmin>>;

export interface GalleryEditorProps {
  // Who a new item's photo goes up for; an existing item keeps its own.
  owner: ContentOwner;
  // null for a new item.
  item: GalleryItemAdmin | null;
  actions: { create: GalleryAction; update: GalleryAction };
  onSaved: () => void;
}

// The gallery forms inside the board's sheet (Task P4.3.03), loaded on the sheet's first opening: the upload form for
// a new item, the description form for one that exists (its photo stays as it is).
export function GalleryEditor({ owner, item, actions, onSaved }: GalleryEditorProps) {
  if (item) return <GalleryEditForm item={item} action={actions.update} onSaved={onSaved} />;
  return <GalleryForm owner={owner} action={actions.create} onSaved={onSaved} />;
}
