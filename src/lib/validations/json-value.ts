import { z } from 'zod';

import type { Json } from '@/db/types';

// Any value JSON can hold, so a body read from outside reaches a jsonb parameter typed as Json, with no cast. What the
// database keeps of it is its own decision (midtrans_payload_minimise keeps an allow-list of keys).
export const jsonValueSchema: z.ZodType<Json> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);
