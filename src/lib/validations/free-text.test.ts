import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import { freeTextSchema, isSafeFreeText } from '@/lib/validations/free-text';

describe('isSafeFreeText', () => {
  it.each([
    'Budi',
    'SD Negeri 01 Gisikdrono',
    'Univ. Diponegoro',
    'Sesi 08.00-10.00 WIB',
    'Rp 1.250.000',
    'Gerbang RW 05',
  ])('lets ordinary text through: %s', (value) => {
    expect(isSafeFreeText(value)).toBe(true);
  });

  it.each([
    'buka https://gisikdrono.example',
    'javascript:alert(1)',
    'www.contoh',
    'bayar di gisik-bayar.top',
    'transfer ke 103.20.1.5',
    'kirim ke ani@example.test',
    'hubungi 0812-3456-7890',
    'WA +62 812 3456 7890',
    'nomor 628123456789',
    'kode 12345678',
  ])('refuses a link, host, address or number: %s', (value) => {
    expect(isSafeFreeText(value)).toBe(false);
  });
});

describe('freeTextSchema', () => {
  it('trims and keeps the text within its length', () => {
    expect(freeTextSchema(10).parse('  Budi  ')).toBe('Budi');
    expect(freeTextSchema(3).safeParse('Budi').success).toBe(false);
    expect(freeTextSchema(10).safeParse('   ').success).toBe(false);
  });

  it('explains a refusal in friendly Indonesian', () => {
    const parsed = freeTextSchema(60).safeParse('bayar di gisik-bayar.top');
    expect(parsed.error?.issues[0]?.message).toBe(copy.validation.freeText);
  });
});
