import { HeroBannerDialog } from '@/components/admin/cms/hero-banner-dialog';
import { RemoveButton } from '@/components/admin/cms/remove-button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { copy } from '@/lib/copy/id';
import { formatDateShort } from '@/lib/utils/dates';
import type { ActionResult } from '@/types/action-result';
import type { BannerProductOption, HeroBannerAdmin } from '@/types/cms';

const text = copy.cms.banners;
const common = copy.cms.common;

interface BannerActions {
  updateAction: (values: unknown) => Promise<ActionResult<HeroBannerAdmin>>;
  removeAction: (input: unknown) => Promise<ActionResult<null>>;
}

export interface HeroBannerTableProps extends BannerActions {
  banners: HeroBannerAdmin[];
  products: BannerProductOption[];
}

// When the banner shows: always, or between its dates.
function windowOf(banner: HeroBannerAdmin): string {
  if (banner.startsAt === null && banner.endsAt === null) return text.always;
  const from = banner.startsAt === null ? '…' : formatDateShort(banner.startsAt);
  const until = banner.endsAt === null ? '…' : formatDateShort(banner.endsAt);
  return `${from} – ${until}`;
}

function BannerRow({
  banner,
  products,
  updateAction,
  removeAction,
}: BannerActions & { banner: HeroBannerAdmin; products: BannerProductOption[] }) {
  return (
    <TableRow>
      <TableCell className="min-w-48 whitespace-normal">
        <span className="font-medium">{banner.title}</span>
        {banner.subtitle ? (
          <span className="block text-caption text-muted-foreground">{banner.subtitle}</span>
        ) : null}
      </TableCell>
      <TableCell>
        <Badge variant={banner.isActive ? 'success' : 'neutral'}>
          {banner.isActive ? text.active : text.inactive}
        </Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">{windowOf(banner)}</TableCell>
      <TableCell className="tabular-nums">{banner.sortOrder}</TableCell>
      <TableCell>
        <div className="flex justify-end gap-1">
          <HeroBannerDialog banner={banner} products={products} action={updateAction} />
          <RemoveButton id={banner.id} noun={text.noun} name={banner.title} action={removeAction} />
        </div>
      </TableCell>
    </TableRow>
  );
}

// A provisional list (Task P2.9.06) in the home page's order; P4.3.03 moves it onto the DataTable.
export function HeroBannerTable({ banners, products, ...actions }: HeroBannerTableProps) {
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{text.titleField}</TableHead>
            <TableHead>{common.status}</TableHead>
            <TableHead>{text.window}</TableHead>
            <TableHead>{common.sortOrder}</TableHead>
            <TableHead className="text-right">{common.actions}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {banners.map((banner) => (
            <BannerRow key={banner.id} banner={banner} products={products} {...actions} />
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
