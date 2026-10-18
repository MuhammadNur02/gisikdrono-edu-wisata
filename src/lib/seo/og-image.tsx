import 'server-only';

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { ImageResponse } from 'next/og';

import { BRAND_HEX } from '@/config/brand';
import { OG_FONT_FILES, OG_FONT_WEIGHTS, OG_LAYOUT, OG_SIZE } from '@/config/og';
import { siteConfig } from '@/config/site';

// docs/StyleGuide.md §8.4: the shared layout of every Open Graph image, brand-deep with an ice accent bar, the
// eyebrow, the title, one line of detail, the site name bottom-left and its address bottom-right. A cover photo
// is left out: public-media keeps WebP, which the renderer does not draw.

export interface OgImageContent {
  // The RW or the category: `RW 05 · Pelajar`.
  eyebrow: string;
  title: string;
  // A price or a tagline.
  detail?: string;
}

async function loadFonts() {
  const [display, body] = await Promise.all([
    readFile(join(process.cwd(), OG_FONT_FILES.display)),
    readFile(join(process.cwd(), OG_FONT_FILES.body)),
  ]);
  return [
    {
      name: 'Plus Jakarta Sans',
      data: display,
      weight: OG_FONT_WEIGHTS.display,
      style: 'normal' as const,
    },
    { name: 'Inter', data: body, weight: OG_FONT_WEIGHTS.body, style: 'normal' as const },
  ];
}

function siteHost(): string {
  return new URL(siteConfig.url).host;
}

function OgHeading({ eyebrow, title, detail }: OgImageContent) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: OG_LAYOUT.gap }}>
      <div
        style={{
          fontSize: OG_LAYOUT.eyebrowSize,
          color: BRAND_HEX.ice,
          textTransform: 'uppercase',
        }}
      >
        {eyebrow}
      </div>
      <div
        style={{
          fontFamily: 'Plus Jakarta Sans',
          fontSize: OG_LAYOUT.titleSize,
          lineHeight: OG_LAYOUT.titleLineHeight,
          lineClamp: OG_LAYOUT.titleLines,
        }}
      >
        {title}
      </div>
      {detail ? (
        <div style={{ fontSize: OG_LAYOUT.detailSize, color: BRAND_HEX.ice }}>{detail}</div>
      ) : null}
    </div>
  );
}

function OgFooter() {
  return (
    <div
      style={{ display: 'flex', justifyContent: 'space-between', fontSize: OG_LAYOUT.footerSize }}
    >
      <div style={{ fontFamily: 'Plus Jakarta Sans' }}>{siteConfig.name}</div>
      <div style={{ color: BRAND_HEX.ice }}>{siteHost()}</div>
    </div>
  );
}

function OgCard(content: OgImageContent) {
  return (
    <div
      style={{ display: 'flex', width: '100%', height: '100%', backgroundColor: BRAND_HEX.deep }}
    >
      <div style={{ width: OG_LAYOUT.accentBarWidth, backgroundColor: BRAND_HEX.ice }} />
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flex: 1,
          padding: OG_LAYOUT.padding,
          color: BRAND_HEX.background,
          fontFamily: 'Inter',
        }}
      >
        <OgHeading {...content} />
        <OgFooter />
      </div>
    </div>
  );
}

export async function renderOgImage(content: OgImageContent): Promise<ImageResponse> {
  return new ImageResponse(<OgCard {...content} />, { ...OG_SIZE, fonts: await loadFonts() });
}
