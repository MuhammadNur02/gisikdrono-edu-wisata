import { describe, expect, it } from 'vitest';

import { databaseErrorCode, isTransientDatabaseError } from '@/lib/utils/database-errors';

describe('isTransientDatabaseError', () => {
  it.each([
    ['a lost connection', { code: '08006', message: 'connection failure' }],
    ['too many connections', { code: '53300', message: 'too many clients' }],
    ['a statement timeout', { code: '57014', message: 'canceling statement' }],
    ['a deadlock', { code: '40P01', message: 'deadlock detected' }],
    ['a serialization failure', { code: '40001', message: 'could not serialize' }],
    ['PostgREST without its database', { code: 'PGRST001', message: 'no connection' }],
    ['a fetch that never reached PostgREST', { code: '', message: 'TypeError: fetch failed' }],
    ['a thrown network error', new TypeError('fetch failed')],
  ])('is true for %s', (_case, error) => {
    expect(isTransientDatabaseError(error)).toBe(true);
  });

  it.each([
    ['a unique violation', { code: '23505', message: 'duplicate key' }],
    ['a refused parameter', { code: '22023', message: 'bad count' }],
    ['a raised business rule', { code: 'P0001', message: 'STATE_INVALID' }],
    ['a missing row', { code: 'PGRST116', message: 'no rows' }],
    ['a plain bug', new Error('undefined is not a function')],
    ['nothing at all', null],
    ['a string', 'fetch failed'],
  ])('is false for %s', (_case, error) => {
    expect(isTransientDatabaseError(error)).toBe(false);
  });
});

describe('databaseErrorCode', () => {
  it('reads a string code and nothing else', () => {
    expect(databaseErrorCode({ code: '42501' })).toBe('42501');
    expect(databaseErrorCode({ code: 42501 })).toBeUndefined();
    expect(databaseErrorCode(undefined)).toBeUndefined();
  });
});
