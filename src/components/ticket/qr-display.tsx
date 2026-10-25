import { cn } from '@/lib/utils/cn';

// The four light modules around a QR code that scanners need to find it (ISO/IEC 18004 quiet zone).
const QUIET_ZONE_MODULES = 4;

// docs/StyleGuide.md §5.15 QrDisplay, DESIGN-SPEC §2.6 QR: dark modules on a white tile (radius 12) in both themes, 232
// px, from the path the server drew with qrSvgPath (src/lib/utils/qr-path.ts), so no data: image and no raw HTML reach
// the page. The SVG carries its own quiet zone. Never animated.
export function QrDisplay(props: {
  qr: { size: number; path: string };
  label: string;
  className?: string;
}) {
  const extent = QUIET_ZONE_MODULES + props.qr.size + QUIET_ZONE_MODULES;
  return (
    <div className={cn('mx-auto w-fit rounded-xl bg-white p-2', props.className)}>
      <svg
        role="img"
        aria-label={props.label}
        viewBox={`-${String(QUIET_ZONE_MODULES)} -${String(QUIET_ZONE_MODULES)} ${String(extent)} ${String(extent)}`}
        shapeRendering="crispEdges"
        className="size-58"
      >
        <path d={props.qr.path} className="fill-night" />
      </svg>
    </div>
  );
}
