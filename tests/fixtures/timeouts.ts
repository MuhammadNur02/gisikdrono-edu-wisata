// Test files that run real PDF scans or sharp encodes need seconds per test, more while the machine is busy with
// other work, so they wait this long per test instead of Vitest's default 5 s. Every other file keeps the default.
export const HEAVY_FILE_TEST_TIMEOUT_MS = 30_000;
