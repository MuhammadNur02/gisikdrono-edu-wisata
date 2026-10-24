import { describe, expect, it } from 'vitest';

import { acknowledgeAlertSchema, parseAlertFilter, parseAuditFilter } from './security';

const ACTOR = '0192f3a4-5b6c-7d8e-9f01-0000000000a1';

describe('parseAlertFilter', () => {
  it('reads a severity, a state and a page', () => {
    expect(parseAlertFilter({ severity: 'critical', state: 'open', page: '3' })).toEqual({
      severity: 'critical',
      state: 'open',
      page: 3,
    });
  });

  it('drops what it does not know instead of failing', () => {
    expect(parseAlertFilter({ severity: 'urgent', state: ['closed'], page: '-2' })).toEqual({
      severity: undefined,
      state: undefined,
      page: 1,
    });
    expect(parseAlertFilter({})).toEqual({ severity: undefined, state: undefined, page: 1 });
  });
});

describe('parseAuditFilter', () => {
  it('reads every filter', () => {
    expect(
      parseAuditFilter({
        entity: 'profiles',
        entityId: ACTOR,
        actor: ACTOR,
        from: '2026-10-01',
        to: '2026-10-24',
        page: '2',
      }),
    ).toEqual({
      entity: 'profiles',
      entityId: ACTOR,
      actor: ACTOR,
      from: '2026-10-01',
      to: '2026-10-24',
      page: 2,
    });
  });

  it('drops a table name, an id, an actor or a date it cannot use', () => {
    const filter = parseAuditFilter({
      entity: 'profiles; drop table',
      entityId: 'a,b)',
      actor: 'me',
      from: '24-10-2026',
      page: 'two',
    });
    expect(filter).toEqual({
      entity: undefined,
      entityId: undefined,
      actor: undefined,
      from: undefined,
      to: undefined,
      page: 1,
    });
  });

  it('keeps only the start of a range that ends before it begins', () => {
    expect(parseAuditFilter({ from: '2026-10-20', to: '2026-10-01' })).toMatchObject({
      from: '2026-10-20',
      to: undefined,
    });
  });

  it('reads the first of repeated parameters', () => {
    expect(parseAuditFilter({ entity: ['bookings', 'profiles'] }).entity).toBe('bookings');
  });
});

describe('acknowledgeAlertSchema', () => {
  it('takes an alert id and nothing else', () => {
    expect(acknowledgeAlertSchema.safeParse({ alertId: ACTOR }).success).toBe(true);
    expect(
      acknowledgeAlertSchema.safeParse({ alertId: ACTOR, acknowledgedBy: ACTOR }).success,
    ).toBe(false);
  });
});
