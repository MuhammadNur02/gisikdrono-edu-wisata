// A synthetic row shaped like public.bookings (docs/PRD.md §8), with made-up but realistic PII.
export const bookingRow = {
  id: '0b6f8a52-5c1e-4f0a-9a43-7d2c1e5b9f10',
  booking_code: 'GSK-7F3K9Q2M',
  status: 'pending_payment',
  channel: 'web',
  package_id: '5a1d2c3b-4e5f-4a6b-8c7d-9e0f1a2b3c4d',
  package_snapshot: { name: 'Eduwisata Ecowastreme', unit_price: 25000 },
  rw_ids: [5],
  booker_type: 'school',
  institution_name: 'SD Negeri Gisikdrono 01',
  pic_name: 'Siti Rahmawati',
  pic_phone: '+6281234567890',
  pic_email: 'siti.rahmawati@example.test',
  pax_count: 40,
  visit_date: '2026-11-12',
  visit_date_end: '2026-11-12',
  subtotal_package: 1000000,
  subtotal_addons: 0,
  discount_amount: 0,
  total_amount: 1000000,
  amount_paid: 0,
  currency: 'IDR',
  expires_at: '2026-10-16T05:00:00.000Z',
  token_version: 1,
  source_ip: '203.0.113.7',
  user_agent: 'Mozilla/5.0',
  created_at: '2026-10-15T05:00:00.000Z',
};

export const participantRows = [
  { id: 'a1', booking_id: bookingRow.id, seq_no: 1, full_name: 'Budi Santoso', group_label: '5A' },
  { id: 'a2', booking_id: bookingRow.id, seq_no: 2, full_name: 'Ani Lestari', group_label: '5A' },
];
