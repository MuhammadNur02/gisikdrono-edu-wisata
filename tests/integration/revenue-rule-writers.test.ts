import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runSql } from '../../scripts/local-stack';

// Two staff members write lines of one revenue rule at the same moment (independent review of PR #24, 6). Each
// writer's lines pass the rule checks on their own, so only a check that waits for the other writer to commit sees the
// two together. Each call is its own transaction on its own connection, and the first keeps its transaction open for
// a while, so the second writes while the first is still open. The first writer runs its checks either at once or,
// as a staff action does, at commit.
//
// Two locks make the second writer wait today: the guards' own lock on the rule, and the audit chain's lock, which
// every audited write holds until commit (internal.chain_append). The second alone already gives these outcomes, so
// the suite holds them whichever lock keeps them; and it fails if the guards' lock deadlocks with the row locks a
// writer holds, as a row lock on the rule would with the foreign-key check of the other writer's lines.

const SHAPE_PACKAGE_ID = '00000000-0000-4000-9000-0000000005a1';
const COMMIT_PACKAGE_ID = '00000000-0000-4000-9000-0000000005a2';
const PAIR_PRODUCT_ID = '00000000-0000-4000-9000-0000000005c1';
const SUM_PRODUCT_ID = '00000000-0000-4000-9000-0000000005c2';
const VENDOR_ID = '00000000-0000-4000-9000-0000000005d1';
const SHAPE_RULE_ID = '00000000-0000-4000-9000-0000000005b1';
const COMMIT_RULE_ID = '00000000-0000-4000-9000-0000000005b2';
const PAIR_RULE_ID = '00000000-0000-4000-9000-0000000005b3';
const SUM_RULE_ID = '00000000-0000-4000-9000-0000000005b4';
const FIRST_WRITER_HOLDS_SECONDS = 1.5;
const SECOND_WRITER_STARTS_MS = 300;
const SLOW_TEST_MS = 60_000;

const idRowsSchema = z.array(z.object({ id: z.coerce.number() }));
const lineRowsSchema = z.array(z.object({ lines: z.coerce.number() }));

type Writer = { line: string; guard?: string; holdSeconds: number };

async function lastAuditId(): Promise<number> {
  const rows = await runSql('select coalesce(max(id), 0) as id from public.audit_logs');
  return idRowsSchema.parse(rows)[0]?.id ?? 0;
}

function addLine(ruleId: string, writer: Writer): Promise<unknown[]> {
  const checkAtOnce = writer.guard ? `set constraints ${writer.guard} immediate;` : '';
  return runSql(`insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct)
                   values ('${ruleId}', ${writer.line});
                 ${checkAtOnce}
                 select pg_sleep(${String(writer.holdSeconds)});`);
}

async function raceTwoWriters(
  ruleId: string,
  first: Omit<Writer, 'holdSeconds'>,
  secondLine: string,
) {
  const firstWrite = addLine(ruleId, { ...first, holdSeconds: FIRST_WRITER_HOLDS_SECONDS });
  await new Promise((resolve) => setTimeout(resolve, SECOND_WRITER_STARTS_MS));
  const secondWrite = addLine(ruleId, { line: secondLine, holdSeconds: 0 });
  return Promise.allSettled([firstWrite, secondWrite]);
}

function refusals(outcomes: PromiseSettledResult<unknown>[]): string[] {
  return outcomes.flatMap((outcome) =>
    outcome.status === 'rejected' ? [String(outcome.reason)] : [],
  );
}

async function lineCount(ruleId: string): Promise<number> {
  const rows = await runSql(
    `select count(*) as lines from public.revenue_share_rule_lines where rule_id = '${ruleId}'`,
  );
  return lineRowsSchema.parse(rows)[0]?.lines ?? 0;
}

describe('two writers on one revenue rule', () => {
  let auditIdBefore = 0;

  beforeAll(async () => {
    auditIdBefore = await lastAuditId();
    await runSql(`insert into public.tour_packages (id, category, slug, name, pricing_basis, flat_price, status) values
                    ('${SHAPE_PACKAGE_ID}', 'combo', 'uji-penulis-bersamaan-1', 'Uji Bersamaan', 'flat_group',
                     1000000, 'draft'),
                    ('${COMMIT_PACKAGE_ID}', 'combo', 'uji-penulis-bersamaan-2', 'Uji Bersamaan', 'flat_group',
                     1000000, 'draft');
                  insert into public.umkm_vendors (id, rw_id, slug, name)
                    values ('${VENDOR_ID}', 5, 'uji-penulis-bersamaan', 'Vendor Uji Bersamaan');
                  insert into public.products_umkm (id, rw_id, vendor_id, slug, name, category, price, status) values
                    ('${PAIR_PRODUCT_ID}', 5, '${VENDOR_ID}', 'uji-penulis-bersamaan-1', 'Produk Uji', 'souvenir',
                     20000, 'draft'),
                    ('${SUM_PRODUCT_ID}', 5, '${VENDOR_ID}', 'uji-penulis-bersamaan-2', 'Produk Uji', 'souvenir',
                     20000, 'draft');
                  insert into public.revenue_share_rules (id, scope, package_id, product_id, name) values
                    ('${SHAPE_RULE_ID}', 'package', '${SHAPE_PACKAGE_ID}', null, 'Uji bentuk bersamaan'),
                    ('${COMMIT_RULE_ID}', 'package', '${COMMIT_PACKAGE_ID}', null, 'Uji bentuk saat commit'),
                    ('${PAIR_RULE_ID}', 'product', null, '${PAIR_PRODUCT_ID}', 'Uji dua baris cocok'),
                    ('${SUM_RULE_ID}', 'product', null, '${SUM_PRODUCT_ID}', 'Uji jumlah bersamaan');
                  insert into public.revenue_share_rule_lines (rule_id, beneficiary, rw_id, pct) values
                    ('${SHAPE_RULE_ID}', 'kelurahan', null, 100.00),
                    ('${COMMIT_RULE_ID}', 'kelurahan', null, 100.00),
                    ('${PAIR_RULE_ID}', 'umkm_vendor', null, 100.00);`);
  }, SLOW_TEST_MS);

  // One query string is one transaction, so the purge switch ends with it.
  afterAll(async () => {
    await runSql(`select set_config('app.purge', 'on', true);
      delete from public.tour_packages where id in ('${SHAPE_PACKAGE_ID}', '${COMMIT_PACKAGE_ID}');
      delete from public.products_umkm where id in ('${PAIR_PRODUCT_ID}', '${SUM_PRODUCT_ID}');
      delete from public.umkm_vendors where id = '${VENDOR_ID}';
      delete from public.audit_logs where id > ${String(auditIdBefore)};`);
  }, SLOW_TEST_MS);

  it(
    'refuses the second of an equal split and a named RW, though each passes alone',
    async () => {
      const outcomes = await raceTwoWriters(
        SHAPE_RULE_ID,
        { line: `'rw_treasury', null, 0.00`, guard: 'revenue_rule_shape_guard' },
        `'rw_treasury', 5, 0.00`,
      );

      expect(outcomes[0].status).toBe('fulfilled');
      expect(refusals(outcomes)).toEqual([expect.stringContaining('with no RW named beside it')]);
      expect(await lineCount(SHAPE_RULE_ID)).toBe(2);
    },
    SLOW_TEST_MS,
  );

  it(
    'refuses one of the two when both are checked at commit, and never by a deadlock',
    async () => {
      const outcomes = await raceTwoWriters(
        COMMIT_RULE_ID,
        { line: `'rw_treasury', null, 0.00` },
        `'rw_treasury', 5, 0.00`,
      );

      expect(refusals(outcomes)).toEqual([expect.stringContaining('with no RW named beside it')]);
      expect(await lineCount(COMMIT_RULE_ID)).toBe(2);
    },
    SLOW_TEST_MS,
  );

  it(
    'lets two writers whose lines fit together both commit',
    async () => {
      const outcomes = await raceTwoWriters(
        PAIR_RULE_ID,
        { line: `'rw_treasury', 5, 0.00` },
        `'kelurahan', null, 0.00`,
      );

      expect(refusals(outcomes)).toEqual([]);
      expect(await lineCount(PAIR_RULE_ID)).toBe(3);
    },
    SLOW_TEST_MS,
  );

  it(
    'refuses the second of two writers who each fill an empty rule to 100 %',
    async () => {
      const outcomes = await raceTwoWriters(
        SUM_RULE_ID,
        { line: `'kelurahan', null, 100.00`, guard: 'revenue_rule_sum_guard' },
        `'rw_treasury', 5, 100.00`,
      );

      expect(outcomes[0].status).toBe('fulfilled');
      expect(refusals(outcomes)).toEqual([expect.stringContaining('must add up to 100')]);
      expect(await lineCount(SUM_RULE_ID)).toBe(1);
    },
    SLOW_TEST_MS,
  );
});
