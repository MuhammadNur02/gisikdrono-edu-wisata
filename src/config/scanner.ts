// The gate scanner (CLAUDE.md §7.4, docs/PRD.md FR-SCAN-01..07, docs/StyleGuide.md §6.6; Task P4.4.03, P4.4.04).
// Build-time rules of the client; the check-in grace window is the server's (site_settings.checkin.*).

// FR-SCAN-06: a request without an answer after 8 s offers `Coba lagi` with the same attemptId, and the same payload
// read again within 3 s is ignored.
export const VERIFY_TIMEOUT_MS = 8000;
export const DUPLICATE_PAYLOAD_WINDOW_MS = 3000;

// FR-SCAN-04: an officer may let in up to twice the booked group; the rest is recorded as unpaid.
export const MAX_ATTENDEE_FACTOR = 2;
export const MIN_ATTENDEES = 1;

// FR-SCAN-07: the manual check-in asks for the last four digits of the verified phone.
export const PHONE_LAST_DIGITS = 4;
export const OVERRIDE_REASON_MAX_LENGTH = 200;

// The recent-scans list under the camera (docs/StyleGuide.md §6.6).
export const RECENT_SCANS_LIMIT = 10;

// The ZXing reader the barcode-detector ponyfill falls back to where the browser has no BarcodeDetector (iOS Safari,
// desktop Linux). It is served from this site, never from jsDelivr, so the CSP needs no CDN (Task P4.4.03);
// src/lib/scanner/zxing-wasm.test.ts keeps the file equal to the zxing-wasm release the ponyfill was built for.
export const ZXING_WASM_PATH = '/vendor/zxing/zxing_reader.wasm';

// Haptics per tone (docs/StyleGuide.md §6.6): one short on green, two on amber, one long on red.
export const VIBRATION_PATTERNS = {
  success: [80],
  warning: [80, 80, 80],
  danger: [400],
} as const;

// The beep per tone (docs/StyleGuide.md §6.6, Task P4.4.04), made with WebAudio so no audio file ships: a short high
// note on green, two middle ones on amber, one long low note on red. Each note is [frequency in Hz, length in ms].
export const SCAN_TONE_NOTES = {
  success: [[1046, 120]],
  warning: [
    [784, 90],
    [784, 90],
  ],
  danger: [[262, 360]],
} as const;
// The silence between two notes of a tone, and how loud a note is (0..1): audible at a gate, not startling.
export const SCAN_TONE_GAP_MS = 80;
export const SCAN_TONE_GAIN = 0.2;
// The officer's own choice on this device (a per-device convenience, so localStorage): '0' mutes the beep.
export const SCANNER_SOUND_STORAGE_KEY = 'gsk.scanner.sound';

// The service worker's scope: it controls the scanner and nothing else (Task P4.4.03).
export const SCANNER_SERVICE_WORKER = { url: '/sw.js', scope: '/dashboard/scanner' } as const;
// What the service worker serves for the scanner page while the network is down; static, without PII.
export const SCANNER_OFFLINE_PATH = '/luring';
// The installed scanner's own web manifest, linked from /dashboard/scanner alone; the site-wide src/app/manifest.ts
// stays the public website's (review of PR #49). public/scanner.webmanifest, kept in step by scanner-manifest.test.ts.
export const SCANNER_MANIFEST_PATH = '/scanner.webmanifest';

// POST /api/tickets/verify (Task P4.4.02): a scan request is a token or a code and a few short fields; anything
// larger is refused before it is parsed (CLAUDE.md §5.4).
export const SCAN_REQUEST_BODY_LIMIT_BYTES = 2048;
