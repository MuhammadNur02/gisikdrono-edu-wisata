import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import { FINANCE_REFUSAL_HINTS } from '@/config/finance';
import { MAPPED_POSTGRES_HINTS } from '@/lib/errors';

import { financeRefusal } from './finance-errors';

vi.mock('server-only', () => ({}));

// Review of PR #80, M-1: every hint the finance RPCs can raise, read from the migrations themselves, has its
// Indonesian sentence. The latest body of each function is followed through the functions it calls and the triggers
// of the tables it writes, from the RPCs the finance pages call.

const MIGRATIONS_DIR = join(process.cwd(), 'supabase', 'migrations');
const FINANCE_RPCS = [
  'public.propose_adjustment',
  'public.approve_adjustment',
  'public.reject_adjustment',
  'public.apply_adjustment',
  'public.record_refund',
  'public.save_revenue_rule',
  'public.settle_revenue_entries',
  'public.payout_preview',
  'public.release_refund_key_mismatch',
  'public.rpc_reveal_finance_evidence',
] as const;
// A 42501 reads as the step-up to repeat (financeRefusal), whatever its hint.
const PRIVILEGE_ERRCODE = '42501';

interface Schema {
  bodies: Map<string, string>;
  triggersByTable: Map<string, Set<string>>;
}

function migrationsInOrder(): string[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith('.sql'))
    .sort()
    .map((name) => readFileSync(join(MIGRATIONS_DIR, name), 'utf8'));
}

function readFunctions(sql: string, bodies: Map<string, string>): void {
  const statement =
    /(create(?: or replace)? function|drop function(?: if exists)?)\s+(\w+\.\w+)\s*\(/gi;
  for (const match of sql.matchAll(statement)) {
    const [, verb = '', name = ''] = match;
    if (verb.toLowerCase().startsWith('drop')) {
      bodies.delete(name);
      continue;
    }
    const rest = sql.slice(match.index);
    const tag = /\bas\s+(\$\w*\$)/i.exec(rest);
    if (!tag?.[1]) continue;
    const start = tag.index + tag[0].length;
    const end = rest.indexOf(tag[1], start);
    bodies.set(name, rest.slice(start, end));
  }
}

function readTriggers(sql: string, triggersByTable: Map<string, Set<string>>): void {
  const trigger =
    /create trigger\s+\w+\s+[^;]*?\bon\s+public\.(\w+)[^;]*?execute function\s+(\w+\.\w+)\s*\(/gi;
  for (const [, table = '', fn = ''] of sql.matchAll(trigger)) {
    const functions = triggersByTable.get(table) ?? new Set<string>();
    functions.add(fn);
    triggersByTable.set(table, functions);
  }
}

function readSchema(): Schema {
  const schema: Schema = { bodies: new Map(), triggersByTable: new Map() };
  for (const sql of migrationsInOrder()) {
    readFunctions(sql, schema.bodies);
    readTriggers(sql, schema.triggersByTable);
  }
  return schema;
}

function nextFunctions(body: string, schema: Schema): string[] {
  const called = [...body.matchAll(/\b((?:internal|public)\.\w+)\s*\(/g)].map(
    (match) => match[1] ?? '',
  );
  const written = [...body.matchAll(/\b(?:insert into|update|delete from)\s+public\.(\w+)/gi)].map(
    (match) => match[1] ?? '',
  );
  return [...called, ...written.flatMap((table) => [...(schema.triggersByTable.get(table) ?? [])])];
}

function reachableBodies(schema: Schema): string[] {
  const seen = new Set<string>();
  const queue: string[] = [...FINANCE_RPCS];
  const bodies: string[] = [];
  for (let name = queue.shift(); name !== undefined; name = queue.shift()) {
    const body = schema.bodies.get(name);
    if (seen.has(name) || body === undefined) continue;
    seen.add(name);
    bodies.push(body);
    queue.push(...nextFunctions(body, schema));
  }
  return bodies;
}

// The hints of every raise in the bodies, but those of a 42501.
function raisedHints(bodies: readonly string[]): Set<string> {
  const hints = new Set<string>();
  for (const body of bodies) {
    // A message may hold a semicolon of its own, so the statement ends after the quoted message.
    for (const [raise = ''] of body.matchAll(/raise exception\s+'(?:[^']|'')*'[^;]*;/gi)) {
      const hint = /hint\s*=\s*'([A-Z_]+)'/.exec(raise)?.[1];
      const errcode = /errcode\s*=\s*'(\w+)'/.exec(raise)?.[1];
      if (hint && errcode !== PRIVILEGE_ERRCODE) hints.add(hint);
    }
  }
  return hints;
}

describe('finance refusals (review of PR #80, M-1)', () => {
  const hints = raisedHints(reachableBodies(readSchema()));
  const answered = new Set<string>([...FINANCE_REFUSAL_HINTS, ...MAPPED_POSTGRES_HINTS]);

  it('reads the hints of the finance RPCs from the migrations', () => {
    expect(hints).toContain('REFUND_PENDING_AT_MIDTRANS');
    expect(hints).toContain('PAYOUT_TOTAL_MISMATCH');
  });

  it.each([...hints])('answers %s with a sentence of its own or the shared mapping', (hint) => {
    expect(answered).toContain(hint);
  });

  it('turns every finance hint into its own message', () => {
    for (const hint of FINANCE_REFUSAL_HINTS) {
      const refusal = financeRefusal({ code: 'P0001', message: 'refused', hint });
      expect(refusal?.userMessage).toBeTruthy();
      expect(refusal?.code).not.toBe('INTERNAL');
    }
  });

  it('names the open refund request as what decides a transfer', () => {
    const pending = financeRefusal({
      code: 'P0001',
      message: 'x',
      hint: 'REFUND_PENDING_AT_MIDTRANS',
    });
    const mismatch = financeRefusal({
      code: 'P0001',
      message: 'x',
      hint: 'REFUND_REQUEST_MISMATCH',
    });
    expect(pending?.userMessage).toMatch(/permintaan refund/i);
    expect(mismatch?.userMessage).toMatch(/permintaan refund/i);
  });
});

describe('a weather link refused as STATE_INVALID (review of PR #80, Info)', () => {
  it('says which choice to change when named_weather_link refuses the link', () => {
    const refusal = financeRefusal({
      code: 'P0001',
      message: "weather link 0192f3a4-5b6c-7d8e-9f01-000000000002 is not held on the booking's settled payment",
      hint: 'STATE_INVALID',
    });
    expect(refusal?.code).toBe('STATE_INVALID');
    expect(refusal?.userMessage).toMatch(/tautan cuaca/i);
  });

  it('asks for the adjustment to be withdrawn when applying it meets that refusal (review of PR #103, Info)', () => {
    const refusal = financeRefusal(
      {
        code: 'P0001',
        message: 'weather link 0192f3a4-5b6c-7d8e-9f01-000000000002 is no longer one the shares cannot fund',
        hint: 'STATE_INVALID',
      },
      'apply',
    );
    expect(refusal?.userMessage).toMatch(/tarik penyesuaian/i);
  });

  it('leaves any other STATE_INVALID to mapError', () => {
    expect(financeRefusal({ code: 'P0001', message: 'refused', hint: 'STATE_INVALID' })).toBeNull();
  });
});

describe('the REFUND_KEY_MISMATCH refusal (review of PR #80, L-1)', () => {
  it('names the applied adjustment Midtrans disagrees with', () => {
    const refusal = financeRefusal({
      code: 'P0001',
      message: 'Midtrans lists the refund of adjustment 0192f3a4-5b6c-7d8e-9f01-000000000001 with another amount',
      hint: 'REFUND_KEY_MISMATCH',
    });
    expect(refusal?.userMessage).toContain('0192f3a4');
  });
});
