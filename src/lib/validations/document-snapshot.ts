import { z } from 'zod';

import { DB_ENUMS } from '@/db/enums';

// The document snapshot of docs/PRD.md §8.4.5 as quotations.snapshot and invoices.snapshot hold it: one fixed shape
// the trigger snapshot_without_contact enforces on write (every key optional, no other key, no contact, nothing past
// 300 characters). The PDFs render from this and from nothing else, so whatever a row carries, a document prints only
// these fields at these lengths.

const SNAPSHOT_TEXT_MAX_LENGTH = 300;
const text = z.string().max(SNAPSHOT_TEXT_MAX_LENGTH);
const money = z.int().nonnegative();
const count = z.int().nonnegative();
const day = z.iso.date();

export const documentLineSchema = z
  .object({
    kind: z.enum(['package', 'addon']),
    product_name: text,
    qty: count,
    unit_price: money,
    line_total: money,
  })
  .strict();

export const documentSnapshotSchema = z
  .object({
    booking_code: text,
    institution_name: text.nullish(),
    booker_type: z.enum(DB_ENUMS.booker_type),
    package_name: text,
    package_category: z.enum(DB_ENUMS.package_category).nullish(),
    pricing_basis: z.enum(DB_ENUMS.pricing_basis).nullish(),
    rw_names: z.array(text).default([]),
    visit_date: day,
    visit_date_end: day.nullish(),
    sessions: z
      .array(
        z.object({ rw_name: text, session_date: day, start_time: text, end_time: text }).strict(),
      )
      .default([]),
    pax_count: count,
    lines: z.array(documentLineSchema).default([]),
    subtotal_package: money.default(0),
    subtotal_addons: money.default(0),
    discount_amount: money.default(0),
    total_amount: money,
    currency: text.default('IDR'),
    valid_until: day.nullish(),
    due_date: day.nullish(),
    payment: z
      .object({
        method: text.nullish(),
        va_bank: text.nullish(),
        order_id: text.nullish(),
        paid_at: text.nullish(),
        amount_paid: money.nullish(),
      })
      .strict()
      .nullish(),
    credit_note: z
      .object({ number: text.nullish(), issued_at: text.nullish(), amount: money.nullish() })
      .strict()
      .nullish(),
    signatory_name: text.nullish(),
    signatory_title: text.nullish(),
    template_version: text.nullish(),
  })
  .strict();

export type DocumentSnapshot = z.output<typeof documentSnapshotSchema>;
export type DocumentLine = z.output<typeof documentLineSchema>;
