import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { schemaResolver } from './schema-resolver';

const schema = z
  .object({
    accepted: z.literal(true, 'Centang dulu, ya.'),
    rows: z.array(z.object({ name: z.string().min(2, 'Nama terlalu pendek.') })),
  })
  .strict();

const OPTIONS = { fields: {}, shouldUseNativeValidation: false } as const;

describe('schemaResolver', () => {
  it("hands the schema's output on for values that pass", async () => {
    const resolve = schemaResolver<
      { accepted: boolean; rows: { name: string }[] },
      z.output<typeof schema>
    >(schema);
    expect(await resolve({ accepted: true, rows: [{ name: 'Budi' }] }, undefined, OPTIONS)).toEqual(
      {
        values: { accepted: true, rows: [{ name: 'Budi' }] },
        errors: {},
      },
    );
  });

  it('puts each message under its own field, nested rows included', async () => {
    const resolve = schemaResolver<
      { accepted: boolean; rows: { name: string }[] },
      z.output<typeof schema>
    >(schema);
    const result = await resolve({ accepted: false, rows: [{ name: 'B' }] }, undefined, OPTIONS);
    expect(result.values).toEqual({});
    expect(result.errors).toMatchObject({
      accepted: { message: 'Centang dulu, ya.' },
      rows: [{ name: { message: 'Nama terlalu pendek.' } }],
    });
  });

  it('shapes the values before the check', async () => {
    const resolve = schemaResolver<
      { accepted: boolean; rows: { name: string }[] },
      z.output<typeof schema>
    >(schema, (values) => ({ ...values, rows: values.rows.filter((row) => row.name !== '') }));
    const result = await resolve({ accepted: true, rows: [{ name: '' }] }, undefined, OPTIONS);
    expect(result.errors).toEqual({});
  });
});
