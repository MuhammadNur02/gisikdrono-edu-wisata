import { describe, expect, it } from 'vitest';

import { copy } from '@/lib/copy/id';
import {
  freeTextSchema,
  isSafeFreeText,
  optionalFreeTextSchema,
} from '@/lib/validations/free-text';

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

  it.each([
    'Ani Lestari, S.Pd.',
    'Budi S.Si',
    'Dra. Rina M.Sc',
    'Univ.Diponegoro',
    'DRA. RINA M.SC',
    'Siti, S.Pd.I',
    'Dr.Budi Santoso',
    'Ir. Joko, M.T',
    'SMA St.Louis',
  ])('lets Indonesian academic titles through, whatever their case: %s', (value) => {
    expect(isSafeFreeText(value)).toBe(true);
  });

  it.each(['gisik-bayar.top', 'univ.gisik-bayar.top', 's.pd.com', 'S.Si/bayar', 'Dr.evil.com'])(
    'still refuses a host dressed up as a title: %s',
    (value) => {
      expect(isSafeFreeText(value)).toBe(false);
    },
  );
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

  it('says what the form asks for when the text is missing or too long', () => {
    const schema = freeTextSchema(4, { required: 'Isi nama.', tooLong: 'Terlalu panjang.' });
    expect(schema.safeParse(' ').error?.issues[0]?.message).toBe('Isi nama.');
    expect(schema.safeParse('Budiman').error?.issues[0]?.message).toBe('Terlalu panjang.');
  });
});

describe('optionalFreeTextSchema', () => {
  const schema = optionalFreeTextSchema(20, { tooLong: 'Terlalu panjang.' });

  it('turns a field left out, blank or null into null, and parses null again', () => {
    expect(schema.parse(undefined)).toBeNull();
    expect(schema.parse('   ')).toBeNull();
    expect(schema.parse(null)).toBeNull();
    expect(schema.parse('  Tanpa kacang ')).toBe('Tanpa kacang');
  });

  it('refuses a link or a number as freeTextSchema does, and text past its length', () => {
    expect(schema.safeParse('wa.me/628123').error?.issues[0]?.message).toBe(
      copy.validation.freeText,
    );
    expect(schema.safeParse('a'.repeat(21)).error?.issues[0]?.message).toBe('Terlalu panjang.');
  });
});
