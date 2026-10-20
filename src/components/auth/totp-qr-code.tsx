import { copy } from '@/lib/copy/id';
import type { TotpEnrolment } from '@/types/auth';

// The four light modules around a QR code that scanners need to find it (ISO/IEC 18004 quiet zone).
const QUIET_ZONE_MODULES = 4;

// The enrolment QR code as plain SVG from the path qrSvgPath drew on the server: dark modules on the light card, at a
// size a phone camera reads from a laptop screen.
export function TotpQrCode({ qr }: { qr: TotpEnrolment['qr'] }) {
  // The quiet zone runs on both sides.
  const extent = QUIET_ZONE_MODULES + qr.size + QUIET_ZONE_MODULES;
  return (
    <svg
      role="img"
      aria-label={copy.auth.mfa.qrLabel}
      viewBox={`-${String(QUIET_ZONE_MODULES)} -${String(QUIET_ZONE_MODULES)} ${String(extent)} ${String(extent)}`}
      shapeRendering="crispEdges"
      className="mx-auto size-56 rounded-xl border border-border bg-background"
    >
      <path d={qr.path} className="fill-foreground" />
    </svg>
  );
}
