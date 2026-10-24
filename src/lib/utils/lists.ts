// Two items join with `dan` alone, without a comma.
const PAIR = 2;

// An Indonesian list: `A dan B`, `A, B, dan C` (the serial comma, as PUEBI writes it).
export function joinWithAnd(items: readonly string[]): string {
  if (items.length <= 1) return items.join('');
  const head = items.slice(0, -1);
  const last = items.at(-1) ?? '';
  return items.length === PAIR ? `${head.join('')} dan ${last}` : `${head.join(', ')}, dan ${last}`;
}
