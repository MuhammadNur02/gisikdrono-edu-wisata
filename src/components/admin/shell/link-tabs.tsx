import Link from 'next/link';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.5 pill tabs, as links: each tab is its own address (`?tab=`), rendered on the server, so a page
// whose panels are server-rendered ships no tabs script (admin first-load budget). The look matches the pill variant
// of src/components/ui/tabs.tsx.

export interface LinkTab {
  value: string;
  label: string;
  href: string;
}

const LIST_CLASS = 'inline-flex w-fit items-center gap-1 rounded-xl bg-muted p-1';
const TAB_CLASS =
  'inline-flex h-10 items-center justify-center rounded-lg px-3 text-body-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring max-md:min-h-11';
const ACTIVE_CLASS = 'bg-background text-foreground shadow-sm';

export function LinkTabs({
  tabs,
  active,
  label,
}: {
  tabs: readonly LinkTab[];
  active: string;
  label: string;
}) {
  return (
    <nav aria-label={label}>
      <ul className={LIST_CLASS}>
        {tabs.map((tab) => (
          <li key={tab.value}>
            <Link
              href={tab.href}
              replace
              scroll={false}
              aria-current={tab.value === active ? 'page' : undefined}
              className={cn(TAB_CLASS, tab.value === active && ACTIVE_CLASS)}
            >
              {tab.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
