'use client';

import { Camera, Maximize2 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useId, useState, type ChangeEvent } from 'react';

import { ManualCheckInForm } from '@/components/admin/scanner/manual-checkin-form';
import { ScanResultBody } from '@/components/admin/scanner/scan-result-sheet';
import { ScanTabs } from '@/components/admin/scanner/scan-tabs';
import { FormAlert } from '@/components/forms/form-alert';
import { Button } from '@/components/ui/button';
import { ResponsiveDialog } from '@/components/ui/responsive-dialog';
import { SCANNER_PATH } from '@/config/dashboard';
import { useScanner, type PayloadVerdict } from '@/hooks/use-scanner';
import { scannerCopy } from '@/lib/copy/scanner';

const text = scannerCopy;
const RETURN_PARAM = 'return';

// The browser's own BarcodeDetector (Android Chrome), typed here as far as the modal uses it. The ZXing fallback is
// not loaded outside /dashboard/scanner, where alone the CSP allows WebAssembly, so a device without the native
// detector is sent to the full scanner (docs/StyleGuide.md §6.6, Task P4.4.03).
interface NativeBarcodeDetector {
  detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]>;
}
type NativeBarcodeDetectorClass = new (options: { formats: string[] }) => NativeBarcodeDetector;

function isDetectorClass(value: unknown): value is NativeBarcodeDetectorClass {
  return typeof value === 'function';
}

function nativeDetector(): NativeBarcodeDetector | null {
  const candidate: unknown = Reflect.get(globalThis, 'BarcodeDetector');
  return isDetectorClass(candidate) ? new candidate({ formats: ['qr_code'] }) : null;
}

type PhotoProblem = 'unsupported' | 'unreadable' | 'not_a_ticket' | null;

async function readPhoto(file: File): Promise<string | null> {
  const detector = nativeDetector();
  if (detector === null) throw new Error('unsupported');
  const bitmap = await createImageBitmap(file);
  try {
    const codes = await detector.detect(bitmap);
    return codes[0]?.rawValue ?? null;
  } finally {
    bitmap.close();
  }
}

// The native camera app takes the photo, so the page itself never opens a stream (camera=() here).
function PhotoPicker({
  onPhoto,
}: {
  onPhoto: (event: ChangeEvent<HTMLInputElement>) => Promise<void>;
}) {
  const inputId = useId();
  return (
    <>
      <input
        id={inputId}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(event) => void onPhoto(event)}
      />
      <Button asChild size="xl" className="w-full">
        <label htmlFor={inputId} className="cursor-pointer">
          <Camera aria-hidden />
          {text.modal.takePhoto}
        </label>
      </Button>
    </>
  );
}

function PhotoTab({ submit }: { submit: (raw: string) => PayloadVerdict }) {
  const [problem, setProblem] = useState<PhotoProblem>(() =>
    nativeDetector() === null ? 'unsupported' : null,
  );
  const onPhoto = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    const raw = await readPhoto(file).catch(() => null);
    if (raw === null) {
      setProblem('unreadable');
      return;
    }
    setProblem(submit(raw) === 'not_a_ticket' ? 'not_a_ticket' : null);
  };
  if (problem === 'unsupported')
    return <FormAlert tone="info">{text.modal.photoUnsupported}</FormAlert>;
  return (
    <div className="space-y-3">
      <PhotoPicker onPhoto={onPhoto} />
      {problem === 'unreadable' ? (
        <FormAlert tone="danger">{text.modal.noQrInPhoto}</FormAlert>
      ) : null}
      {problem === 'not_a_ticket' ? <FormAlert tone="danger">{text.notATicket}</FormAlert> : null}
    </div>
  );
}

export interface ScannerModalProps {
  canOverride: boolean;
  onClose: () => void;
}

// docs/StyleGuide.md §6.6 ScannerModal: scanning from any dashboard page without leaving it, one photo per ticket or
// the manual code; the result shows in place, and `Buka scanner penuh` opens the live camera and comes back here.
export function ScannerModal({ canOverride, onClose }: ScannerModalProps) {
  const pathname = usePathname();
  const scanner = useScanner();
  const fullScanner = `${SCANNER_PATH}?${RETURN_PARAM}=${encodeURIComponent(pathname)}`;
  return (
    <ResponsiveDialog
      open
      onOpenChange={(open) => {
        if (!open && !scanner.isBusy) onClose();
      }}
      title={text.modal.title}
      description={text.modal.description}
      size="form"
    >
      <div className="space-y-4 pb-4">
        <Button asChild variant="outline" className="min-h-11 w-full">
          <Link href={fullScanner}>
            <Maximize2 aria-hidden />
            {text.modal.openFullScanner}
          </Link>
        </Button>
        {scanner.state.stage === 'idle' ? (
          <ScanTabs
            camera={<PhotoTab submit={scanner.submitPayload} />}
            manual={<ManualCheckInForm isBusy={scanner.isBusy} onSubmit={scanner.submitManual} />}
          />
        ) : (
          <ScanResultBody scanner={scanner} canOverride={canOverride} />
        )}
      </div>
    </ResponsiveDialog>
  );
}
