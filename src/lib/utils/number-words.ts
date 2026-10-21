// The Indonesian words for the small counts the copy spells out (`tiga kampung`), as PUEBI asks for a number one
// word can say; anything larger stays in digits.
const COUNT_WORDS = [
  'nol',
  'satu',
  'dua',
  'tiga',
  'empat',
  'lima',
  'enam',
  'tujuh',
  'delapan',
  'sembilan',
  'sepuluh',
];

export function countWord(count: number): string {
  return COUNT_WORDS[count] ?? String(count);
}

// For a count that opens a sentence or a heading: `Tiga kampung`.
export function countWordAtStart(count: number): string {
  const word = countWord(count);
  return word.charAt(0).toUpperCase() + word.slice(1);
}
