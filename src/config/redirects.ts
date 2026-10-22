// Public addresses that moved, so links already shared, printed or indexed keep working. next.config.ts answers them
// with a permanent redirect (308) before src/middleware.ts sees the request, so an old RW address never reaches the
// rewrite to the RW pages' internal folder. next.config.ts loads this file itself, so it imports nothing.
export interface MovedPath {
  source: string;
  destination: string;
}

// The arts programme moved from RW 08 to RW 13 (decision of 2026-10-21, Task P2.10.03). RW 08 itself lives on at
// /rw-08-inklusif-ramah-anak; only the arts programme's old pages point to RW 13.
export const MOVED_PATHS: readonly MovedPath[] = [
  { source: '/rw-08-kampung-seni-budaya', destination: '/rw-13-kampung-budaya-seni' },
  { source: '/rw-08-kampung-seni-budaya/jadwal', destination: '/rw-13-kampung-budaya-seni/jadwal' },
];
