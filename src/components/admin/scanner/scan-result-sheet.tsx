'use client';

import { AlertTriangle, CheckCircle2, Loader2, WifiOff, XCircle } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { CommitForm, TicketCard } from '@/components/admin/scanner/scan-result-details';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { SCAN_RESULT } from '@/config/status';
import type { ScannerController } from '@/hooks/use-scanner';
import { scannerCopy } from '@/lib/copy/scanner';
import { isOverridable, toneOf, type ProblemOutcome, type ScanTone } from '@/lib/scanner/scan-flow';
import { cn } from '@/lib/utils/cn';
import { formatDateTimeShort } from '@/lib/utils/dates';
import type { VerifyTicketResponse } from '@/types/scanner';

const text = scannerCopy;
const LOGIN_PATH = '/login';

const TONE_CLASSES: Record<ScanTone, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  danger: 'bg-danger text-danger-foreground',
};
const TONE_ICONS = { success: CheckCircle2, warning: AlertTriangle, danger: XCircle } as const;

export interface ScanResultProps {
  scanner: ScannerController;
  // The superadmin may override a wrong day or a closed window (FR-SCAN-09); an RW officer is told to ask.
  canOverride: boolean;
  // After the officer closes a result, such as going back to the page that opened the scanner.
  onClosed?: () => void;
}

// The tone header of docs/StyleGuide.md §6.6: the colour, a 48 px icon, the title and the next step, announced at once.
function ToneBanner({ tone, title, line }: { tone: ScanTone; title: string; line: string }) {
  const Icon = TONE_ICONS[tone];
  return (
    <div
      role="alert"
      aria-live="assertive"
      className={cn('flex items-start gap-3 rounded-xl p-4', TONE_CLASSES[tone])}
    >
      <Icon aria-hidden className="size-12 shrink-0" />
      <div className="space-y-1">
        <p className="text-h2">{title}</p>
        <p className="text-body-sm">{line}</p>
      </div>
    </div>
  );
}

function problemLine(outcome: ProblemOutcome): string {
  switch (outcome.kind) {
    case 'offline':
      return text.outcomes.offline;
    case 'timeout':
      return text.outcomes.timeout;
    case 'rate_limited':
      return text.outcomes.rateLimited;
    case 'signed_out':
      return text.outcomes.signedOut;
    case 'unavailable':
      return text.outcomes.unavailable;
    case 'failed':
      return text.outcomes.failed;
  }
}

function ProblemView({
  outcome,
  scanner,
}: {
  outcome: ProblemOutcome;
  scanner: ScannerController;
}) {
  const canRetry = outcome.kind !== 'signed_out' && outcome.kind !== 'unavailable';
  return (
    <div className="space-y-4">
      <div role="alert" aria-live="assertive" className="flex items-start gap-3">
        <WifiOff aria-hidden className="size-8 shrink-0 text-danger" />
        <p className="text-body">{problemLine(outcome)}</p>
      </div>
      {canRetry ? (
        <Button type="button" size="lg" className="w-full" onClick={scanner.retry}>
          {text.retry}
        </Button>
      ) : null}
      {outcome.kind === 'signed_out' ? (
        <Button asChild size="lg" className="w-full">
          <Link href={LOGIN_PATH}>{text.signInAgain}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function resultLine(response: VerifyTicketResponse): string {
  if (response.result === 'ok' && response.mode === 'commit') {
    return text.committed(
      response.ticket?.institutionName ?? text.card.individual,
      response.checkedInPax ?? 0,
    );
  }
  if (response.result === 'already_used' && response.usedAt !== null) {
    return `${text.resultHints.already_used} ${text.usedAt(formatDateTimeShort(response.usedAt), response.usedBy)}`;
  }
  return text.resultHints[response.result];
}

function ResultActions({
  response,
  scanner,
  canOverride,
}: ScanResultProps & { response: VerifyTicketResponse }) {
  const { ticket } = response;
  if (response.mode !== 'preview' || ticket === null) return null;
  if (response.result === 'ok') {
    return (
      <CommitForm
        paxCount={ticket.paxCount}
        needsReason={false}
        isBusy={scanner.isBusy}
        onCommit={scanner.confirm}
      />
    );
  }
  if (!isOverridable(response.result)) return null;
  if (!canOverride)
    return <p className="text-body-sm text-muted-foreground">{text.askSuperadmin}</p>;
  return (
    <CommitForm
      paxCount={ticket.paxCount}
      needsReason
      isBusy={scanner.isBusy}
      onCommit={scanner.confirm}
    />
  );
}

function ResultView({ response, ...props }: ScanResultProps & { response: VerifyTicketResponse }) {
  return (
    <div className="space-y-4">
      <ToneBanner
        tone={toneOf(response.result)}
        title={SCAN_RESULT[response.result].label}
        line={resultLine(response)}
      />
      {response.ticket ? <TicketCard ticket={response.ticket} /> : null}
      <ResultActions response={response} {...props} />
    </div>
  );
}

function CloseButton({ scanner, onClosed }: Pick<ScanResultProps, 'scanner' | 'onClosed'>) {
  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      disabled={scanner.isBusy}
      onClick={() => {
        scanner.close();
        onClosed?.();
      }}
    >
      {text.close}
    </Button>
  );
}

// What a scan led to, for the full-page sheet and inline in the ScannerModal alike.
export function ScanResultBody(props: ScanResultProps) {
  const { state } = props.scanner;
  let body: ReactNode = null;
  if (state.stage === 'checking') {
    body = (
      <p role="status" aria-live="polite" className="flex items-center gap-2 text-body">
        <Loader2 aria-hidden className="size-5 animate-spin" />
        {text.checking}
      </p>
    );
  } else if (state.stage === 'problem') {
    body = <ProblemView outcome={state.outcome} scanner={props.scanner} />;
  } else if (state.stage === 'result') {
    body = <ResultView response={state.response} {...props} />;
  }
  return (
    <div className="space-y-4 pb-4">
      {body}
      {state.stage === 'idle' ? null : (
        <CloseButton scanner={props.scanner} onClosed={props.onClosed} />
      )}
    </div>
  );
}

function sheetTitle(scanner: ScannerController): string {
  const { state } = scanner;
  if (state.stage === 'result') return SCAN_RESULT[state.response.result].label;
  return text.title;
}

// docs/StyleGuide.md §6.6 ScanResultSheet: Drawer below md, Dialog above; scanning waits while it is open. Closing it
// while a request runs is refused, so the officer always sees how the request ended.
export function ScanResultSheet(props: ScanResultProps) {
  const { scanner, onClosed } = props;
  return (
    <ResponsiveDialog
      open={scanner.state.stage !== 'idle'}
      onOpenChange={(open) => {
        if (open || scanner.isBusy) return;
        scanner.close();
        onClosed?.();
      }}
      title={sheetTitle(scanner)}
      size="form"
    >
      <ScanResultBody {...props} />
    </ResponsiveDialog>
  );
}
