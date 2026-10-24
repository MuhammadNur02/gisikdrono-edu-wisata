import { cn } from '@/lib/utils/cn';

// lucide has no brand marks, so the WhatsApp glyph of DESIGN-SPEC §1.6 is drawn from two lucide paths (ISC): the
// round speech bubble with a handset inside it. Same 24 px grid and 2 px stroke as every other icon; no new
// dependency on a public page.
const BUBBLE =
  'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719';
const HANDSET =
  'M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384';
// The handset at 45 %, centred in the bubble; its stroke is widened by the same factor so it reads at 1.5 px.
const HANDSET_TRANSFORM = 'translate(6.6 6.6) scale(0.45)';
const HANDSET_STROKE = 3.4;

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={cn('size-6 shrink-0', className)}
    >
      <path d={BUBBLE} />
      <path d={HANDSET} transform={HANDSET_TRANSFORM} strokeWidth={HANDSET_STROKE} />
    </svg>
  );
}
