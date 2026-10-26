'use client';

import { Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { BankAccountActions } from '@/components/admin/bank-accounts/bank-account-forms';
import { BankAccountPanel } from '@/components/admin/bank-accounts/bank-account-panel';
import { BackButton } from '@/components/admin/products/back-button';
import { blankVendor, vendorValues } from '@/components/admin/products/product-values';
import { VendorForm } from '@/components/admin/products/vendor-form';
import type { VendorSheetProps } from '@/components/admin/products/vendor-sheet';
import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { bankAccountsCopy } from '@/lib/copy/bank-accounts';
import { copy } from '@/lib/copy/id';
import { productsCopy } from '@/lib/copy/products';
import type { VendorAdmin } from '@/types/vendor';

const text = productsCopy.vendors;

type Editing = { vendor: VendorAdmin | null } | null;

// A saved vendor's bank account, beside its form and outside it: it is saved with its own authenticator code.
function VendorBankAccount({
  vendorId,
  actions,
}: {
  vendorId: string;
  actions: BankAccountActions;
}) {
  return (
    <section
      className="space-y-3 border-t border-border pt-4"
      aria-labelledby="vendor-bank-account"
    >
      <h3 id="vendor-bank-account" className="text-h4">
        {bankAccountsCopy.title}
      </h3>
      <p className="text-body-sm text-muted-foreground">{bankAccountsCopy.vendorHint}</p>
      <BankAccountPanel target={{ kind: 'vendor', vendorId }} initial={null} actions={actions} />
    </section>
  );
}

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
      {editing.vendor ? (
        <VendorBankAccount
          key={editing.vendor.id}
          vendorId={editing.vendor.id}
          actions={actions.bank}
        />
      ) : null}
    </div>
  );
}

export interface VendorPanelProps extends VendorSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// The vendors of the RW in view (Task P4.3.06), in a Sheet from md up and a Drawer below it (docs/StyleGuide.md §6.8).
// VendorSheet loads this module on the first open, so the vendor form stays out of the list page's first load.
export function VendorPanel({ open, onOpenChange, ...props }: VendorPanelProps) {
  return (
    <ResponsiveSheet
      open={open}
      onOpenChange={onOpenChange}
      title={text.title}
      description={props.rwName ? text.description(props.rwName) : undefined}
    >
      <SheetBody {...props} />
    </ResponsiveSheet>
  );
}
