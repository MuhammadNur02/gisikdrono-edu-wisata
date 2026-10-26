'use client';

import { ExternalLink, FileSearch } from 'lucide-react';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { adjustmentsCopy } from '@/lib/copy/finance-adjustments';
import type { ActionResult } from '@/types/action-result';
import type { EvidenceKind, EvidenceLink as SignedEvidenceLink } from '@/types/finance';

const text = adjustmentsCopy.evidence;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

export interface EvidenceLinkProps {
  kind: EvidenceKind;
  id: string;
  viewAction: (values: unknown) => Promise<ActionResult<SignedEvidenceLink>>;
}

// The signed link, dropped once it would no longer work.
function useExpiringLink() {
  const [link, setLink] = useState<SignedEvidenceLink | null>(null);
  useEffect(() => {
    if (!link) return undefined;
    const timer = setTimeout(() => {
      setLink(null);
    }, link.expiresInSeconds * MS_PER_SECOND);
    return () => {
      clearTimeout(timer);
    };
  }, [link]);
  return [link, setLink] as const;
}

function OpenLink({ link }: { link: SignedEvidenceLink }) {
  return (
    <Button
      asChild
      size="sm"
      variant="link"
      title={text.expires(link.expiresInSeconds / SECONDS_PER_MINUTE)}
    >
      <a href={link.url} target="_blank" rel="noopener noreferrer">
        <ExternalLink aria-hidden />
        {text.open}
      </a>
    </Button>
  );
}

// Review of PR #80, M-3 (docs/Security.md §6.6): "Lihat bukti" asks the server for a 300 s link, the view recorded;
// the link then opens the file in a new tab and goes away when it would no longer work. It is never stored.
export function EvidenceLink({ kind, id, viewAction }: EvidenceLinkProps) {
  const [link, setLink] = useExpiringLink();
  const [isLoading, startLoading] = useTransition();
  if (link) return <OpenLink link={link} />;
  return (
    <Button
      type="button"
      size="sm"
      variant="link"
      loading={isLoading}
      onClick={() => {
        startLoading(async () => {
          const answer = await viewAction({ kind, id });
          if (!answer.ok) {
            toast.error(answer.error.message);
            return;
          }
          setLink(answer.data);
        });
      }}
    >
      <FileSearch aria-hidden />
      {text.view}
    </Button>
  );
}
