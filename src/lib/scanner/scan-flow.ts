import { RECENT_SCANS_LIMIT } from '@/config/scanner';
import { SCAN_RESULT } from '@/config/status';
import type {
  ManualCheckInRequest,
  ScanMode,
  ScanResult,
  VerifyOutcome,
  VerifyTicketRequest,
  VerifyTicketResponse,
} from '@/types/scanner';

// docs/StyleGuide.md §6.6, the scanner's state diagram, as a pure reducer: Idle → Checking (preview) → a result, then
// for a green one Checking (commit) → Done. A request that got no answer stays in `problem` with its attemptId, so
// `Coba lagi` sends the very same attempt and a late answer can never check a group in twice (FR-SCAN-06).

export type ScanSource =
  { kind: 'qr'; token: string } | { kind: 'manual'; bookingCode: string; phoneLastDigits: string };

export interface ScanAttempt {
  source: ScanSource;
  attemptId: string;
  mode: ScanMode;
  attendeeCount?: number;
  overrideReason?: string;
}

export type ProblemOutcome = Exclude<VerifyOutcome, { kind: 'answered' }>;

export type ScanState =
  | { stage: 'idle' }
  | { stage: 'checking'; attempt: ScanAttempt }
  | { stage: 'result'; attempt: ScanAttempt; response: VerifyTicketResponse }
  | { stage: 'problem'; attempt: ScanAttempt; outcome: ProblemOutcome };

export type ScanEvent =
  | { type: 'sent'; attempt: ScanAttempt }
  | { type: 'finished'; attempt: ScanAttempt; outcome: VerifyOutcome }
  | { type: 'closed' };

export const IDLE: ScanState = { stage: 'idle' };

export function scanReducer(state: ScanState, event: ScanEvent): ScanState {
  switch (event.type) {
    case 'sent':
      return { stage: 'checking', attempt: event.attempt };
    case 'finished':
      // An answer to an attempt the officer already left behind changes nothing on screen.
      if (state.stage !== 'checking' || state.attempt.attemptId !== event.attempt.attemptId) {
        return state;
      }
      return event.outcome.kind === 'answered'
        ? { stage: 'result', attempt: event.attempt, response: event.outcome.response }
        : { stage: 'problem', attempt: event.attempt, outcome: event.outcome };
    case 'closed':
      return IDLE;
  }
}

// The body POST /api/tickets/verify takes for an attempt (src/types/scanner.ts).
export function requestOf(attempt: ScanAttempt): VerifyTicketRequest | ManualCheckInRequest {
  const extras = {
    ...(attempt.attendeeCount === undefined ? {} : { attendeeCount: attempt.attendeeCount }),
    ...(attempt.overrideReason === undefined ? {} : { overrideReason: attempt.overrideReason }),
  };
  const base = { attemptId: attempt.attemptId, mode: attempt.mode, ...extras };
  return attempt.source.kind === 'qr'
    ? { token: attempt.source.token, ...base }
    : {
        bookingCode: attempt.source.bookingCode,
        phoneLastDigits: attempt.source.phoneLastDigits,
        ...base,
      };
}

// The green preview's commit: the same ticket and attempt, now with the count the officer confirmed.
export function commitOf(
  preview: ScanAttempt,
  attendeeCount: number,
  overrideReason?: string,
): ScanAttempt {
  return {
    source: preview.source,
    attemptId: preview.attemptId,
    mode: 'commit',
    attendeeCount,
    ...(overrideReason === undefined ? {} : { overrideReason }),
  };
}

export type ScanTone = 'success' | 'warning' | 'danger';

// FR-SCAN-05: green ok, amber already_used / outside_window / wrong_date, red everything else (src/config/status.ts).
export function toneOf(result: ScanResult): ScanTone {
  const { tone } = SCAN_RESULT[result];
  return tone === 'success' || tone === 'warning' ? tone : 'danger';
}

// docs/StyleGuide.md §6.6: a superadmin may override a wrong day or a closed window, with a reason (FR-SCAN-09).
export function isOverridable(result: ScanResult): boolean {
  return result === 'outside_window' || result === 'wrong_date';
}

export interface RecentScan {
  attemptId: string;
  result: ScanResult;
  mode: ScanMode;
  institutionName: string | null;
  // ISO time the answer came.
  at: string;
}

// The list under the camera: the newest answer first, one row per attempt (a commit replaces its preview).
export function withRecentScan(
  recent: readonly RecentScan[],
  response: VerifyTicketResponse,
  at: string,
): RecentScan[] {
  const entry: RecentScan = {
    attemptId: response.attemptId,
    result: response.result,
    mode: response.mode,
    institutionName: response.ticket?.institutionName ?? null,
    at,
  };
  const others = recent.filter((scan) => scan.attemptId !== response.attemptId);
  return [entry, ...others].slice(0, RECENT_SCANS_LIMIT);
}
