'use client';

import { Plus, Store } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { BackButton } from '@/components/admin/products/back-button';
import { blankVendor, vendorValues } from '@/components/admin/products/product-values';
import { VendorForm, type VendorAction } from '@/components/admin/products/vendor-form';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { copy } from '@/lib/copy/id';
import type { VendorAdmin } from '@/types/vendor';

const text = copy.products.vendors;

export interface VendorSheetProps {
  // `RW 05 Ecowastreme`, or null under Semua, where the sheet asks for an RW first.
  rwName: string | null;
  vendors: readonly VendorAdmin[];
  // Only the superadmin registers and edits vendors (decision of 2026-10-24); an RW admin reads their own.
  actions: { create: VendorAction; update: VendorAction } | null;
}

type Editing = { vendor: VendorAdmin | null } | null;

function VendorRow({
  vendor,
  canEdit,
  onEdit,
}: {
  vendor: VendorAdmin;
  canEdit: boolean;
  onEdit: (vendor: VendorAdmin) => void;
}) {
  return (
    <li className="flex min-h-14 items-center justify-between gap-2 px-3 py-2">
      <span className="flex flex-wrap items-center gap-2 text-body-sm font-medium">
        {vendor.name}
        {vendor.isActive ? null : <Badge variant="outline">{text.inactive}</Badge>}
      </span>
      {canEdit ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="max-md:min-h-11"
          aria-label={text.edit(vendor.name)}
          onClick={() => {
            onEdit(vendor);
          }}
        >
          {copy.cms.common.edit}
        </Button>
      ) : null}
    </li>
  );
}

function VendorList({
  vendors,
  canEdit,
  onEdit,
}: {
  vendors: readonly VendorAdmin[];
  canEdit: boolean;
  onEdit: (vendor: VendorAdmin | null) => void;
}) {
  return (
    <div className="space-y-3">
      {vendors.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{text.empty}</p>
      ) : null}
      <ul className="divide-y divide-border rounded-lg border border-border">
        {vendors.map((vendor) => (
          <VendorRow key={vendor.id} vendor={vendor} canEdit={canEdit} onEdit={onEdit} />
        ))}
      </ul>
      {canEdit ? (
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            onEdit(null);
          }}
        >
          <Plus aria-hidden />
          {text.add}
        </Button>
      ) : null}
    </div>
  );
}

function SheetBody({ rwName, vendors, actions }: VendorSheetProps) {
  const router = useRouter();
  const [editing, setEditing] = useState<Editing>(null);
  if (rwName === null) return <p className="text-body-sm">{text.chooseRw}</p>;
  if (editing === null || actions === null) {
    return (
      <VendorList
        vendors={vendors}
        canEdit={actions !== null}
        onEdit={(vendor) => {
          setEditing({ vendor });
        }}
      />
    );
  }
  const back = () => {
    setEditing(null);
  };
  return (
    <div className="space-y-4">
      <BackButton label={text.back} onBack={back} />
      <VendorForm
        initial={editing.vendor ? vendorValues(editing.vendor) : blankVendor()}
        action={editing.vendor ? actions.update : actions.create}
        vendorId={editing.vendor?.id ?? null}
        onSaved={() => {
          back();
          router.refresh();
        }}
      />
    </div>
  );
}

// The vendors of the RW in view (Task P4.3.06), in a Sheet from md up and a Drawer below it (docs/StyleGuide.md §6.8).
export function VendorSheet(props: VendorSheetProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setOpen(true);
        }}
      >
        <Store aria-hidden />
        {text.open}
      </Button>
      <ResponsiveSheet
        open={open}
        onOpenChange={setOpen}
        title={text.title}
        description={props.rwName ? text.description(props.rwName) : undefined}
      >
        <SheetBody {...props} />
      </ResponsiveSheet>
    </>
  );
}
