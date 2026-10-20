import { BookletDialog } from '@/components/admin/cms/booklet-dialog';
import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { BOOKLET_KIND_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { contentOwnerLabel } from '@/lib/utils/content-owner';
import type { ActionResult } from '@/types/action-result';
import type { BookletAdmin } from '@/types/cms';

const text = copy.cms.booklets;
const common = copy.cms.common;

interface BookletActions {
  updateAction: (values: unknown) => Promise<ActionResult<BookletAdmin>>;
  // Only for the superadmin (booklets_super_delete, 0005); the RW admin gets no remove button.
  removeAction: ((input: unknown) => Promise<ActionResult<null>>) | null;
}

export interface BookletTableProps extends BookletActions {
  booklets: BookletAdmin[];
  showOwner: boolean;
}

function BookletRow({
  booklet,
  showOwner,
  updateAction,
  removeAction,
}: BookletActions & { booklet: BookletAdmin; showOwner: boolean }) {
  return (
    <TableRow>
      <TableCell>
        <span className="font-medium">{booklet.title}</span>
        <span className="block text-caption text-muted-foreground">
          {BOOKLET_KIND_LABELS[booklet.kind]}
        </span>
      </TableCell>
      {showOwner ? <TableCell>{contentOwnerLabel(booklet.owner)}</TableCell> : null}
      <TableCell className="whitespace-nowrap tabular-nums">
        {text.pages(booklet.pageCount ?? 0)}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {text.downloads(booklet.downloadCount)}
      </TableCell>
      <TableCell>
        <ContentStatusBadge status={booklet.status} />
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <BookletDialog owner={booklet.owner} booklet={booklet} action={updateAction} />
          {removeAction ? (
            <RemoveButton
              id={booklet.id}
              noun={text.noun}
              name={booklet.title}
              action={removeAction}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

// A provisional list (Task P2.9.06), newest first; P4.3.03 moves it onto the DataTable.
export function BookletTable({ booklets, showOwner, ...actions }: BookletTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{text.titleField}</TableHead>
            {showOwner ? <TableHead>{common.owner}</TableHead> : null}
            <TableHead>{text.pdf}</TableHead>
            <TableHead>{text.downloadsHeading}</TableHead>
            <TableHead>{common.status}</TableHead>
            <TableHead className="text-right">{common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {booklets.map((booklet) => (
            <BookletRow key={booklet.id} booklet={booklet} showOwner={showOwner} {...actions} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
