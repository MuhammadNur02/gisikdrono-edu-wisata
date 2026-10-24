'use client';

import { Check, Link2, Share2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { Button, type ButtonProps } from '@/components/ui/button';
import { catalogueUiCopy } from '@/lib/copy/catalogue-ui';

// DESIGN-SPEC §4 (Artikel detail, Copy link): the confirmation shows for 2.4 s.
const CONFIRMATION_MS = 2400;

export interface ShareButtonProps {
  // The page's title, handed to the phone's share sheet.
  title: string;
  // `share` opens the phone's share sheet where there is one and copies the link elsewhere; `copy` always copies.
  mode?: 'share' | 'copy';
  // `icon` is the 44 px round button of the article's contents column, named for screen readers only.
  appearance?: 'label' | 'icon';
  variant?: ButtonProps['variant'];
  className?: string;
}

async function shareOrCopy(title: string, mode: 'share' | 'copy'): Promise<boolean> {
  const url = window.location.href;
  if (mode === 'share' && typeof navigator.share === 'function') {
    await navigator.share({ title, url }).catch(() => undefined);
    return false;
  }
  await navigator.clipboard.writeText(url);
  return true;
}

function useConfirmation(): [boolean, () => void] {
  const [isShown, setShown] = useState(false);
  useEffect(() => {
    if (!isShown) return undefined;
    const timer = window.setTimeout(() => {
      setShown(false);
    }, CONFIRMATION_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [isShown]);
  return [
    isShown,
    () => {
      setShown(true);
    },
  ];
}

function iconFor(mode: 'share' | 'copy', isCopied: boolean) {
  if (isCopied) return Check;
  return mode === 'share' ? Share2 : Link2;
}

// `Tautan disalin`: read out politely, and shown under the button for 2.4 s, rising 8 px as it appears.
function CopiedNotice({ isShown }: { isShown: boolean }) {
  return (
    <>
      <span role="status" className="sr-only">
        {isShown ? catalogueUiCopy.linkCopied : ''}
      </span>
      {isShown ? (
        <span
          aria-hidden
          className="absolute top-full left-0 z-10 mt-2 rounded-md bg-secondary px-2.5 py-1.5 text-caption whitespace-nowrap text-secondary-foreground shadow-md motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2"
        >
          {catalogueUiCopy.linkCopied}
        </span>
      ) : null}
    </>
  );
}

// `Bagikan` and `Salin tautan` (DESIGN-SPEC §3.5, §3.8): the page's own address, nothing else. The confirmation is
// read out politely and the icon turns into a check while it shows.
export function ShareButton({
  title,
  mode = 'share',
  appearance = 'label',
  variant = 'ghost',
  className,
}: ShareButtonProps) {
  const [isCopied, confirm] = useConfirmation();
  const label = mode === 'share' ? catalogueUiCopy.share : catalogueUiCopy.copyLink;
  const Icon = iconFor(mode, isCopied);
  const onClick = () => {
    void shareOrCopy(title, mode).then(
      (didCopy) => {
        if (didCopy) confirm();
      },
      () => undefined,
    );
  };
  return (
    <span className="relative inline-flex">
      <Button
        type="button"
        variant={variant}
        size={appearance === 'icon' ? 'icon' : 'default'}
        onClick={onClick}
        aria-label={appearance === 'icon' ? label : undefined}
        className={className}
      >
        {appearance === 'label' ? label : null}
        <Icon aria-hidden />
      </Button>
      <CopiedNotice isShown={isCopied} />
    </span>
  );
}
