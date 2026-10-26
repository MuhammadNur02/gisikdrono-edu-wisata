'use client';

import { ShieldCheck } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { DetailCard, EmptyLine } from '@/components/admin/bookings/booking-detail-parts';
import type { DsrAction, DsrStepUpAction } from '@/components/admin/bookings/dsr-dialogs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DSR_STATUS_META } from '@/config/dsr';
import { dsrCopy } from '@/lib/copy/dsr';
import { formatDateTimeShort } from '@/lib/utils/dates';
import { dsrStepsOf, type DsrFinishStep } from '@/lib/utils/dsr-steps';
import type { ActionResult } from '@/types/action-result';
import type { DsrCloseOutcome, StaffDsrRequest } from '@/types/dsr';

// The superadmin's "Permintaan data" on /dashboard/bookings/[id] (Task P4.10.03; docs/Security.md §7.6). A request
// counts once the guest confirmed it with the code sent to the booking's verified number; until then it can only be
// refused. The export's files never appear here: they reach the guest through their own link.

const text = dsrCopy.staff;

const OpenDsrDialog = dynamic(() =>
  import('@/components/admin/bookings/dsr-dialogs').then((module) => module.OpenDsrDialog),
);
const FinishDsrDialog = dynamic(() =>
  import('@/components/admin/bookings/dsr-dialogs').then((module) => module.FinishDsrDialog),
);
const CloseDsrDialog = dynamic(() =>
  import('@/components/admin/bookings/dsr-dialogs').then((module) => module.CloseDsrDialog),
);

export interface DsrPanelActions {
  open: DsrAction;
  acknowledge: (values: unknown) => Promise<ActionResult<null>>;
  finish: Record<DsrFinishStep, DsrAction>;
  close: DsrAction;
  stepUp: DsrStepUpAction;
}

export interface DsrPanelProps {
  bookingId: string;
  isBookingAnonymised: boolean;
  requests: StaffDsrRequest[];
  actions: DsrPanelActions;
}

type OpenDialog =
  | { kind: 'open' }
  | { kind: 'finish'; requestId: string; step: DsrFinishStep }
  | { kind: 'close'; requestId: string; outcomes: DsrCloseOutcome[] };

const FINISH_LABELS: Record<DsrFinishStep, string> = {
  export: text.export,
  deleteParticipants: text.deleteParticipants,
  anonymise: text.anonymise,
};

function RequestStatus({ request }: { request: StaffDsrRequest }) {
  const meta = DSR_STATUS_META[request.status];
  const Icon = meta.icon;
  const label =
    request.outcome !== null
      ? dsrCopy.outcomes[request.outcome]
      : request.verifiedAt === null && request.status === 'received'
        ? text.awaitingIdentity
        : meta.label;
  return (
    <Badge variant={meta.tone} appearance={meta.outline ? 'outline' : 'solid'}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

function RequestClocks({ request }: { request: StaffDsrRequest }) {
  const lines = [text.createdAt(formatDateTimeShort(request.createdAt))];
  if (request.verifiedAt !== null)
    lines.push(text.confirmedAt(formatDateTimeShort(request.verifiedAt)));
  if (request.handledAt !== null && request.outcome !== null) {
    lines.push(text.handledAt(formatDateTimeShort(request.handledAt)));
  } else if (request.verifiedAt !== null) {
    if (request.acknowledgedAt === null)
      lines.push(text.acknowledgeBy(formatDateTimeShort(request.dueAt)));
    if (request.fulfilDueAt !== null)
      lines.push(text.fulfilBy(formatDateTimeShort(request.fulfilDueAt)));
  }
  return (
    <ul className="text-caption text-muted-foreground">
      {lines.map((line) => (
        <li key={line}>{line}</li>
      ))}
    </ul>
  );
}

interface RequestRowProps {
  request: StaffDsrRequest;
  isBookingAnonymised: boolean;
  onAcknowledge: (requestId: string) => void;
  isAcknowledging: boolean;
  onDialog: (dialog: OpenDialog) => void;
}

function StepButton(props: {
  variant: 'default' | 'secondary' | 'destructive' | 'outline';
  isBusy?: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={props.variant}
      className="min-h-11 sm:min-h-9"
      loading={props.isBusy}
      onClick={props.onClick}
    >
      {props.children}
    </Button>
  );
}

function RequestSteps(props: RequestRowProps) {
  const { request, onDialog } = props;
  const steps = dsrStepsOf(request, props.isBookingAnonymised);
  return (
    <div className="flex flex-wrap gap-2" role="group" aria-label={text.steps}>
      {steps.canAcknowledge ? (
        <StepButton
          variant="default"
          isBusy={props.isAcknowledging}
          onClick={() => {
            props.onAcknowledge(request.id);
          }}
        >
          {text.acknowledge}
        </StepButton>
      ) : null}
      {steps.finishSteps.map((step) => (
        <StepButton
          key={step}
          variant={step === 'export' ? 'secondary' : 'destructive'}
          onClick={() => {
            onDialog({ kind: 'finish', requestId: request.id, step });
          }}
        >
          {FINISH_LABELS[step]}
        </StepButton>
      ))}
      {steps.closeOutcomes.length > 0 ? (
        <StepButton
          variant="outline"
          onClick={() => {
            onDialog({ kind: 'close', requestId: request.id, outcomes: steps.closeOutcomes });
          }}
        >
          {text.close}
        </StepButton>
      ) : null}
    </div>
  );
}

function RequestRow(props: RequestRowProps) {
  const { request } = props;
  return (
    <li className="space-y-2 py-4 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-medium">{dsrCopy.requestTypes[request.requestType]}</p>
        <RequestStatus request={request} />
      </div>
      {request.message ? (
        <p className="text-body-sm whitespace-pre-line">{request.message}</p>
      ) : null}
      {request.resolutionNote ? (
        <p className="text-body-sm whitespace-pre-line text-muted-foreground">
          {request.resolutionNote}
        </p>
      ) : null}
      <RequestClocks request={request} />
      <RequestSteps {...props} />
    </li>
  );
}

function useAcknowledge(bookingId: string, action: DsrPanelActions['acknowledge']) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const acknowledge = (requestId: string) => {
    setPendingId(requestId);
    startTransition(async () => {
      const result = await action({ bookingId, requestId });
      setPendingId(null);
      if (!result.ok) {
        toast.error(result.error.message);
        return;
      }
      toast.success(text.acknowledged);
      router.refresh();
    });
  };
  return { acknowledge, pendingId };
}

function PanelDialog({
  dialog,
  bookingId,
  actions,
  onClose,
}: {
  dialog: OpenDialog;
  bookingId: string;
  actions: DsrPanelActions;
  onClose: () => void;
}) {
  if (dialog.kind === 'open')
    return <OpenDsrDialog bookingId={bookingId} action={actions.open} onClose={onClose} />;
  if (dialog.kind === 'finish') {
    return (
      <FinishDsrDialog
        bookingId={bookingId}
        requestId={dialog.requestId}
        step={dialog.step}
        action={actions.finish[dialog.step]}
        stepUpAction={actions.stepUp}
        onClose={onClose}
      />
    );
  }
  return (
    <CloseDsrDialog
      bookingId={bookingId}
      requestId={dialog.requestId}
      outcomes={dialog.outcomes}
      action={actions.close}
      onClose={onClose}
    />
  );
}

function RequestList(
  props: Omit<RequestRowProps, 'request' | 'isAcknowledging'> & {
    requests: StaffDsrRequest[];
    pendingId: string | null;
  },
) {
  const { requests, pendingId, ...row } = props;
  if (requests.length === 0) return <EmptyLine>{text.empty}</EmptyLine>;
  return (
    <ul className="divide-y divide-border">
      {requests.map((request) => (
        <RequestRow
          key={request.id}
          {...row}
          request={request}
          isAcknowledging={pendingId === request.id}
        />
      ))}
    </ul>
  );
}

export function DsrPanel({ bookingId, isBookingAnonymised, requests, actions }: DsrPanelProps) {
  const [dialog, setDialog] = useState<OpenDialog | null>(null);
  const { acknowledge, pendingId } = useAcknowledge(bookingId, actions.acknowledge);
  return (
    <DetailCard title={text.title} description={text.description}>
      <div className="space-y-4">
        <RequestList
          requests={requests}
          pendingId={pendingId}
          isBookingAnonymised={isBookingAnonymised}
          onAcknowledge={acknowledge}
          onDialog={setDialog}
        />
        {isBookingAnonymised ? null : (
          <Button
            type="button"
            variant="outline"
            className="min-h-11 w-full"
            onClick={() => {
              setDialog({ kind: 'open' });
            }}
          >
            <ShieldCheck aria-hidden />
            {text.open}
          </Button>
        )}
      </div>
      {dialog ? (
        <PanelDialog
          dialog={dialog}
          bookingId={bookingId}
          actions={actions}
          onClose={() => {
            setDialog(null);
          }}
        />
      ) : null}
    </DetailCard>
  );
}
