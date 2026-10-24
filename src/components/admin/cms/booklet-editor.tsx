'use client';

import { BookletForm } from '@/components/admin/cms/booklet-form';
import { blankBooklet, bookletValues } from '@/components/admin/cms/booklet-values';
import type { ActionResult } from '@/types/action-result';
import type { BookletAdmin } from '@/types/cms';
import type { ContentOwner } from '@/types/content';

export interface BookletEditorProps {
  // Who a new booklet's files go up for; an existing booklet keeps its own.
  owner: ContentOwner;
  // null for a new booklet.
  booklet: BookletAdmin | null;
  // createBookletAction for a new booklet, updateBookletAction for one that exists.
  action: (values: unknown) => Promise<ActionResult<BookletAdmin>>;
  onSaved: () => void;
}

// The booklet form inside the board's sheet (Task P4.3.03), loaded on the sheet's first opening.
export function BookletEditor({ owner, booklet, action, onSaved }: BookletEditorProps) {
  return (
    <BookletForm
      booklet={booklet ? bookletValues(booklet) : blankBooklet()}
      savedPageCount={booklet ? (booklet.pageCount ?? 0) : null}
      owner={booklet ? booklet.owner : owner}
      action={action}
      onSaved={onSaved}
    />
  );
}
