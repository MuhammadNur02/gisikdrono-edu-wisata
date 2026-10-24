'use client';

import {
  prepareZXingModule,
  Scanner,
  type IDetectedBarcode,
  type IScannerError,
  type IScannerHandle,
} from '@yudiel/react-qr-scanner';
import { Flashlight, FlashlightOff } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type RefObject } from 'react';

import { Button } from '@/components/ui/button';
import { ZXING_WASM_PATH } from '@/config/scanner';
import { scannerCopy } from '@/lib/copy/scanner';

// The live camera of /dashboard/scanner (docs/StyleGuide.md §6.6), loaded with next/dynamic and ssr: false so neither
// the reader nor its ZXing fallback reach any other page. The ponyfill finds its WASM on this site
// (src/config/scanner.ts); this runs before the first frame is read, so no request ever goes to jsDelivr.
prepareZXingModule({
  overrides: {
    locateFile: (path: string, prefix: string) =>
      path.endsWith('.wasm') ? ZXING_WASM_PATH : `${prefix}${path}`,
  },
});

const text = scannerCopy;
const QR_ONLY = ['qr_code' as const];
const REAR_CAMERA: MediaTrackConstraints = { facingMode: 'environment' };
// The pause between two reads of the live frames while the officer has asked for a scan.
const RETRY_DELAY_MS = 150;
// The Scanner tells nobody when its stream is up, so the torch looks for the track until it is there.
const TRACK_POLL_MS = 500;
// The library's finder frame only; the torch is this file's own 44 px button.
const SCANNER_PARTS = { finder: true, torch: false, onOff: false, zoom: false };
const SCANNER_CLASSES = { container: 'size-full', video: 'size-full object-cover' };

export interface CameraStreamProps {
  // True from the officer's tap on `Scan` until a code is read: one tap, one scan (FR-SCAN-06).
  isArmed: boolean;
  onDecode: (rawValue: string) => void;
  onError: (error: IScannerError) => void;
}

function videoTrackOf(handle: IScannerHandle | null): MediaStreamTrack | null {
  return handle?.getStream()?.getVideoTracks()[0] ?? null;
}

// The torch toggle, shown only when the rear camera's track can light one (FR-SCAN-02).
function useTorch(scanner: RefObject<IScannerHandle | null>) {
  const [isSupported, setIsSupported] = useState(false);
  const [isOn, setIsOn] = useState(false);
  useEffect(() => {
    const timer = setInterval(() => {
      const track = videoTrackOf(scanner.current);
      if (track === null) return;
      setIsSupported(track.getCapabilities().torch === true);
      clearInterval(timer);
    }, TRACK_POLL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [scanner]);
  const toggle = useCallback(async () => {
    const track = videoTrackOf(scanner.current);
    if (track === null) return;
    const next = !isOn;
    await track.applyConstraints({ advanced: [{ torch: next }] }).catch(() => undefined);
    setIsOn(track.getSettings().torch === true);
  }, [isOn, scanner]);
  return { isSupported, isOn, toggle };
}

function TorchButton({ torch }: { torch: ReturnType<typeof useTorch> }) {
  if (!torch.isSupported) return null;
  return (
    <Button
      type="button"
      variant="secondary"
      size="icon"
      className="absolute top-3 right-3 size-11"
      aria-pressed={torch.isOn}
      aria-label={torch.isOn ? text.torchOff : text.torchOn}
      onClick={() => void torch.toggle()}
    >
      {torch.isOn ? <FlashlightOff aria-hidden /> : <Flashlight aria-hidden />}
    </Button>
  );
}

export function CameraStream({ isArmed, onDecode, onError }: CameraStreamProps) {
  const scanner = useRef<IScannerHandle>(null);
  const torch = useTorch(scanner);
  const handleScan = useCallback(
    (codes: IDetectedBarcode[]) => {
      const first = codes[0];
      if (isArmed && first) onDecode(first.rawValue);
    },
    [isArmed, onDecode],
  );
  return (
    <div className="relative size-full">
      <Scanner
        ref={scanner}
        onScan={handleScan}
        onError={onError}
        constraints={REAR_CAMERA}
        formats={QR_ONLY}
        paused={!isArmed}
        allowMultiple
        retryDelay={RETRY_DELAY_MS}
        sound={false}
        components={SCANNER_PARTS}
        classNames={SCANNER_CLASSES}
      />
      <TorchButton torch={torch} />
    </div>
  );
}
