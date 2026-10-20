import { describe, expect, it } from 'vitest';

import { seeOther } from '@/lib/utils/see-other';

describe('seeOther', () => {
  it('answers 303 with the path as it is', () => {
    const response = seeOther('/login?info=link-expired');

    expect(response.status).toBe(303);
    expect(response.headers.get('location')).toBe('/login?info=link-expired');
  });
});
