'use client';

import { UserPlus } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useState } from 'react';

import type { InvitePanelProps } from '@/components/admin/staff/invite-panel';
import { Button } from '@/components/ui/button';
import { staffCopy } from '@/lib/copy/staff';

// The sheet, its form and the code card load on the first click, outside the page's first load (admin budget).
const InvitePanel = dynamic(() =>
  import('@/components/admin/staff/invite-panel').then((module) => module.InvitePanel),
);

export type InviteButtonProps = Omit<InvitePanelProps, 'onClose'>;

export function InviteButton(props: InviteButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        onClick={() => {
          setIsOpen(true);
        }}
      >
        <UserPlus aria-hidden />
        {staffCopy.invite.open}
      </Button>
      {isOpen ? (
        <InvitePanel
          {...props}
          onClose={() => {
            setIsOpen(false);
          }}
        />
      ) : null}
    </>
  );
}
