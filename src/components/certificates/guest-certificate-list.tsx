import { Award, Users } from 'lucide-react';

import {
  CertificateDownloadButton,
  type CertificateDownloadAction,
} from '@/components/certificates/certificate-download-button';
import {
  CertificatePhoneStepUp,
  type ProveCertificatePhoneAction,
} from '@/components/certificates/certificate-phone-step-up';
import { FormAlert } from '@/components/forms/form-alert';
import { certificatesCopy } from '@/lib/copy/certificates';
import type { GuestCertificate, GuestCertificateView } from '@/types/certificate';

const text = certificatesCopy.guest;

export interface GuestCertificateActions {
  download: CertificateDownloadAction;
  prove: ProveCertificatePhoneAction;
}

interface ListProps {
  bookingCode: string;
  actions: GuestCertificateActions;
}

const NOTICE_OF = { expired: text.expired, pending: text.pending, held: text.held } as const;

function CertificateRow({
  certificate,
  canDownload,
  bookingCode,
  actions,
}: ListProps & { certificate: GuestCertificate; canDownload: boolean }) {
  const Icon = certificate.kind === 'group' ? Award : Users;
  return (
    <li className="flex items-center gap-3 py-3">
      <Icon aria-hidden className="size-5 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-body-sm font-semibold">
          {certificate.recipient ?? text.hiddenName}
        </p>
        <p className="text-caption text-muted-foreground">
          {text.participantNumber(certificate.number)}
        </p>
      </div>
      {canDownload && (
        <CertificateDownloadButton
          bookingCode={bookingCode}
          certificateId={certificate.id}
          number={certificate.number}
          action={actions.download}
        />
      )}
    </li>
  );
}

function CertificateGroup({
  title,
  certificates,
  hasPhoneProof,
  ...props
}: ListProps & { title: string; certificates: GuestCertificate[]; hasPhoneProof: boolean }) {
  if (certificates.length === 0) return null;
  return (
    <section className="space-y-1 rounded-2xl border border-border bg-card px-5 py-4">
      <h2 className="text-label font-semibold">{title}</h2>
      <ul className="divide-y divide-border">
        {certificates.map((certificate) => (
          <CertificateRow
            key={certificate.id}
            certificate={certificate}
            canDownload={!certificate.needsPhone || hasPhoneProof}
            {...props}
          />
        ))}
      </ul>
    </section>
  );
}

// docs/PRD.md FR-POST-02 (Task P4.5.03): what the certificate link shows. The group certificate of an institution opens
// at once; a certificate that prints a person's name waits for the last-4 step-up, and none is offered for a booking
// whose number no WhatsApp code proved.
export function GuestCertificateList({
  view,
  ...props
}: ListProps & { view: GuestCertificateView }) {
  if (view.state !== 'ready') return <FormAlert tone="info">{NOTICE_OF[view.state]}</FormAlert>;
  const group = view.certificates.filter((certificate) => certificate.kind === 'group');
  const participants = view.certificates.filter(
    (certificate) => certificate.kind === 'participant',
  );
  const needsStepUp =
    view.certificates.some((certificate) => certificate.needsPhone) && !view.hasPhoneProof;
  return (
    <div className="space-y-6">
      {!view.canProvePhone && <FormAlert tone="info">{text.unverified}</FormAlert>}
      <CertificateGroup
        title={text.group}
        certificates={group}
        hasPhoneProof={view.hasPhoneProof}
        {...props}
      />
      {needsStepUp && (
        <CertificatePhoneStepUp bookingCode={props.bookingCode} action={props.actions.prove} />
      )}
      <CertificateGroup
        title={text.participants}
        certificates={participants}
        hasPhoneProof={view.hasPhoneProof}
        {...props}
      />
    </div>
  );
}
