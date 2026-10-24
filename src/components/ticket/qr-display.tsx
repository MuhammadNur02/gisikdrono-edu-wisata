// The four light modules around a QR code that scanners need to find it (ISO/IEC 18004 quiet zone).
const QUIET_ZONE_MODULES = 4;

// docs/StyleGuide.md §5.15 QrDisplay: dark modules on a white surface in both themes, 240 px, from the path the server
// drew with qrSvgPath (src/lib/utils/qr-path.ts), so no data: image and no raw HTML reach the page.
export function QrDisplay(props: { qr: { size: number; path: string }; label: string }) {
  const extent = QUIET_ZONE_MODULES + props.qr.size + QUIET_ZONE_MODULES;
  return (
    <div className="mx-auto w-fit rounded-xl bg-white p-4">
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
