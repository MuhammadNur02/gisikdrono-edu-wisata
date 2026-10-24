import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { ZXING_WASM_SHA256 } from 'barcode-detector/ponyfill';
import { describe, expect, it } from 'vitest';

import { ZXING_WASM_PATH } from '@/config/scanner';

// Task P4.4.03: the scanner serves the ZXing reader from public/ instead of jsDelivr. A dependency update that moves
// zxing-wasm on fails here until the file is copied again from node_modules/zxing-wasm/dist/reader/.
describe('the self-hosted ZXing reader', () => {
  it('is the very build the barcode-detector ponyfill expects', () => {
    const file = fileURLToPath(new URL(`../../../public${ZXING_WASM_PATH}`, import.meta.url));
    const digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    expect(digest).toBe(ZXING_WASM_SHA256);
  });
});
