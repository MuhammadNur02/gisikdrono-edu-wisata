import type { DocumentSnapshot } from '@/lib/validations/document-snapshot';

// A school's quotation of 20 pupils with compost add-ons, as internal.quotation_snapshot builds it.
export const schoolSnapshot: DocumentSnapshot = {
  booking_code: 'GSK-7F3K9Q2M',
  institution_name: 'SD Negeri Gisikdrono 01',
  booker_type: 'school',
  package_name: 'Eduwisata Ecowastreme',
  package_category: 'regular',
  pricing_basis: 'per_pax',
  rw_names: ['RW 05 Ecowastreme'],
  visit_date: '2026-11-12',
  visit_date_end: '2026-11-12',
  sessions: [
    {
      rw_name: 'RW 05 Ecowastreme',
      session_date: '2026-11-12',
      start_time: '09:05:00',
      end_time: '10:05:00',
    },
  ],
  pax_count: 20,
  lines: [
    {
      kind: 'package',
      product_name: 'Eduwisata Ecowastreme',
      qty: 20,
      unit_price: 30000,
      line_total: 600000,
    },
    { kind: 'addon', product_name: 'Kompos Uji', qty: 20, unit_price: 15000, line_total: 300000 },
  ],
  subtotal_package: 600000,
  subtotal_addons: 300000,
  discount_amount: 0,
  total_amount: 900000,
  currency: 'IDR',
  valid_until: '2026-11-06',
  due_date: null,
  payment: null,
  credit_note: null,
  signatory_name: 'Budi Santoso, S.Sos.',
  signatory_title: 'Lurah Gisikdrono',
  template_version: 'quotation-v1',
};
