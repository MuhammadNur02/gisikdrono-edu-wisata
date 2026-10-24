'use client';

import type { ColumnDef } from '@tanstack/react-table';
import { ArrowDown, ArrowUp, Eye, EyeOff, GalleryHorizontal } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import { toast } from 'sonner';

import {
  ContentBoard,
  type BoardControls,
  type BoardEditor,
} from '@/components/admin/cms/content-board';
import { actionsColumn, editItem, removeItem } from '@/components/admin/cms/content-columns';
import { ListThumb } from '@/components/admin/cms/list-thumb';
import { ColumnHeader } from '@/components/admin/data-table/column-header';
import type { RowActionItem } from '@/components/admin/data-table/row-actions';
import { EmptyState } from '@/components/admin/shell/empty-state';
import { Badge } from '@/components/ui/badge';
import type { BadgeTone } from '@/config/status';
import { cmsCopy } from '@/lib/copy/cms';
import { contentListsCopy } from '@/lib/copy/content-lists';
import { formatDateShort } from '@/lib/utils/dates';
import type { BannerMove, BannerPhase } from '@/lib/utils/hero-banners';
import type { ActionResult } from '@/types/action-result';
import type { BannerProductOption, HeroBannerAdmin, HeroBannerListItem } from '@/types/cms';
import type { ListFacet } from '@/types/data-table';

const text = cmsCopy.banners;
const lists = contentListsCopy;

// The form and the preview load on first use (admin first-load budget).
const HeroBannerEditor = dynamic(() =>
  import('@/components/admin/cms/hero-banner-editor').then((module) => module.HeroBannerEditor),
);
const HeroBannerPreview = dynamic(() =>
  import('@/components/admin/cms/hero-banner-preview').then((module) => module.HeroBannerPreview),
);

const BANNER_EMPTY = (
  <EmptyState icon={GalleryHorizontal} title={text.empty} description={text.emptyHint} />
);

const PHASE_TONE: Record<BannerPhase, BadgeTone> = {
  live: 'success',
  scheduled: 'info',
  ended: 'neutral',
  inactive: 'neutral',
};

type HeroBannerRow = HeroBannerListItem;

type RowAction = (input: unknown) => Promise<ActionResult<null>>;
type SaveAction = (values: unknown) => Promise<ActionResult<HeroBannerAdmin>>;

interface BannerRowActions {
  deactivate: RowAction;
  remove: RowAction;
  move: RowAction;
}

export interface HeroBannerBoardProps {
  rows: HeroBannerRow[];
  total: number;
  facets: readonly ListFacet[];
  products: BannerProductOption[];
  actions: BannerRowActions & { create: SaveAction; update: SaveAction };
}

interface RowHandlers {
  controls: BoardControls<HeroBannerRow>;
  preview: (banner: HeroBannerRow) => void;
  move: (banner: HeroBannerRow, direction: BannerMove) => void;
}

// When the banner shows: always, or between its dates.
function windowOf(banner: HeroBannerAdmin): string {
  if (banner.startsAt === null && banner.endsAt === null) return text.always;
  const from = banner.startsAt === null ? '…' : formatDateShort(banner.startsAt);
  const until = banner.endsAt === null ? '…' : formatDateShort(banner.endsAt);
  return `${from} – ${until}`;
}

function retireItem(banner: HeroBannerRow, actions: BannerRowActions, handlers: RowHandlers) {
  if (!banner.isActive)
    return removeItem(banner.title, banner.id, actions.remove, handlers.controls.confirm);
  return {
    label: lists.banners.deactivate,
    icon: EyeOff,
    destructive: true,
    onSelect: () => {
      handlers.controls.confirm({
        run: () => actions.deactivate({ id: banner.id }),
        title: lists.banners.deactivateTitle(banner.title),
        consequence: lists.banners.deactivateConsequence,
        confirmLabel: lists.banners.deactivate,
        done: lists.banners.deactivated,
      });
    },
  } satisfies RowActionItem;
}

function itemsOf(banner: HeroBannerRow, actions: BannerRowActions, handlers: RowHandlers) {
  return [
    editItem(() => {
      handlers.controls.edit(banner);
    }),
    {
      label: lists.banners.preview,
      icon: Eye,
      onSelect: () => {
        handlers.preview(banner);
      },
    },
    {
      label: lists.banners.moveUp,
      icon: ArrowUp,
      onSelect: () => {
        handlers.move(banner, 'up');
      },
    },
    {
      label: lists.banners.moveDown,
      icon: ArrowDown,
      onSelect: () => {
        handlers.move(banner, 'down');
      },
    },
    retireItem(banner, actions, handlers),
  ] satisfies RowActionItem[];
}

function describedColumns(): ColumnDef<HeroBannerRow>[] {
  return [
    {
      id: 'photo',
      header: lists.columns.photo,
      cell: ({ row }) => <ListThumb path={row.original.imagePath} alt={row.original.title} />,
      meta: { label: lists.columns.photo },
    },
    {
      id: 'title',
      accessorFn: (banner) => banner.title,
      header: ({ column }) => <ColumnHeader column={column} title={lists.columns.title} />,
      cell: ({ row }) => (
        <span className="whitespace-normal">
          <span className="font-medium">{row.original.title}</span>
          {row.original.productName ? (
            <span className="block text-caption text-muted-foreground">
              {lists.banners.product(row.original.productName)}
            </span>
          ) : null}
        </span>
      ),
      meta: { label: lists.columns.title, card: 'title' },
    },
    {
      id: 'phase',
      header: lists.columns.status,
      cell: ({ row }) => (
        <Badge variant={PHASE_TONE[row.original.phase]}>
          {lists.banners.phases[row.original.phase]}
        </Badge>
      ),
      meta: { label: lists.columns.status, card: 'badge' },
    },
  ];
}

function bannerColumns(
  actions: BannerRowActions,
  handlers: RowHandlers,
): ColumnDef<HeroBannerRow>[] {
  return [
    ...describedColumns(),
    {
      id: 'window',
      header: lists.columns.window,
      cell: ({ row }) => windowOf(row.original),
      meta: { label: lists.columns.window },
    },
    {
      id: 'sort_order',
      accessorFn: (banner) => banner.sortOrder,
      header: ({ column }) => <ColumnHeader column={column} title={lists.columns.sortOrder} />,
      cell: ({ row }) => row.original.sortOrder,
      meta: { label: lists.columns.sortOrder, align: 'right' },
    },
    actionsColumn<HeroBannerRow>(
      (banner) => banner.title,
      (banner) => itemsOf(banner, actions, handlers),
    ),
  ];
}

function bannerEditor(props: HeroBannerBoardProps): BoardEditor<HeroBannerRow> {
  return {
    title: (banner) => (banner ? text.editTitle : text.addTitle),
    render: (banner, close) => (
      <HeroBannerEditor
        banner={banner}
        products={props.products}
        actions={props.actions}
        onSaved={close}
      />
    ),
  };
}

// A move runs at once, as a reorder is easy to take back; the list reloads in the new order.
function useMove(move: RowAction) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  return useCallback(
    (banner: HeroBannerRow, direction: BannerMove) => {
      startTransition(async () => {
        const result = await move({ id: banner.id, direction });
        if (!result.ok) {
          toast.error(result.error.message);
          return;
        }
        toast.success(lists.banners.moved);
        router.refresh();
      });
    },
    [move, router],
  );
}

// Task P4.9.02, docs/PRD.md FR-ADMIN-23: the home page's slides, the superadmin's alone: order (move up or down),
// window (starts_at / ends_at, is_active), featured product and a preview; switched off by is_active instead of deleted.
export function HeroBannerBoard(props: HeroBannerBoardProps) {
  const [previewing, setPreviewing] = useState<HeroBannerRow | null>(null);
  const { deactivate, remove, move } = props.actions;
  const runMove = useMove(move);
  const columns = useCallback(
    (controls: BoardControls<HeroBannerRow>) =>
      bannerColumns(
        { deactivate, remove, move },
        { controls, preview: setPreviewing, move: runMove },
      ),
    [deactivate, remove, move, runMove],
  );
  return (
    <>
      <ContentBoard
        title={text.title}
        description={text.description}
        add={{ label: text.add }}
        columns={columns}
        rows={props.rows}
        total={props.total}
        noun={lists.nouns.banners}
        facets={props.facets}
        searchPlaceholder={lists.search.banners}
        emptyState={BANNER_EMPTY}
        editor={bannerEditor(props)}
      />
      {previewing ? (
        <HeroBannerPreview
          banner={previewing}
          productName={previewing.productName}
          onClose={() => {
            setPreviewing(null);
          }}
        />
      ) : null}
    </>
  );
}
