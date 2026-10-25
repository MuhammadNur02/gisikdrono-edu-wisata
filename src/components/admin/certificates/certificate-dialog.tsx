'use client';

import { Ban, Download, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';

import {
  bookingTitle,
  hasHeldCertificates,
  isHeld,
} from '@/components/admin/certificates/certificate-labels';
import { RevokeForm, WaiveForm } from '@/components/admin/certificates/reason-form';
import { StatusBadge } from '@/components/admin/status/status-badge';
import { FormAlert } from '@/components/forms/form-alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { certificateDownloadPath } from '@/config/certificates';
import { certificatesCopy } from '@/lib/copy/certificates';
import type { ActionResult } from '@/types/action-result';
import type { CertificateBooking, CertificateSummary } from '@/types/certificate';

const text = certificatesCopy.dashboard;

// The superadmin's two steps; null for an RW admin, who downloads and issues only.
export interface SuperadminCertificateActions {
  waive: (values: unknown) => Promise<ActionResult<number>>;
  revoke: (values: unknown) => Promise<ActionResult<null>>;
}

export interface CertificateDialogProps {
  booking: CertificateBooking;
  actions: SuperadminCertificateActions | null;
  onClose: () => void;
}

type View =
  { step: 'list' } | { step: 'waive' } | { step: 'revoke'; certificate: CertificateSummary };

function DownloadLink({ certificate }: { certificate: CertificateSummary }) {
  return (
    <Button asChild variant="outline" size="sm" className="min-h-11 sm:min-h-9">
      <a href={certificateDownloadPath(certificate.id)} target="_blank" rel="noopener">
        <Download aria-hidden />
        <span aria-hidden>{text.download}</span>
        <span className="sr-only">{text.downloadLabel(certificate.number)}</span>
      </a>
    </Button>
  );
}

function RevokeButton({ number, onRevoke }: { number: string; onRevoke: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="min-h-11 text-destructive sm:min-h-9"
      onClick={onRevoke}
    >
      <Ban aria-hidden />
      {text.revoke}
      <span className="sr-only">: {number}</span>
    </Button>
  );
}

function CertificateLine({
  label,
  certificate,
  onRevoke,
}: {
  label: string;
  certificate: CertificateSummary;
  onRevoke: (() => void) | null;
}) {
  return (
    <li className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="space-y-1">
        <p className="text-body-sm font-medium">{label}</p>
        <p className="font-mono text-caption text-muted-foreground">{certificate.number}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge kind="certificate_status" value={certificate.status} />
        {isHeld(certificate) ? <Badge variant="warning">{text.held}</Badge> : null}
        {certificate.isDownloadable ? <DownloadLink certificate={certificate} /> : null}
        {onRevoke && certificate.status === 'issued' ? (
          <RevokeButton number={certificate.number} onRevoke={onRevoke} />
        ) : null}
      </div>
    </li>
  );
}

function HoldNotice({
  booking,
  onWaive,
}: {
  booking: CertificateBooking;
  onWaive: (() => void) | null;
}) {
  return (
    <FormAlert tone="info">
      <span className="block">
        {booking.unpaidPax > 0 ? text.heldHint(booking.unpaidPax) : text.heldHintNoCount}
      </span>
      {onWaive ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-3 min-h-11"
          onClick={onWaive}
        >
          <ShieldCheck aria-hidden />
          {text.waive}
        </Button>
      ) : (
        <span className="mt-1 block">{text.superadminOnly}</span>
      )}
    </FormAlert>
  );
}

type RevokeFor = (certificate: CertificateSummary) => (() => void) | null;

function ParticipantSection({
  booking,
  revokeFor,
}: {
  booking: CertificateBooking;
  revokeFor: RevokeFor;
}) {
  return (
    <section className="space-y-1">
      <h3 className="text-body font-semibold">{text.participants}</h3>
      {booking.participants.length === 0 ? (
        <p className="text-body-sm text-muted-foreground">{text.noParticipants}</p>
      ) : (
        <ul className="divide-y divide-border">
          {booking.participants.map((certificate, index) => (
            <CertificateLine
              key={certificate.id}
              label={text.participantNumber(index + 1)}
              certificate={certificate}
              onRevoke={revokeFor(certificate)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function CertificateList({
  booking,
  canRevoke,
  setView,
}: {
  booking: CertificateBooking;
  canRevoke: boolean;
  setView: (view: View) => void;
}) {
  const revokeFor: RevokeFor = (certificate) =>
    canRevoke
      ? () => {
          setView({ step: 'revoke', certificate });
        }
      : null;
  const waive = () => {
    setView({ step: 'waive' });
  };
  return (
    <div className="space-y-4 pb-4">
      {hasHeldCertificates(booking) ? (
        <HoldNotice booking={booking} onWaive={canRevoke ? waive : null} />
      ) : null}
      <section className="space-y-1">
        <h3 className="text-body font-semibold">{text.group}</h3>
        <ul>
          <CertificateLine
            label={bookingTitle(booking)}
            certificate={booking.group}
            onRevoke={revokeFor(booking.group)}
          />
        </ul>
      </section>
      <ParticipantSection booking={booking} revokeFor={revokeFor} />
    </div>
  );
}

function titleOf(view: View, booking: CertificateBooking): string {
  if (view.step === 'waive') return text.waiveTitle;
  if (view.step === 'revoke') return text.revokeTitle(view.certificate.number);
  return bookingTitle(booking);
}

function descriptionOf(view: View): string {
  if (view.step === 'waive') return text.waiveDescription;
  if (view.step === 'revoke') return text.revokeDescription;
  return text.dialogDescription;
}

// Task P4.5.03 (docs/PRD.md FR-ADMIN-07): one booking's certificates in a ResponsiveDialog, each with its number and
// status and the private download; the superadmin also revokes one or waives the unpaid hold, each with a reason. No
// name is shown here (docs/StyleGuide.md §6.10): it is printed only in the PDF.
export function CertificateDialog({ booking, actions, onClose }: CertificateDialogProps) {
  const router = useRouter();
  const [view, setView] = useState<View>({ step: 'list' });
  const done = (message: string) => () => {
    toast.success(message);
    setView({ step: 'list' });
    router.refresh();
  };
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={titleOf(view, booking)}
      description={descriptionOf(view)}
      size="form"
    >
      {view.step === 'list' ? (
        <CertificateList booking={booking} canRevoke={actions !== null} setView={setView} />
      ) : null}
      {view.step === 'waive' && actions ? (
        <div className="pb-4">
          <WaiveForm bookingId={booking.id} action={actions.waive} onDone={done(text.waived)} />
        </div>
      ) : null}
      {view.step === 'revoke' && actions ? (
        <div className="pb-4">
          <RevokeForm
            certificateId={view.certificate.id}
            action={actions.revoke}
            onDone={done(text.revoked)}
          />
        </div>
      ) : null}
    </ResponsiveDialog>
  );
}
