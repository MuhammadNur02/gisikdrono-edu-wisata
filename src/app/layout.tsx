import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { fontClassNames } from '@/config/fonts';
import { siteConfig } from '@/config/site';

import '@/styles/globals.css';

export const metadata: Metadata = {
  title: {
    default: siteConfig.name,
    template: `%s | ${siteConfig.name}`,
  },
};

export default function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="id" className={fontClassNames}>
      <body>{children}</body>
    </html>
  );
}
