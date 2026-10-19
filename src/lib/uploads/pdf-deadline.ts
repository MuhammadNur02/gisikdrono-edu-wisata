import { MAX_PDF_SCAN_SECONDS } from '@/config/uploads';

// The time a booklet scan may take (docs/Security.md §8.4). The load checks it as it parses (./pdf-load-guard.ts);
// the walks after the load call step() on every node they visit, so one file built to make a walk slow cannot run
// past it either (security review of PR #14, F1 and F4).

const MS_PER_SECOND = 1000;
// Reading the clock on every node would cost more than the walk; every few thousand nodes is soon enough.
const STEPS_PER_CLOCK_CHECK = 4096;

export class ScanTimeout extends Error {
  constructor() {
    super('booklet scan deadline passed');
    this.name = 'ScanTimeout';
  }
}

export class ScanDeadline {
  private steps = 0;

  constructor(readonly atMs: number) {}

  static fromNow(): ScanDeadline {
    return new ScanDeadline(performance.now() + MAX_PDF_SCAN_SECONDS * MS_PER_SECOND);
  }

  isPast(): boolean {
    return performance.now() > this.atMs;
  }

  // One node of a walk; throws ScanTimeout once the deadline has passed.
  step(): void {
    this.steps += 1;
    if (this.steps % STEPS_PER_CLOCK_CHECK === 0 && this.isPast()) throw new ScanTimeout();
  }
}
