'use client';

import { StickyNote } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DetailCard, EmptyLine } from '@/components/admin/bookings/booking-detail-parts';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { STAFF_FULFILLMENT_STATUSES } from '@/config/bookings';
import { rwLabel } from '@/config/rw';
import { ADDON_FULFILLMENT_STATUS } from '@/config/status';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import { formatIDR } from '@/lib/utils/currency';
import type { ActionResult } from '@/types/action-result';
import type { BookingAddonLine } from '@/types/booking-admin';

const text = bookingsAdminCopy.detail;

type FulfillmentAction = (values: unknown) => Promise<ActionResult<null>>;
type NotesAction = (values: unknown) => Promise<ActionResult<Record<string, string>>>;

// What the card holds of the visitor's notes: none until asked for, dropped again on "Sembunyikan catatan".
interface NotesState {
  notes: Readonly<Record<string, string>> | null;
  refusal: string | null;
}

const NO_NOTES: NotesState = { notes: null, refusal: null };

function isStaffStatus(value: string): value is (typeof STAFF_FULFILLMENT_STATUSES)[number] {
  return STAFF_FULFILLMENT_STATUSES.some((status) => status === value);
}

function FulfillmentSelect({
  bookingId,
  line,
  action,
}: {
  bookingId: string;
  line: BookingAddonLine;
  action: FulfillmentAction;
}) {
  const router = useRouter();
  const [isSaving, startTransition] = useTransition();
  const change = (status: string) => {
    if (!isStaffStatus(status)) return;
    startTransition(async () => {
      const result = await action({ bookingId, addonId: line.id, status });
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(text.fulfillmentSaved(line.productName));
      router.refresh();
    });
  };
  return (
    <Select value={line.fulfillmentStatus} onValueChange={change} disabled={isSaving}>
      <SelectTrigger className="min-h-11 w-44" aria-label={text.fulfillment(line.productName)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {STAFF_FULFILLMENT_STATUSES.map((status) => (
          <SelectItem key={status} value={status}>
            {ADDON_FULFILLMENT_STATUS[status].label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AddonLineItem({
  bookingId,
  line,
  note,
  action,
}: {
  bookingId: string;
  line: BookingAddonLine;
  note: string | undefined;
  action: FulfillmentAction | null;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <span className="space-y-0.5">
        <span className="block text-body-sm font-medium">{line.productName}</span>
        <span className="block text-caption text-muted-foreground tabular-nums">
          {text.quantity(line.qty)} {formatIDR(line.unitPrice)} = {formatIDR(line.lineTotal)} ·{' '}
          {rwLabel(line.rwId)}
        </span>
        {note ? (
          <span className="block text-body-sm whitespace-pre-line">{text.addonNote(note)}</span>
        ) : null}
      </span>
      {line.fulfillmentStatus === 'cancelled' || action === null ? (
        <StatusBadge kind="addon_fulfillment_status" value={line.fulfillmentStatus} />
      ) : (
        <FulfillmentSelect bookingId={bookingId} line={line} action={action} />
      )}
    </li>
  );
}

// Review of PR #76, F-76-5: rpc_get_addon_notes is an audited read, so the notes are loaded on request only.
function useAddonNotes(bookingId: string, action: NotesAction) {
  const [state, setState] = useState<NotesState>(NO_NOTES);
  const [isLoading, startTransition] = useTransition();
  const show = () => {
    startTransition(async () => {
      const result = await action({ bookingId });
      setState(
        result.ok
          ? { notes: result.data, refusal: null }
          : { notes: null, refusal: result.error.message },
      );
    });
  };
  const hide = () => {
    setState(NO_NOTES);
  };
  return { state, isLoading, show, hide };
}

function NotesToggle({
  isShown,
  isLoading,
  onShow,
  onHide,
}: {
  isShown: boolean;
  isLoading: boolean;
  onShow: () => void;
  onHide: () => void;
}) {
  return (
    <Button
      type="button"
      variant={isShown ? 'ghost' : 'outline'}
      className="mt-3 min-h-11"
      loading={isLoading}
      onClick={isShown ? onHide : onShow}
    >
      <StickyNote aria-hidden />
      {isShown ? text.hideNotes : text.showNotes}
    </Button>
  );
}

function NoAddonLines() {
  return (
    <DetailCard title={text.addons}>
      <EmptyLine>{text.addonsEmpty}</EmptyLine>
    </DetailCard>
  );
}

// docs/PRD.md FR-ADMIN-05: the add-on lines this staff member's RLS shows (their own RW's), each marked prepared or
// handed over by its kitchen. A cancelled line shows its status only: it changes through an adjustment (P4.7.03).
export function AddonLines({
  bookingId,
  lines,
  notesAction,
  action,
}: {
  bookingId: string;
  lines: readonly BookingAddonLine[];
  // The visitor's note on each line, by line id (rpc_get_addon_notes): the caller's own RW's lines, inside the window.
  notesAction: NotesAction;
  // null on an anonymised booking: its lines are shown, not marked (review of PR #75, F-75-3).
  action: FulfillmentAction | null;
}) {
  const { state, isLoading, show, hide } = useAddonNotes(bookingId, notesAction);
  if (lines.length === 0) return <NoAddonLines />;
  return (
    <DetailCard title={text.addons} description={action !== null ? text.addonsHint : undefined}>
      {state.refusal ? <FormAlert tone="info">{state.refusal}</FormAlert> : null}
      <ul className="divide-y divide-border">
        {lines.map((line) => (
          <AddonLineItem
            key={line.id}
            bookingId={bookingId}
            line={line}
            note={state.notes?.[line.id]}
            action={action}
          />
        ))}
      </ul>
      <NotesToggle
        isShown={state.notes !== null}
        isLoading={isLoading}
        onShow={show}
        onHide={hide}
      />
    </DetailCard>
  );
}
