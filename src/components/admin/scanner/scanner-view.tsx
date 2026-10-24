'use client';

import type { IScannerError, ScannerErrorKind } from '@yudiel/react-qr-scanner';
import { Camera, CameraOff, ScanLine } from 'lucide-react';
import dynamic from 'next/dynamic';
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { ManualCheckInForm } from '@/components/admin/scanner/manual-checkin-form';
import { RecentScans } from '@/components/admin/scanner/recent-scans';
import { ScanResultSheet } from '@/components/admin/scanner/scan-result-sheet';
import { ScanTabs } from '@/components/admin/scanner/scan-tabs';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useBoundaryNavigation } from '@/hooks/use-boundary-navigation';
import { useScanner } from '@/hooks/use-scanner';
import { scannerCopy } from '@/lib/copy/scanner';
import type { ActionResult } from '@/types/action-result';

const text = scannerCopy;

// The reader and its ZXing fallback load on the first `Nyalakan kamera`, outside the page's first load.
const CameraStream = dynamic(
  () => import('@/components/admin/scanner/camera-stream').then((module) => module.CameraStream),
  { ssr: false, loading: () => <Skeleton className="size-full" /> },
);

export interface ScannerViewProps {
  canOverride: boolean;
  // `?return=` of a scanner opened from another dashboard page, already checked by safeRedirect.
  returnTo: string | null;
  logOpenedAction: (input: unknown) => Promise<ActionResult<null>>;
}

function cameraErrorLine(kind: ScannerErrorKind): string {
  switch (kind) {
    case 'permission-denied':
    case 'no-camera':
    case 'in-use':
    case 'insecure-context':
      return text.cameraErrors[kind];
    // In-app browsers (WhatsApp, Instagram) refuse getUserMedia outright (FR-SCAN-02).
    case 'unsupported':
    case 'security':
      return text.cameraErrors.inAppBrowser;
    default:
      return text.cameraErrors.other;
  }
}

function useCamera(onDecoded: (raw: string) => boolean) {
  const [isOn, setIsOn] = useState(false);
  const [isArmed, setIsArmed] = useState(false);
  const [error, setError] = useState<ScannerErrorKind | null>(null);
  const turn = useCallback((on: boolean) => {
    if (on) setError(null);
    setIsOn(on);
    setIsArmed(false);
  }, []);
  const onError = useCallback(
    (failure: IScannerError) => {
      setError(failure.kind);
      turn(false);
    },
    [turn],
  );
  // A read that was taken keeps the camera paused until the next tap; one that was ignored keeps it looking.
  const onDecode = useCallback(
    (raw: string) => {
      if (onDecoded(raw)) setIsArmed(false);
    },
    [onDecoded],
  );
  const arm = () => {
    setIsArmed(true);
  };
  return { isOn, isArmed, error, turn, arm, onError, onDecode };
}

type CameraControls = ReturnType<typeof useCamera>;

function CameraFrame({ camera }: { camera: CameraControls }) {
  return (
    <div
      aria-label={text.cameraLabel}
      role="region"
      className="relative aspect-3/4 w-full overflow-hidden rounded-2xl bg-muted md:aspect-video"
    >
      {camera.isOn ? (
        <CameraStream
          isArmed={camera.isArmed}
          onDecode={camera.onDecode}
          onError={camera.onError}
        />
      ) : (
        <div className="flex size-full flex-col items-center justify-center gap-4 p-6 text-center">
          <CameraOff aria-hidden className="size-10 text-muted-foreground" />
          <p className="text-body-sm text-muted-foreground">{text.cameraIdle}</p>
          <Button
            type="button"
            size="lg"
            onClick={() => {
              camera.turn(true);
            }}
          >
            <Camera aria-hidden />
            {text.startCamera}
          </Button>
        </div>
      )}
    </div>
  );
}

function CameraButtons({ camera, canScan }: { camera: CameraControls; canScan: boolean }) {
  if (!camera.isOn) return null;
  return (
    <div className="flex gap-2">
      <Button
        type="button"
        size="xl"
        className="flex-1"
        disabled={!canScan || camera.isArmed}
        onClick={camera.arm}
      >
        <ScanLine aria-hidden />
        {camera.isArmed ? text.scanning : text.scan}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="xl"
        onClick={() => {
          camera.turn(false);
        }}
      >
        {text.stopCamera}
      </Button>
    </div>
  );
}

function CameraPanel({ camera, canScan }: { camera: CameraControls; canScan: boolean }) {
  return (
    <div className="space-y-3">
      <CameraFrame camera={camera} />
      {camera.error ? <FormAlert tone="danger">{cameraErrorLine(camera.error)}</FormAlert> : null}
      <p aria-live="polite" className="sr-only">
        {camera.isArmed ? text.scanning : ''}
      </p>
      <CameraButtons camera={camera} canScan={canScan} />
    </div>
  );
}

// One tap, one read: a payload that is no ticket is told at once and needs a new tap; a repeat keeps looking.
function useLiveScanner() {
  const scanner = useScanner();
  const { submitPayload } = scanner;
  const onDecoded = useCallback(
    (raw: string) => {
      const verdict = submitPayload(raw);
      if (verdict === 'not_a_ticket') toast.error(text.notATicket);
      return verdict === 'sent' || verdict === 'not_a_ticket';
    },
    [submitPayload],
  );
  return { scanner, camera: useCamera(onDecoded) };
}

// docs/StyleGuide.md §6.6 ScannerView: the full-screen gate scanner, the PWA's start page and the only page with a live
// camera. One tap on `Scan` reads one QR; the result sheet asks the officer to confirm before anything is checked in.
export function ScannerView({ canOverride, returnTo, logOpenedAction }: ScannerViewProps) {
  const navigate = useBoundaryNavigation();
  const { scanner, camera } = useLiveScanner();

  // Every opening of the scanner is audited (rpc_log_ui_event 'scanner_opened', Task P4.4.05).
  useEffect(() => {
    void logOpenedAction({});
  }, [logOpenedAction]);

  return (
    <div className="mx-auto w-full max-w-2xl space-y-6">
      <ScanTabs
        camera={<CameraPanel camera={camera} canScan={scanner.state.stage === 'idle'} />}
        manual={<ManualCheckInForm isBusy={scanner.isBusy} onSubmit={scanner.submitManual} />}
      />
      <RecentScans scans={scanner.recent} />
      <ScanResultSheet
        scanner={scanner}
        canOverride={canOverride}
        onClosed={
          returnTo
            ? () => {
                navigate(returnTo);
              }
            : undefined
        }
      />
    </div>
  );
}
