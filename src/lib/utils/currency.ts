// CLAUDE.md §7.1: money is integer rupiah everywhere, so formatting refuses anything else.
const rupiah = new Intl.NumberFormat('id-ID', {
  style: 'currency',
  currency: 'IDR',
  maximumFractionDigits: 0,
});

const thousands = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 0 });

function assertWholeRupiah(amount: number): void {
  if (!Number.isSafeInteger(amount)) {
    throw new RangeError('Money must be a whole number of rupiah.');
  }
}

// formatIDR(25000) === 'Rp 25.000' (a non-breaking space after Rp, as Intl writes it).
export function formatIDR(amount: number): string {
  assertWholeRupiah(amount);
  return rupiah.format(amount);
}

// The digits a MoneyInput shows while typing: 2500000 -> '2.500.000'.
export function formatThousands(amount: number): string {
  assertWholeRupiah(amount);
  return thousands.format(amount);
}

// Reads what someone typed into a MoneyInput ('Rp 2.500.000', '2500000') back into rupiah.
// Returns null for an empty field or a number too large to be money.
export function parseRupiah(input: string): number | null {
  const digits = input.replace(/\D/g, '');
  if (digits === '') return null;
  const amount = Number(digits);
  return Number.isSafeInteger(amount) ? amount : null;
}
