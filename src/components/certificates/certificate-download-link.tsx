'use client';

import { Download } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { certificatesCopy } from '@/lib/copy/certificates';
import type { ActionResult } from '@/types/action-result';

const text = certificatesCopy.guest;

export type CertificateDownloadAction = (input: unknown) => Promise<ActionResult<{ url: string }>>;

interface DownloadProps {
  bookingCode: string;
  certificateId: string;
  number: string;
  action: CertificateDownloadAction;
}

// Task P4.5.03 (docs/Security.md §10.3): the server hands back a signed URL of 600 s, minted for this click, and the
// browser opens it at once; the URL is kept nowhere.
function useCertificateDownload({ bookingCode, certificateId, action }: DownloadProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const download = () => {
    setError(null);
    startTransition(async () => {
      const result = await action({ bookingCode, certificateId });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      window.location.assign(result.data.url);
    });
  };
  return { error, isPending, download };
}

export function CertificateDownloadButton(props: DownloadProps) {
  const { error, isPending, download } = useCertificateDownload(props);
  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        loading={isPending}
        aria-label={text.downloadLabel(props.number)}
        onClick={download}
      >
        <Download aria-hidden />
        {isPending ? text.downloading : text.download}
      </Button>
      {error && (
        <p role="alert" className="text-caption text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
