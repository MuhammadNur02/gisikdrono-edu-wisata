'use client';

import { Copy } from 'lucide-react';
import { toast } from 'sonner';

import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { staffCopy } from '@/lib/copy/staff';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { formatStaffCode } from '@/lib/utils/staff-code-format';
import type { IssuedInvite } from '@/types/staff';

const text = staffCopy.invite;

// docs/Security.md §5.1: the code is on screen only until this sheet closes; nothing keeps it, so it is read out or
// written down now. It is read in groups of five, and screen readers hear it character by character.
export function IssuedInviteCard({ issued, onDone }: { issued: IssuedInvite; onDone: () => void }) {
  const formatted = formatStaffCode(issued.inviteCode);
  const copyCode = () => {
    navigator.clipboard.writeText(issued.inviteCode).then(
      () => toast.success(text.copied),
      () => undefined,
    );
  };
  return (
    <div className="space-y-4">
      <FormAlert tone="info">{text.codeWarning}</FormAlert>
      <div className="space-y-2">
        <p className="text-body-sm font-medium">{text.codeTitle}</p>
        <p className="rounded-lg border border-border bg-muted px-4 py-3 text-center text-h4 font-mono tracking-widest break-all select-all">
          <span aria-hidden>{formatted}</span>
          <span className="sr-only">{`${text.codeLabel}: ${issued.inviteCode.split('').join(' ')}`}</span>
        </p>
        <Button type="button" variant="outline" className="w-full" onClick={copyCode}>
          <Copy aria-hidden />
          {text.copy}
        </Button>
      </div>
      <p className="text-body-sm">{text.expiresAt(formatDateTimeShort(issued.expiresAt))}</p>
      {issued.acceptableAfter ? (
        <p className="text-body-sm">
          {text.superadminWait(formatDateTimeShort(issued.acceptableAfter))}
        </p>
      ) : null}
      <FormAlert tone="info">{text.onboardingPending}</FormAlert>
      <Button type="button" size="lg" className="w-full" onClick={onDone}>
        {text.done}
      </Button>
    </div>
  );
}
