'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { ResponsiveSheet } from '@/components/admin/shell/responsive-sheet';
import { InviteForm, type InviteFormProps } from '@/components/admin/staff/invite-form';
import { IssuedInviteCard } from '@/components/admin/staff/issued-invite';
import { staffCopy } from '@/lib/copy/staff';
import type { IssuedInvite } from '@/types/staff';

export interface InvitePanelProps extends Omit<InviteFormProps, 'onIssued'> {
  onClose: () => void;
}

// The invite sheet (Task P4.8.02), loaded on the first click. The issued code lives in this component's state only, so
// closing the sheet unmounts it and the code is gone (docs/Security.md §5.1: shown once).
export function InvitePanel({ onClose, ...formProps }: InvitePanelProps) {
  const router = useRouter();
  const [issued, setIssued] = useState<IssuedInvite | null>(null);
  const close = () => {
    onClose();
    if (issued) router.refresh();
  };
  return (
    <ResponsiveSheet
      open
      onOpenChange={(open) => {
        if (!open) close();
      }}
      title={staffCopy.invite.title}
      description={issued ? undefined : staffCopy.invite.description}
    >
      {issued ? (
        <IssuedInviteCard issued={issued} onDone={close} />
      ) : (
        <InviteForm {...formProps} onIssued={setIssued} />
      )}
    </ResponsiveSheet>
  );
}
