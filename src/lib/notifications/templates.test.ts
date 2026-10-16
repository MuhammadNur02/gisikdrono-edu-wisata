import { describe, expect, it } from 'vitest';
import { ZodError } from 'zod';

import { DB_ENUMS } from '@/db/enums';
import { parseTemplateParams, templateParamsSchemas } from '@/lib/notifications/templates';

const bookingCreated = {
  name: 'Budi',
  booking_code: 'GSK-7F3K9Q2M',
  package: 'Eduwisata Ecowastreme',
  date: '2026-11-02',
  session: 'Sesi 08.00-10.00 WIB',
  pax: 40,
  total: 1_000_000,
  deadline: '2026-10-17T10:00:00+07:00',
};

describe('templateParamsSchemas', () => {
  it('types the parameters of every notification template', () => {
    expect(Object.keys(templateParamsSchemas).sort()).toEqual(
      [...DB_ENUMS.notification_template].sort(),
    );
  });
});

describe('parseTemplateParams', () => {
  it('accepts the parameters a template expects', () => {
    expect(parseTemplateParams('booking_created', bookingCreated)).toEqual(bookingCreated);
    expect(
      parseTemplateParams('security_alert', {
        severity: 'critical',
        rule: 'pii_reveal_cap',
        time: '2026-10-16T21:00:00+07:00',
      }),
    ).toMatchObject({ severity: 'critical' });
  });

  it('refuses free text that carries a link, a host or a phone number', () => {
    for (const name of ['klik evil.shop', 'buka 103.20.1.5', 'Budi 0812-3456-7890']) {
      expect(() => parseTemplateParams('review_invite', { name })).toThrow(ZodError);
    }
  });

  it('refuses parameters the template does not have', () => {
    expect(() =>
      parseTemplateParams('review_invite', { name: 'Budi', link: 'https://gisikdrono.example' }),
    ).toThrow(ZodError);
  });

  it('holds codes, amounts and alerts to their exact shapes', () => {
    expect(() =>
      parseTemplateParams('booking_cancelled', { name: 'Budi', booking_code: 'GSK-0812345' }),
    ).toThrow(ZodError);
    expect(() =>
      parseTemplateParams('refund_processed', {
        name: 'Budi',
        booking_code: 'GSK-7F3K9Q2M',
        amount: 1000.5,
      }),
    ).toThrow(ZodError);
    expect(() =>
      parseTemplateParams('admin_booking_needs_review', {
        booking_code: 'GSK-7F3K9Q2M',
        reason: 'hubungi 0812-3456-7890',
      }),
    ).toThrow(ZodError);
  });
});
