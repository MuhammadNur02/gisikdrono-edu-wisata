'use client';

import { BookletForm } from '@/components/admin/cms/booklet-form';
import { blankBooklet, bookletValues } from '@/components/admin/cms/booklet-values';
import { FormDialog } from '@/components/admin/cms/form-dialog';
import { copy } from '@/lib/copy/id';
import type { ActionResult } from '@/types/action-result';
import type { BookletAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

const text = copy.cms.booklets;

export interface BookletDialogProps {
  // Who a new booklet's files go up for; an existing booklet keeps its own.
  owner: ContentOwner;
  // null for a new booklet.
  booklet: BookletAdmin | null;
  action: (values: unknown) => Promise<ActionResult<BookletAdmin>>;
}

export function BookletDialog({ owner, booklet, action }: BookletDialogProps) {
  const trigger = booklet
    ? { label: copy.cms.common.edit, variant: 'ghost' as const, size: 'sm' as const }
    : { label: text.add };
  return (
    <FormDialog trigger={trigger} title={booklet ? text.editTitle : text.addTitle}>
      {(close) => (
        <BookletForm
          booklet={booklet ? bookletValues(booklet) : blankBooklet()}
          savedPageCount={booklet ? (booklet.pageCount ?? 0) : null}
          owner={booklet ? booklet.owner : owner}
          action={action}
          onSaved={close}
        />
      )}
    </FormDialog>
  );
}
