'use client';

import type * as React from 'react';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer';
import { MEDIA_MD_UP, useMediaQuery } from '@/hooks/use-media-query';
import { cn } from '@/lib/utils/cn';

export interface ResponsiveDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  footer?: React.ReactNode;
  // Forms get the wider sm:max-w-xl; everything else sm:max-w-lg (docs/StyleGuide.md §5.3).
  size?: 'default' | 'form';
  children: React.ReactNode;
}

// Without a description Radix and vaul expect aria-describedby to be switched off explicitly.
function describedBy(description: string | undefined) {
  return description ? {} : { 'aria-describedby': undefined };
}

function DesktopDialog({
  open,
  onOpenChange,
  title,
  description,
  footer,
  size,
  children,
}: ResponsiveDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        {...describedBy(description)}
        className={cn(
          'max-h-5/6 grid-rows-[auto_1fr_auto]',
          size === 'form' ? 'sm:max-w-xl' : 'sm:max-w-lg',
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="-mx-6 overflow-y-auto px-6">{children}</div>
        {footer && <DialogFooter>{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}

function MobileDrawer({
  open,
  onOpenChange,
  title,
  description,
  footer,
  children,
}: ResponsiveDialogProps) {
  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent {...describedBy(description)}>
        <DrawerHeader>
          <DrawerTitle>{title}</DrawerTitle>
          {description && <DrawerDescription>{description}</DrawerDescription>}
        </DrawerHeader>
        <div className="overflow-y-auto px-4">{children}</div>
        {footer && <DrawerFooter>{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  );
}

// One API for both: a centred Dialog from md up, a bottom Drawer below it. Both trap and restore focus.
function ResponsiveDialog(props: ResponsiveDialogProps) {
  const isDesktop = useMediaQuery(MEDIA_MD_UP);
  return isDesktop ? <DesktopDialog {...props} /> : <MobileDrawer {...props} />;
}

export { ResponsiveDialog };
