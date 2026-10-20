import { describe, expect, it, vi } from 'vitest';

import { showFieldErrors } from '@/lib/utils/form-errors';

type Values = { email: string; password: string };

describe('showFieldErrors', () => {
  it('sets the first message of each field the form has', () => {
    const setError = vi.fn();

    showFieldErrors<Values>(setError, ['email', 'password'], {
      email: ['Tulis alamat email yang benar, ya.', 'second'],
      unknown: ['ignored'],
    });

    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', {
      type: 'server',
      message: 'Tulis alamat email yang benar, ya.',
    });
  });

  it('does nothing without field errors', () => {
    const setError = vi.fn();

    showFieldErrors<Values>(setError, ['email'], undefined);

    expect(setError).not.toHaveBeenCalled();
  });
});
