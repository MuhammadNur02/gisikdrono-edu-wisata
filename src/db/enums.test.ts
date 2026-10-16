import { describe, expect, it } from 'vitest';

import { DB_ENUMS } from '@/db/enums';
import { Constants } from '@/db/types';

describe('DB_ENUMS', () => {
  it('lists exactly the enums and values Postgres reports in the generated types', () => {
    expect(DB_ENUMS).toEqual(Constants.public.Enums);
  });
});
