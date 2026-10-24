'use client';

import type { ReactNode } from 'react';

import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { MEDIA_MD_UP, useMediaQuery } from '@/hooks/use-media-query';

export interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
}

// docs/StyleGuide.md §5.3, §6.8: an editor as a Sheet from the right from md up and a bottom Drawer below it. The
// content mounts only while it is open, so each opening starts from the rows as they are now.
export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
}: ResponsiveSheetProps) {
  const isDesktop = useMediaQuery(MEDIA_MD_UP);
  if (isDesktop) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
          <SheetHeader className="border-b border-border">
            <SheetTitle>{title}</SheetTitle>
            {description ? <SheetDescription>{description}</SheetDescription> : null}
          </SheetHeader>
          <div className="p-4">{open ? children : null}</div>
        </SheetContent>
      </Sheet>
    );
  }
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent className="max-h-5/6">
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description ? <DrawerDescription>{description}</DrawerDescription> : null}
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-6">{open ? children : null}</div>
      </DrawerContent>
    </Drawer>
  );
}
