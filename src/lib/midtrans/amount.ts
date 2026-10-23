// docs/Security.md §3.3 step 9: Midtrans writes amounts as strings with two decimals ("1250000.00"). Rupiah has no
// cents, so the amount matches only as a whole number equal to ours, in IDR; "1250000.50" matches nothing. Mirrored by
// internal.midtrans_amount_matches, which checks again before anything is applied.

const WHOLE_RUPIAH = /^(\d{1,15})(?:\.0{1,2})?$/;

export function isSameAmount(raw: string, currency: string, expected: number): boolean {
  const whole = WHOLE_RUPIAH.exec(raw)?.[1];
  return currency === 'IDR' && whole !== undefined && Number(whole) === expected;
}
