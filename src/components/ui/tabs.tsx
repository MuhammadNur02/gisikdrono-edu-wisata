'use client';

import { cva } from 'class-variance-authority';
import { Tabs as TabsPrimitive } from 'radix-ui';
import * as React from 'react';

import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §5.5: underline tabs on the public site, pill tabs for admin filters.
type TabsVariant = 'underline' | 'pill';

const TabsVariantContext = React.createContext<TabsVariant>('underline');

const tabsListVariants = cva('inline-flex w-fit items-center', {
  variants: {
    variant: {
      underline: 'gap-4 border-b border-border',
      pill: 'gap-1 rounded-xl bg-muted p-1',
    },
  },
});

const tabsTriggerVariants = cva(
  'relative inline-flex h-10 items-center justify-center gap-2 text-body-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground disabled:pointer-events-none disabled:opacity-50 data-[state=active]:text-foreground max-md:min-h-11 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        underline:
          'px-1 after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary after:opacity-0 after:transition-opacity after:duration-200 data-[state=active]:after:opacity-100',
        pill: 'rounded-lg px-3 data-[state=active]:bg-background data-[state=active]:shadow-sm',
      },
    },
  },
);

function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col gap-4', className)}
      {...props}
    />
  );
}

export interface TabsListProps extends React.ComponentProps<typeof TabsPrimitive.List> {
  variant?: TabsVariant;
}

function TabsList({ className, variant = 'underline', ...props }: TabsListProps) {
  return (
    <TabsVariantContext.Provider value={variant}>
      <TabsPrimitive.List
        data-slot="tabs-list"
        data-variant={variant}
        className={cn(tabsListVariants({ variant }), className)}
        {...props}
      />
    </TabsVariantContext.Provider>
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const variant = React.useContext(TabsVariantContext);
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(tabsTriggerVariants({ variant }), className)}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('flex-1', className)}
      {...props}
    />
  );
}

export { Tabs, TabsContent, TabsList, TabsTrigger };
