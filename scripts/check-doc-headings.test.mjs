import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { duplicateHeadings } from './check-doc-headings.mjs';

describe('duplicateHeadings', () => {
  it('names a section heading that appears twice', () => {
    expect(duplicateHeadings('# T\n## 1. A\ntext\n## 2. B\n## 1. A\n')).toEqual(['## 1. A']);
  });

  it('leaves alone distinct sections and deeper headings that repeat', () => {
    expect(duplicateHeadings('## 1. A\n### Notes\n## 2. B\n### Notes\n')).toEqual([]);
  });

  it('finds none in the documents as they are', () => {
    const names = readdirSync('docs').filter((name) => name.endsWith('.md'));
    for (const name of names) {
      expect(duplicateHeadings(readFileSync(`docs/${name}`, 'utf8')), name).toEqual([]);
    }
  });
});
