// Mirrors the bookings.pic_phone CHECK: Indonesian numbers in E.164, +62 then 8 to 13 digits.
export const PHONE_PATTERN = /^\+62[0-9]{8,13}$/;

const COUNTRY_CODE = '62';
const E164_PREFIX = `+${COUNTRY_CODE}`;
const MASK = '••••';
const AREA_DIGITS = 3;
const MIDDLE_DIGITS = 4;
const VISIBLE_TAIL_DIGITS = 4;

// What people type: '0812-3456-7890', '812 3456 7890', '62812…' or '+62 812…'. Returns the E.164 form,
// or null when it cannot be an Indonesian number.
export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  // A number written with another country code is not Indonesian, however its digits look.
  if (trimmed.startsWith('+') && !trimmed.replace(/[\s()-]/g, '').startsWith(E164_PREFIX)) {
    return null;
  }
  let digits = trimmed.replace(/\D/g, '');
  if (digits.startsWith(COUNTRY_CODE)) digits = digits.slice(COUNTRY_CODE.length);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  // After the country code an Indonesian number never starts with 0 ('0062…' or '+62 0812…').
  if (digits.startsWith('0')) return null;
  const phone = `${E164_PREFIX}${digits}`;
  return PHONE_PATTERN.test(phone) ? phone : null;
}

// The digits after +62, which the PhoneInput shows next to its fixed +62 chip.
export function localDigits(phone: string): string {
  return phone.startsWith(E164_PREFIX) ? phone.slice(E164_PREFIX.length) : phone.replace(/\D/g, '');
}

function splitLocal(phone: string): [string, string, string] {
  const local = localDigits(phone);
  return [
    local.slice(0, AREA_DIGITS),
    local.slice(AREA_DIGITS, AREA_DIGITS + MIDDLE_DIGITS),
    local.slice(AREA_DIGITS + MIDDLE_DIGITS),
  ];
}

// '+6281234567890' -> '+62 812-3456-7890'
export function formatPhone(phone: string): string {
  const [area, middle, tail] = splitLocal(phone);
  return `${E164_PREFIX} ${[area, middle, tail].filter(Boolean).join('-')}`;
}

// Staff lists never show the whole number: '+62 812-••••-7890' (docs/StyleGuide.md §6.10).
export function maskPhone(phone: string): string {
  const [area] = splitLocal(phone);
  return `${E164_PREFIX} ${area}-${MASK}-${lastFourDigits(phone)}`;
}

// Manual check-in and participant PDFs ask for these four digits as a second factor.
export function lastFourDigits(phone: string): string {
  return localDigits(phone).slice(-VISIBLE_TAIL_DIGITS);
}
