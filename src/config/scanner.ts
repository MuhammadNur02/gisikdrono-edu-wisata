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

// The service worker's scope: it controls the scanner and nothing else (Task P4.4.03).
export const SCANNER_SERVICE_WORKER = { url: '/sw.js', scope: '/dashboard/scanner' } as const;
// What the service worker serves for the scanner page while the network is down; static, without PII.
export const SCANNER_OFFLINE_PATH = '/luring';
