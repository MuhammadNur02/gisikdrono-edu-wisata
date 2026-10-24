'use client';

import { Ban } from 'lucide-react';

import type { StaffChangeRequest } from '@/components/admin/staff/change-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { rwLabel } from '@/config/rw';
import { staffCopy } from '@/lib/copy/staff';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { StaffInviteSummary } from '@/types/staff';

const text = staffCopy.invites;

type OnRequest = (request: StaffChangeRequest) => void;

function roleOf(invite: StaffInviteSummary): string {
  if (invite.role === 'admin_rw' && invite.rwId !== null) {
    return `${staffCopy.roles.admin_rw} ${rwLabel(invite.rwId)}`;
  }
  return staffCopy.roles[invite.role];
}

function InviteRow({ invite, onRequest }: { invite: StaffInviteSummary; onRequest: OnRequest }) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 text-body-sm">
        <p className="font-medium break-all">{invite.email}</p>
        <p className="text-muted-foreground">
          {roleOf(invite)} · {text.expires} {formatDateTimeShort(invite.expiresAt)}
        </p>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11"
        onClick={() => {
          onRequest({ kind: 'revokeInvite', invite });
        }}
      >
        <Ban aria-hidden />
        {text.revoke}
        <span className="sr-only"> {invite.email}</span>
      </Button>
    </li>
  );
}

// Task P4.8.03: the invites that can still be accepted, newest first, as a list that reads the same at 360 px. Each
// can be revoked, for good, with the authenticator code.
export function InviteList({
  invites,
  onRequest,
}: {
  invites: readonly StaffInviteSummary[];
  onRequest: OnRequest;
}) {
  return (
    <Card>
      <CardHeader>
        <h2 className="text-h4">{text.title}</h2>
      </CardHeader>
      <CardContent>
        {invites.length === 0 ? (
          <p className="text-body-sm text-muted-foreground">{text.empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {invites.map((invite) => (
              <InviteRow key={invite.id} invite={invite} onRequest={onRequest} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
