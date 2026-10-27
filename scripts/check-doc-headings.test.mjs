import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { brokenMarkdown, duplicateHeadings } from './check-doc-headings.mjs';

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

const FENCE = '```';

describe('brokenMarkdown (delta review of PR #80, D-1)', () => {
  it('names an odd number of code fences', () => {
    expect(brokenMarkdown(['a', `${FENCE}sql`, 'select 1;', ''].join('\n'))).toEqual([
      '1 code fences, an odd number',
    ]);
  });

  it('names callback text and escaped backticks outside a code block, by line', () => {
    expect(brokenMarkdown(['ok', '() => "| row |"', '| \\`x\\` |', ''].join('\n'))).toEqual([
      'line 2: a callback "() =>" outside a code block',
      'line 3: an escaped backtick outside a code block',
    ]);
  });

  it('leaves code inside a block alone', () => {
    expect(brokenMarkdown([`${FENCE}ts`, 'const f = () => 1;', FENCE, ''].join('\n'))).toEqual([]);
  });

  it('finds nothing in the documents as they are', () => {
    const names = readdirSync('docs').filter((name) => name.endsWith('.md'));
    for (const path of [...names.map((name) => `docs/${name}`), 'CLAUDE.md']) {
      expect(brokenMarkdown(readFileSync(path, 'utf8')), path).toEqual([]);
    }
  });
});
