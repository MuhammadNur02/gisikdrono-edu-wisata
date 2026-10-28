import { Award, Users } from 'lucide-react';

import { CertificateDownloadLink } from '@/components/certificates/certificate-download-link';
import {
  CertificatePhoneStepUp,
  type ProveCertificatePhoneAction,
} from '@/components/certificates/certificate-phone-step-up';
import { FormAlert } from '@/components/forms/form-alert';
import { certificatesCopy } from '@/lib/copy/certificates';
import { certificateDownloadPath, parseCertificateSlot } from '@/lib/utils/certificate-slots';
import type { GuestCertificate, GuestCertificateView } from '@/types/certificate';

const text = certificatesCopy.guest;
// "Unduh semua" is offered once a class has more than one participant certificate.
const MIN_PARTICIPANTS_FOR_ALL = 2;

interface ListProps {
  bookingCode: string;
  prove: ProveCertificatePhoneAction;
}

type ReadyView = Extract<GuestCertificateView, { state: 'ready' }>;

const NOTICE_OF = { expired: text.expired, pending: text.pending, held: text.held } as const;

function downloadHref(bookingCode: string, slot: string): string | null {
  const parsed = parseCertificateSlot(slot);
  return parsed === null ? null : certificateDownloadPath(bookingCode, parsed);
}

function CertificateRow({
  certificate,
  canDownload,
  bookingCode,
}: {
  certificate: GuestCertificate;
  canDownload: boolean;
  bookingCode: string;
}) {
  const Icon = certificate.kind === 'group' ? Award : Users;
  const href = canDownload ? downloadHref(bookingCode, certificate.slot) : null;
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
      {href && (
        <CertificateDownloadLink href={href} label={text.downloadLabel(certificate.number)}>
          {text.download}
        </CertificateDownloadLink>
      )}
    </li>
  );
}

function CertificateGroup({
  title,
  certificates,
  hasPhoneProof,
  bookingCode,
  allHref,
}: {
  title: string;
  certificates: GuestCertificate[];
  hasPhoneProof: boolean;
  bookingCode: string;
  allHref?: string | undefined;
}) {
  if (certificates.length === 0) return null;
  return (
    <section className="space-y-1 rounded-2xl border border-border bg-card px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-label font-semibold">{title}</h2>
        {allHref && (
          <CertificateDownloadLink href={allHref} label={text.downloadAllLabel}>
            {text.downloadAll}
          </CertificateDownloadLink>
        )}
      </div>
      <ul className="divide-y divide-border">
        {certificates.map((certificate) => (
          <CertificateRow
            key={certificate.id}
            certificate={certificate}
            canDownload={!certificate.needsPhone || hasPhoneProof}
            bookingCode={bookingCode}
          />
        ))}
      </ul>
    </section>
  );
}

function PhoneNotice({ view, prove, bookingCode }: ListProps & { view: ReadyView }) {
  if (view.phoneStepUp === 'unverified') return <FormAlert tone="info">{text.unverified}</FormAlert>;
  if (view.hasPhoneProof || !view.certificates.some((certificate) => certificate.needsPhone)) {
    return null;
  }
  if (view.phoneStepUp === 'blocked') return <FormAlert tone="info">{text.blocked}</FormAlert>;
  return <CertificatePhoneStepUp bookingCode={bookingCode} action={prove} />;
}

// docs/PRD.md FR-POST-02 (Task P4.5.03): what the certificate link shows. The group certificate of an institution opens
// at once; a certificate that prints a person's name waits for the last-4 step-up, none is offered for a booking whose
// number no WhatsApp code proved, and none once ten wrong tries blocked the step-up (review of PR #94, L1).
export function GuestCertificateList({
  view,
  ...props
}: ListProps & { view: GuestCertificateView }) {
  if (view.state !== 'ready') return <FormAlert tone="info">{NOTICE_OF[view.state]}</FormAlert>;
  const group = view.certificates.filter((certificate) => certificate.kind === 'group');
  const participants = view.certificates.filter(
    (certificate) => certificate.kind === 'participant',
  );
  const canDownloadAll = view.hasPhoneProof && participants.length >= MIN_PARTICIPANTS_FOR_ALL;
  const shared = { hasPhoneProof: view.hasPhoneProof, bookingCode: props.bookingCode };
  return (
    <div className="space-y-6">
      <CertificateGroup title={text.group} certificates={group} {...shared} />
      <PhoneNotice view={view} {...props} />
      <CertificateGroup
        title={text.participants}
        certificates={participants}
        allHref={
          canDownloadAll
            ? certificateDownloadPath(props.bookingCode, { kind: 'all_participants' })
            : undefined
        }
        {...shared}
      />
    </div>
  );
}
