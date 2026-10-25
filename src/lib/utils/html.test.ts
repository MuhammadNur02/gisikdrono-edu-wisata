import { describe, expect, it } from 'vitest';

import { escapeHtml } from '@/lib/utils/html';

describe('escapeHtml', () => {
  it('escapes the characters that would open markup or an attribute', () => {
    expect(escapeHtml(`<img src=x onerror="a('b')">&`)).toBe(
      '&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;',
    );
  });

  it('leaves plain text alone', () => {
    expect(escapeHtml('RW 05 · Ecowastreme')).toBe('RW 05 · Ecowastreme');
  });
});
