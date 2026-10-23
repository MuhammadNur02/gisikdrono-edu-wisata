import { StatusMetaBadge } from '@/components/admin/status/status-badge';
import { AuthCard } from '@/components/auth/auth-card';
import { CERTIFICATE_STATUS, QUOTATION_STATUS } from '@/config/status';
import { copy } from '@/lib/copy/id';
import { formatDateLong } from '@/lib/utils/dates';
import type { VerifiedDocument } from '@/types/documents';

const text = copy.documents.verifyPage;

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:gap-4">
      <dt className="text-body-sm text-muted-foreground">{label}</dt>
      <dd className="text-body font-medium sm:text-right">{value}</dd>
    </div>
  );
}

function rowsOf(document: VerifiedDocument): { label: string; value: string }[] {
  const institution = { label: text.institution, value: document.institutionName ?? '—' };
  if (document.kind === 'quotation') {
    return [
      { label: text.number, value: document.number },
      institution,
      { label: text.validUntil, value: formatDateLong(document.validUntil) },
    ];
  }
  return [
    { label: text.number, value: document.number },
    { label: text.recipient, value: document.recipientName },
    institution,
    { label: text.visitDate, value: formatDateLong(document.visitDate) },
  ];
}

// docs/PRD.md FR-PUB-20 (Task P3.6.05): the document's own facts and its status, never the PDF.
export function VerifiedDocumentCard({ document }: { document: VerifiedDocument }) {
  const isQuotation = document.kind === 'quotation';
  const meta = isQuotation
    ? QUOTATION_STATUS[document.status]
    : CERTIFICATE_STATUS[document.status];
  const isCurrent = document.status === 'issued';
  return (
    <AuthCard title={text.title} description={text.description}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-overline text-primary-text">
          {isQuotation ? text.quotation : text.certificate}
          {isQuotation ? ` · ${text.version(document.version)}` : ''}
        </p>
        <StatusMetaBadge meta={meta} />
      </div>
      <dl className="space-y-3 border-t border-border pt-4">
        {rowsOf(document).map((row) => (
          <Row key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
      <p className="text-body-sm text-muted-foreground">
        {isCurrent ? text.genuine : text.noLongerValid}
      </p>
    </AuthCard>
  );
}
