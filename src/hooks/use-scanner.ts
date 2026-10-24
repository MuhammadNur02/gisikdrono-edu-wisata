'use client';

import { useCallback, useReducer, useRef, useState } from 'react';

import { DUPLICATE_PAYLOAD_WINDOW_MS, VIBRATION_PATTERNS } from '@/config/scanner';
import { isRepeatedPayload, ticketTokenOf } from '@/lib/scanner/payload';
import {
  IDLE,
  commitOf,
  requestOf,
  scanReducer,
  toneOf,
  withRecentScan,
  type RecentScan,
  type ScanAttempt,
  type ScanSource,
  type ScanState,
} from '@/lib/scanner/scan-flow';
import { sendScan } from '@/lib/scanner/verify-client';
import type { VerifyOutcome } from '@/types/scanner';

// docs/StyleGuide.md §6.6 and docs/PRD.md FR-SCAN-03..07: one scan per tap. A payload is checked for the ticket
// grammar first (no request for anything else), the same payload within 3 s is ignored, every scan gets its own
// attemptId, and `Coba lagi` and the commit reuse it. ScannerView and ScannerModal share this hook.

export type PayloadVerdict = 'sent' | 'not_a_ticket' | 'repeated' | 'busy';

function vibrate(outcome: VerifyOutcome): void {
  if (outcome.kind !== 'answered' || typeof navigator.vibrate !== 'function') return;
  navigator.vibrate(VIBRATION_PATTERNS[toneOf(outcome.response.result)]);
}

function previewOf(source: ScanSource): ScanAttempt {
  return { source, attemptId: crypto.randomUUID(), mode: 'preview' };
}

// Sends an attempt and records how it ended: the reducer's stage, the recent list and the vibration.
function useAttemptRunner() {
  const [state, dispatch] = useReducer(scanReducer, IDLE);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const run = useCallback(async (attempt: ScanAttempt) => {
    dispatch({ type: 'sent', attempt });
    const outcome = await sendScan(requestOf(attempt));
    if (outcome.kind === 'answered') {
      setRecent((scans) => withRecentScan(scans, outcome.response, new Date().toISOString()));
    }
    vibrate(outcome);
    dispatch({ type: 'finished', attempt, outcome });
  }, []);
  return { state, dispatch, recent, run };
}

// A decoded QR: ignored while a scan is open or when it is the last payload again within 3 s, told apart from any QR
// that is no ticket, and only then sent as a new preview.
function usePayloadGate(run: (attempt: ScanAttempt) => Promise<void>, stage: ScanState['stage']) {
  const lastPayload = useRef<{ payload: string; at: number } | null>(null);
  return useCallback(
    (raw: string): PayloadVerdict => {
      if (stage !== 'idle') return 'busy';
      const now = Date.now();
      if (isRepeatedPayload(raw, lastPayload.current, now, DUPLICATE_PAYLOAD_WINDOW_MS)) {
        return 'repeated';
      }
      lastPayload.current = { payload: raw, at: now };
      const token = ticketTokenOf(raw);
      if (token === null) return 'not_a_ticket';
      void run(previewOf({ kind: 'qr', token }));
      return 'sent';
    },
    [run, stage],
  );
}

export function useScanner() {
  const { state, dispatch, recent, run } = useAttemptRunner();
  const submitPayload = usePayloadGate(run, state.stage);
  const submitManual = useCallback(
    (bookingCode: string, phoneLastDigits: string) => {
      void run(previewOf({ kind: 'manual', bookingCode, phoneLastDigits }));
    },
    [run],
  );
  const confirm = useCallback(
    (attendeeCount: number, overrideReason?: string) => {
      if (state.stage === 'result')
        void run(commitOf(state.attempt, attendeeCount, overrideReason));
    },
    [run, state],
  );
  const retry = useCallback(() => {
    if (state.stage === 'problem') void run(state.attempt);
  }, [run, state]);
  const close = useCallback(() => {
    dispatch({ type: 'closed' });
  }, [dispatch]);
  const isBusy = state.stage === 'checking';
  return { state, recent, isBusy, submitPayload, submitManual, confirm, retry, close };
}

export type ScannerController = ReturnType<typeof useScanner>;
