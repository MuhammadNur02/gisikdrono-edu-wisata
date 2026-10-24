// react-hook-form names a field of a field-array row `<list>.<index>.<key>` and types the index as a number; the
// template has to write it through String(), so the name is typed back here once instead of at every field.
export function rowFieldName<TList extends string, TKey extends string>(
  list: TList,
  index: number,
  key: TKey,
): `${TList}.${number}.${TKey}` {
  return `${list}.${String(index)}.${key}` as `${TList}.${number}.${TKey}`;
}
