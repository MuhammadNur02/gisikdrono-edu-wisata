// Without this, a visitor typing "%" in a search box would match every row of an ilike query.
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}
