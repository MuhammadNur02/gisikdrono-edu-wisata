import { Inter, Plus_Jakarta_Sans } from 'next/font/google';

// Both families are variable fonts, so one file each covers every weight docs/StyleGuide.md §3.1 permits
// (Inter 400-600, Plus Jakarta Sans 600-800); naming weights here would split them into static files.
export const fontSans = Inter({ subsets: ['latin'], display: 'swap', variable: '--font-inter' });

export const fontDisplay = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plus-jakarta',
});

export const fontClassNames = `${fontSans.variable} ${fontDisplay.variable}`;
