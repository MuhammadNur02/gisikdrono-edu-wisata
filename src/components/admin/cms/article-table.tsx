import Link from 'next/link';

import { RemoveButton } from '@/components/admin/cms/remove-button';
import { ContentStatusBadge } from '@/components/admin/status/status-badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { CMS_PATHS } from '@/config/cms';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { contentOwnerLabel } from '@/lib/utils/content-owner';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { ArticleListItem } from '@/types/cms';

const text = copy.cms.articles;
const common = copy.cms.common;

type RemoveAction = (input: unknown) => Promise<ActionResult<null>>;

export interface ArticleTableProps {
  articles: ArticleListItem[];
  showOwner: boolean;
  // Only for the superadmin (articles_super_delete, 0005); the RW admin gets no remove button.
  removeAction: RemoveAction | null;
}

function ArticleRow({
  article,
  showOwner,
  removeAction,
}: Omit<ArticleTableProps, 'articles'> & { article: ArticleListItem }) {
  return (
    <TableRow>
      <TableCell className="min-w-48 font-medium whitespace-normal">{article.title}</TableCell>
      {showOwner ? <TableCell>{contentOwnerLabel(article.owner)}</TableCell> : null}
      <TableCell>{ARTICLE_CATEGORY_LABELS[article.category]}</TableCell>
      <TableCell>
        <ContentStatusBadge status={article.status} />
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {formatDateShort(article.updatedAt)}
      </TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <Button asChild variant="ghost" size="sm">
            <Link href={CMS_PATHS.editArticle(article.id)}>{common.edit}</Link>
          </Button>
          {removeAction ? (
            <RemoveButton
              id={article.id}
              noun={text.noun}
              name={article.title}
              action={removeAction}
            />
          ) : null}
        </div>
      </TableCell>
    </TableRow>
  );
}

// A provisional list (Task P2.9.06), the last changed first; P4.3.03 moves it onto the DataTable.
export function ArticleTable({ articles, ...options }: ArticleTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{text.titleField}</TableHead>
            {options.showOwner ? <TableHead>{common.owner}</TableHead> : null}
            <TableHead>{text.category}</TableHead>
            <TableHead>{common.status}</TableHead>
            <TableHead>{text.updatedAt}</TableHead>
            <TableHead className="text-right">{common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {articles.map((article) => (
            <ArticleRow key={article.id} article={article} {...options} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
