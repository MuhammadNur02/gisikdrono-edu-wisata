import { randomInt, randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';

// The network half of the staging probe (Task P5.2.02): one gentle client for every check, so the run stays far
// below the staging rate limits (docs/Security.md §8.3) and never follows a redirect, whose answer is under test.

export interface ProbeOutcome {
  problems: string[];
  warnings?: string[];
  note?: string;
}

export interface ProbeResult extends ProbeOutcome {
  name: string;
}

export interface Probe {
  origin: string;
  // Set by --production: public pages then go without noindex (security-probe.ts checks the target first).
  isProduction: boolean;
  request: (path: string, init?: RequestInit) => Promise<Response>;
}

// A pause before every request; with the checks run one by one, the run of about eighty requests is spread out.
const PACE_MS = 150;
const REQUEST_TIMEOUT_MS = 15_000;
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const BOOKING_CODE_LENGTH = 8;
const HEX_TOKEN_LENGTH = 32;
const HEX_RADIX = 16;

export function createProbe(base: URL, isProduction: boolean): Probe {
  return {
    origin: base.origin,
    isProduction,
    request: async (path, init = {}) => {
      await sleep(PACE_MS);
      return fetch(new URL(path, base), {
        redirect: 'manual',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        ...init,
      });
    },
  };
}

// A well-formed booking code no booking is likely to carry (40 random bits).
export function randomBookingCode(): string {
  const characters = Array.from(
    { length: BOOKING_CODE_LENGTH },
    () => CROCKFORD[randomInt(CROCKFORD.length)],
  );
  return `GSK-${characters.join('')}`;
}

export function randomHexToken(): string {
  return Array.from({ length: HEX_TOKEN_LENGTH }, () =>
    randomInt(HEX_RADIX).toString(HEX_RADIX),
  ).join('');
}

export { randomUUID };

export function expectStatus(response: Response, allowed: readonly number[]): string[] {
  return allowed.includes(response.status)
    ? []
    : [`status ${String(response.status)}, expected ${allowed.join(' or ')}`];
}

// A check starts only when the runner calls it, so the checks run one after another at the probe's pace.
export type ProbeCheck = () => Promise<ProbeResult>;

// A request that throws (a timeout, a reset) is a failed check, not a crashed run. A check answers its problems,
// or an outcome that also carries warnings (a state to review that is not a failure) and a note.
export function guarded(name: string, check: () => Promise<string[] | ProbeOutcome>): ProbeCheck {
  return async () => {
    try {
      const answer = await check();
      return Array.isArray(answer) ? { name, problems: answer } : { name, ...answer };
    } catch (error) {
      const reason = error instanceof Error ? error.name : 'unknown error';
      return { name, problems: [`the request failed (${reason})`] };
    }
  };
}
