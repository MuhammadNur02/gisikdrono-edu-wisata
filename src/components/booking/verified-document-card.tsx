import { BadgeCheck, ShieldAlert } from 'lucide-react';

import { StatusBadge } from '@/components/admin/status/status-badge';
import { copy } from '@/lib/copy/id';
import { cn } from '@/lib/utils/cn';
import { formatDateLong } from '@/lib/utils/dates';
import type { VerifiedDocument } from '@/types/documents';

const text = copy.documents.verifyPage;
const TITLE_ID = 'verifikasi-judul';

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
      <dt className="text-meta-caps text-muted-foreground">{label}</dt>
      <dd className="text-body font-semibold sm:text-right">{value}</dd>
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

// The seal at the top: a check in the success tint while the document holds, a shield in the danger tint once not.
function Seal({ isCurrent }: { isCurrent: boolean }) {
  const Icon = isCurrent ? BadgeCheck : ShieldAlert;
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-14 items-center justify-center rounded-full',
        isCurrent ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
      )}
    >
      <Icon className="size-7" strokeWidth={1.75} />
    </span>
  );
}

// docs/PRD.md FR-PUB-20 (Task P3.6.05), in the panel of the redesign (the surface, radius 20, the panel shadow): the
// document's own facts and its status, never the PDF.
export function VerifiedDocumentCard({ document }: { document: VerifiedDocument }) {
  const isQuotation = document.kind === 'quotation';
  const isCurrent = document.status === 'issued';
  return (
    <section
      aria-labelledby={TITLE_ID}
      className="space-y-6 rounded-2xl border border-border bg-card p-6 shadow-panel md:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <Seal isCurrent={isCurrent} />
        {document.kind === 'quotation' ? (
          <StatusBadge kind="quotation_status" value={document.status} />
        ) : (
          <StatusBadge kind="certificate_status" value={document.status} />
        )}
      </div>
      <header className="space-y-2">
        <p className="text-eyebrow text-primary-ink">
          {isQuotation ? `${text.quotation} · ${text.version(document.version)}` : text.certificate}
        </p>
        <h1 id={TITLE_ID} className="text-h2 text-balance">
          {text.title}
        </h1>
        <p className="text-body-sm text-pretty text-muted-foreground">{text.description}</p>
      </header>
      <dl className="divide-y divide-border border-y border-border">
        {rowsOf(document).map((row) => (
          <Row key={row.label} label={row.label} value={row.value} />
        ))}
      </dl>
      <p className={cn('text-body-sm font-medium', isCurrent ? 'text-success' : 'text-danger')}>
        {isCurrent ? text.genuine : text.noLongerValid}
      </p>
    </section>
  );
}
