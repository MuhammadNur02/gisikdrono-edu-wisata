import { describe, expect, it } from 'vitest';

import { tablesCreatedIn, tablesWithoutTests } from './check-table-tests.mjs';

describe('tablesCreatedIn', () => {
  it('finds every public table a migration creates, in any spelling', () => {
    const migration = `
      create table public.rw_units (id smallint primary key);
      CREATE TABLE IF NOT EXISTS public.job_heartbeats (job text);
      create table
        public.ticket_scans (id bigint);
    `;
    expect(tablesCreatedIn(migration)).toEqual(['rw_units', 'job_heartbeats', 'ticket_scans']);
  });

  it('ignores temporary tables, other schemas and tables only mentioned in comments', () => {
    const migration = `
      create temp table scratch as select 1;
      create table internal.secrets (id int);
      -- create table public.commented_out (id int);
      /* create table public.also_commented (id int); */
    `;
    expect(tablesCreatedIn(migration)).toEqual([]);
  });
});

describe('tablesWithoutTests', () => {
  it('reports the tables no test file names, once each and sorted', () => {
    const tests = [
      'select count(*) from public.rw_units;',
      'insert into public.job_heartbeats values (1);',
    ];
    expect(
      tablesWithoutTests(['ticket_scans', 'rw_units', 'audit_logs', 'ticket_scans'], tests),
    ).toEqual(['audit_logs', 'ticket_scans']);
  });

  it('does not count a name that only appears in a comment or inside a longer name', () => {
    const tests = ['-- TODO: public.bookings\nselect * from public.booking_legs;'];
    expect(tablesWithoutTests(['bookings', 'booking_legs'], tests)).toEqual(['bookings']);
  });
});
