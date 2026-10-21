'use client';

import { FormDialog } from '@/components/admin/cms/form-dialog';
import { GalleryEditForm } from '@/components/admin/cms/gallery-edit-form';
import { GalleryForm } from '@/components/admin/cms/gallery-form';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';
import type { GalleryItemAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

const text = copy.cms.galleries;

type GalleryAction = (values: unknown) => Promise<ActionResult<GalleryItemAdmin>>;

export function AddGalleryItemDialog({
  owner,
  action,
}: {
  owner: ContentOwner;
  action: GalleryAction;
}) {
  return (
    <FormDialog trigger={{ label: text.add }} title={text.addTitle}>
      {(close) => <GalleryForm owner={owner} action={action} onSaved={close} />}
    </FormDialog>
  );
}

export function EditGalleryItemDialog({
  item,
  action,
}: {
  item: GalleryItemAdmin;
  action: GalleryAction;
}) {
  return (
    <FormDialog
      trigger={{ label: copy.cms.common.edit, variant: 'ghost', size: 'sm' }}
      title={text.editTitle}
    >
      {(close) => <GalleryEditForm item={item} action={action} onSaved={close} />}
    </FormDialog>
  );
}
