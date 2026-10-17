import type { Metadata } from 'next';

import { siteConfig } from '@/config/site';

// docs/PRD.md FR-PUB-22: every page title reads `<page> | Edu Wisata Gisikdrono`.
export const TITLE_TEMPLATE = `%s | ${siteConfig.name}`;

const OPEN_GRAPH_DEFAULTS = {
  type: 'website',
  locale: 'id_ID',
  siteName: siteConfig.name,
} as const;

export function absoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}

export const rootMetadata: Metadata = {
  metadataBase: new URL(siteConfig.url),
  title: { default: siteConfig.name, template: TITLE_TEMPLATE },
  applicationName: siteConfig.name,
  openGraph: OPEN_GRAPH_DEFAULTS,
};

export interface PageMetadataInput {
  title: string;
  description?: string;
  // Site-relative path of the page; metadataBase turns it into the absolute canonical URL.
  path: string;
}

// Next.js replaces a parent's openGraph object instead of merging it, so the defaults travel along.
export function buildPageMetadata({ title, description, path }: PageMetadataInput): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { ...OPEN_GRAPH_DEFAULTS, title, description, url: path },
  };
}
