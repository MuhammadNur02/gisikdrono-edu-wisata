'use client';

import { Users } from 'lucide-react';
import { useState, useTransition } from 'react';

import { DetailCard, EmptyLine } from '@/components/admin/bookings/booking-detail-parts';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { bookingsAdminCopy } from '@/lib/copy/bookings-admin';
import type { ActionResult } from '@/types/action-result';
import type { ParticipantEntry } from '@/types/booking-admin';

const text = bookingsAdminCopy.participants;

type ParticipantsAction = (values: unknown) => Promise<ActionResult<ParticipantEntry[]>>;

// What the panel shows: the button, the list once opened, or why it could not be opened.
type PanelState =
  | { step: 'closed' }
  | { step: 'open'; participants: ParticipantEntry[] }
  | { step: 'refused'; message: string };

function isKnownRole(value: string): value is keyof typeof text.roles {
  return Object.hasOwn(text.roles, value);
}

function roleOf(roleLabel: string | null): string {
  if (roleLabel === null) return '—';
  return isKnownRole(roleLabel) ? text.roles[roleLabel] : roleLabel;
}

function ParticipantTable({ participants }: { participants: readonly ParticipantEntry[] }) {
  if (participants.length === 0) return <EmptyLine>{text.empty}</EmptyLine>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <caption className="sr-only">{text.title}</caption>
        <thead className="text-caption text-muted-foreground">
          <tr>
            <th scope="col" className="py-2 pr-3 font-medium">
              {text.columns.number}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {text.columns.name}
            </th>
            <th scope="col" className="py-2 pr-3 font-medium">
              {text.columns.group}
            </th>
            <th scope="col" className="py-2 font-medium">
              {text.columns.role}
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {participants.map((participant) => (
            <tr key={participant.seqNo}>
              <td className="py-2 pr-3 tabular-nums">{participant.seqNo}</td>
              <td className="py-2 pr-3">{participant.fullName}</td>
              <td className="py-2 pr-3">{participant.groupLabel ?? '—'}</td>
              <td className="py-2">{roleOf(participant.roleLabel)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Opens the list through the action: the list, or why the window or the cap refused it.
function useParticipants(bookingId: string, action: ParticipantsAction) {
  const [state, setState] = useState<PanelState>({ step: 'closed' });
  const [isLoading, startTransition] = useTransition();
  const open = () => {
    startTransition(async () => {
      const result = await action({ bookingId });
      if (result.ok) {
        setState({ step: 'open', participants: result.data });
        return;
      }
      const isOutsideWindow = result.error.code === 'FORBIDDEN';
      setState({
        step: 'refused',
        message: isOutsideWindow ? text.outsideWindow : result.error.message,
      });
    });
  };
  const close = () => {
    setState({ step: 'closed' });
  };
  return { state, isLoading, open, close };
}

function OpenList({
  participants,
  onClose,
}: {
  participants: ParticipantEntry[];
  onClose: () => void;
}) {
  return (
    <div className="space-y-3">
      <ParticipantTable participants={participants} />
      <Button type="button" variant="ghost" className="min-h-11" onClick={onClose}>
        {text.hide}
      </Button>
    </div>
  );
}

// docs/StyleGuide.md §6.10 (Task P4.3.02): the participant list only on request, through rpc_get_participants, which
// checks the window and records the opening. It lives in this component's state only, in a plain list that cannot be
// sorted or exported.
export function ParticipantsPanel({
  bookingId,
  action,
}: {
  bookingId: string;
  action: ParticipantsAction;
}) {
  const { state, isLoading, open, close } = useParticipants(bookingId, action);
  return (
    <DetailCard title={text.title} description={state.step === 'closed' ? text.hint : undefined}>
      {state.step === 'closed' ? (
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          loading={isLoading}
          onClick={open}
        >
          <Users aria-hidden />
          {text.show}
        </Button>
      ) : null}
      {state.step === 'refused' ? <FormAlert tone="info">{state.message}</FormAlert> : null}
      {state.step === 'open' ? (
        <OpenList participants={state.participants} onClose={close} />
      ) : null}
    </DetailCard>
  );
}
