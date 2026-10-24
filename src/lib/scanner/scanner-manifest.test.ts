import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { BRAND_HEX } from '@/config/brand';
import { SCANNER_PATH } from '@/config/dashboard';
import { SCANNER_MANIFEST_PATH } from '@/config/scanner';
import { siteConfig } from '@/config/site';

// Task P4.4.03: public/scanner.webmanifest is a static file, so this keeps it equal to the app's own names and colours.
const publicFile = (path: string) =>
  fileURLToPath(new URL(`../../../public${path}`, import.meta.url));

const manifestSchema = z.object({
  id: z.string(),
  name: z.string(),
  start_url: z.string(),
  scope: z.string(),
  display: z.literal('standalone'),
  background_color: z.string(),
  theme_color: z.string(),
  icons: z.array(z.object({ src: z.string(), sizes: z.string(), purpose: z.string() })),
});

describe('the scanner manifest', () => {
  const manifest = manifestSchema.parse(
    JSON.parse(readFileSync(publicFile(SCANNER_MANIFEST_PATH), 'utf8')),
  );

  it('installs the scanner, under the site name and colours', () => {
    expect(manifest.id).toBe(SCANNER_PATH);
    expect(manifest.start_url).toBe(SCANNER_PATH);
    expect(SCANNER_PATH.startsWith(manifest.scope)).toBe(true);
    expect(manifest.name).toContain(siteConfig.name);
    expect(manifest.background_color).toBe(BRAND_HEX.background);
    expect(manifest.theme_color).toBe(BRAND_HEX.deep);
  });

  it('names icons that exist, including a maskable one', () => {
    for (const icon of manifest.icons)
      expect(existsSync(publicFile(icon.src)), icon.src).toBe(true);
    expect(manifest.icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
  });
});
