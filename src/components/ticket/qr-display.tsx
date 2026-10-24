import { cn } from '@/lib/utils/cn';

// The four light modules around a QR code that scanners need to find it (ISO/IEC 18004 quiet zone).
const QUIET_ZONE_MODULES = 4;

// docs/StyleGuide.md §5.15 QrDisplay: dark modules on a white surface in both themes, 240 px, from the path the server
// drew with qrSvgPath (src/lib/utils/qr-path.ts), so no data: image and no raw HTML reach the page. A suspended or
// revoked ticket keeps its QR at 30 % opacity next to the badge that explains why.
export function QrDisplay(props: {
  qr: { size: number; path: string };
  label: string;
  isDimmed?: boolean;
}) {
  const extent = QUIET_ZONE_MODULES + props.qr.size + QUIET_ZONE_MODULES;
  return (
    <div className={cn('mx-auto w-fit rounded-xl bg-white p-4', props.isDimmed && 'opacity-30')}>
      <svg
        role="img"
        aria-label={props.label}
        viewBox={`-${String(QUIET_ZONE_MODULES)} -${String(QUIET_ZONE_MODULES)} ${String(extent)} ${String(extent)}`}
        shapeRendering="crispEdges"
        className="size-60"
      >
        <path d={props.qr.path} className="fill-black" />
      </svg>
    </div>
  );
}
