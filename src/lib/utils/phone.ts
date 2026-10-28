// Mirrors the bookings.pic_phone CHECK: Indonesian numbers in E.164, +62 then 8 to 13 digits.
export const PHONE_PATTERN = /^\+62[0-9]{8,13}$/;
// Any number in E.164 (a country code that does not start with 0, 8 to 15 digits in all), which an officer may enter
// for a group from abroad (Task P4.3.10; the bookings.pic_phone CHECK for channel = 'admin').
export const INTERNATIONAL_PHONE_PATTERN = /^\+[1-9][0-9]{7,14}$/;
// Indonesian mobile numbers, the only ones WhatsApp reaches: +62 8 and 7 to 11 more digits.
export const MOBILE_PHONE_PATTERN = /^\+628\d{7,11}$/;

const COUNTRY_CODE = '62';
const E164_PREFIX = `+${COUNTRY_CODE}`;
const MASK = '••••';
const AREA_DIGITS = 3;
const MIDDLE_DIGITS = 4;
const VISIBLE_TAIL_DIGITS = 4;
// The calling codes of one and two digits (ITU-T E.164 zone 1 and 7, and the two-digit codes); every other code has
// three. Enough to show a number's country without its subscriber digits.
const ONE_DIGIT_CODES: ReadonlySet<string> = new Set(['1', '7']);
const TWO_DIGIT_CODES: ReadonlySet<string> = new Set([
  '20',
  '27',
  '30',
  '31',
  '32',
  '33',
  '34',
  '36',
  '39',
  '40',
  '41',
  '43',
  '44',
  '45',
  '46',
  '47',
  '48',
  '49',
  '51',
  '52',
  '53',
  '54',
  '55',
  '56',
  '57',
  '58',
  '60',
  '61',
  '62',
  '63',
  '64',
  '65',
  '66',
  '81',
  '82',
  '84',
  '86',
  '90',
  '91',
  '92',
  '93',
  '94',
  '95',
  '98',
]);
const MIN_TAIL_DIGITS = 1;
const TWO_DIGITS = 2;
const THREE_DIGITS = 3;
const HALF = 2;

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

const isIndonesian = (phone: string) => phone.startsWith(E164_PREFIX);

// '+6281234567890' -> '+62 812-3456-7890'; a number from abroad stays as written in E.164.
export function formatPhone(phone: string): string {
  if (!isIndonesian(phone)) return phone;
  const [area, middle, tail] = splitLocal(phone);
  return `${E164_PREFIX} ${[area, middle, tail].filter(Boolean).join('-')}`;
}

function callingCodeOf(digits: string): string {
  const [one, two, three] = [1, TWO_DIGITS, THREE_DIGITS].map((length) => digits.slice(0, length));
  if (one !== undefined && ONE_DIGIT_CODES.has(one)) return one;
  if (two !== undefined && TWO_DIGIT_CODES.has(two)) return two;
  return three ?? '';
}

// A number from abroad shows its country code and its last digits, up to four and never more than half of them all:
// '+44 ••••0123', '+353 ••••78' (review of PR #91, L7).
function maskForeignPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  const code = callingCodeOf(digits);
  const room = Math.floor(digits.length / HALF) - code.length;
  const tail = Math.max(MIN_TAIL_DIGITS, Math.min(VISIBLE_TAIL_DIGITS, room));
  return `+${code} ${MASK}${digits.slice(-tail)}`;
}

// Staff lists never show the whole number: '+62 812-••••-7890' (docs/StyleGuide.md §6.10), or a number from abroad as
// maskForeignPhone writes it.
export function maskPhone(phone: string): string {
  if (!isIndonesian(phone)) return maskForeignPhone(phone);
  const [area] = splitLocal(phone);
  return `${E164_PREFIX} ${area}-${MASK}-${lastFourDigits(phone)}`;
}

// Manual check-in and participant PDFs ask for these four digits as a second factor.
export function lastFourDigits(phone: string): string {
  return localDigits(phone).slice(-VISIBLE_TAIL_DIGITS);
}
