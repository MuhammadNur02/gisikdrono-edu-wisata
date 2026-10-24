import { describe, expect, it, vi } from 'vitest';

import type { ActionResult } from '@/types/action-result';

import { withStepUp } from './step-up';

const REFUSED: ActionResult<null> = {
  ok: false,
  error: { code: 'VALIDATION', message: 'Kode salah', fieldErrors: { code: ['Kode salah'] } },
};

describe('withStepUp', () => {
  it('checks the code first, then sends the other fields alone to the action', async () => {
    const stepUp = vi.fn().mockResolvedValue({ ok: true, data: null });
    const action = vi.fn().mockResolvedValue({ ok: true, data: 'done' });
    const submit = withStepUp(stepUp, action);
    await expect(submit({ code: '123456', userId: 'u-1', reason: 'Cuti' })).resolves.toEqual({
      ok: true,
      data: 'done',
    });
    expect(stepUp).toHaveBeenCalledWith({ code: '123456' });
    expect(action).toHaveBeenCalledWith({ userId: 'u-1', reason: 'Cuti' });
    expect(stepUp.mock.invocationCallOrder[0]).toBeLessThan(
      action.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it('stops at a refused code and never calls the action', async () => {
    const stepUp = vi.fn().mockResolvedValue(REFUSED);
    const action = vi.fn();
    await expect(withStepUp(stepUp, action)({ code: '000000', userId: 'u-1' })).resolves.toEqual(
      REFUSED,
    );
    expect(action).not.toHaveBeenCalled();
  });

  it('hands values that are not an object to the step-up without a code', async () => {
    const stepUp = vi.fn().mockResolvedValue(REFUSED);
    const action = vi.fn();
    await withStepUp(stepUp, action)(null);
    expect(stepUp).toHaveBeenCalledWith({ code: undefined });
    expect(action).not.toHaveBeenCalled();
  });
});
