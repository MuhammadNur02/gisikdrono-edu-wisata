'use client';

import { Store } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { BankAccountActions } from '@/components/admin/bank-accounts/bank-account-forms';
import type { VendorAction } from '@/components/admin/products/vendor-form';
import { Button } from '@/components/ui/button';
import { productsCopy } from '@/lib/copy/products';
import type { VendorAdmin } from '@/types/vendor';

// The sheet, its list and the vendor form load on the first open (docs/StyleGuide.md §6.8, admin first-load budget,
// review of PR #35): the products list page ships only this button.
const VendorPanel = dynamic(() =>
  import('@/components/admin/products/vendor-panel').then((module) => module.VendorPanel),
);

export interface VendorSheetProps {
  // `RW 05 Ecowastreme`, or null under Semua, where the sheet asks for an RW first.
  rwName: string | null;
  vendors: readonly VendorAdmin[];
  // Only the superadmin registers and edits vendors (decision of 2026-10-24) and their bank accounts (P4.3.06); an RW
  // admin reads their own vendors.
  actions: { create: VendorAction; update: VendorAction; bank: BankAccountActions } | null;
}

export function VendorSheet(props: VendorSheetProps) {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="outline"
        onClick={() => {
          setHasOpened(true);
          setOpen(true);
        }}
      >
        <Store aria-hidden />
        {productsCopy.vendors.open}
      </Button>
      {hasOpened ? <VendorPanel open={open} onOpenChange={setOpen} {...props} /> : null}
    </>
  );
}
