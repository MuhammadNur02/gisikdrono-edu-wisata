'use client';

import { FileCheck2, Upload } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { ACCEPTED_IMAGE_TYPES, BOOKLET_PDF_TYPE } from '@/config/uploads';
import { financeCopy } from '@/lib/copy/finance';
import { uploadToQuarantine } from '@/lib/uploads/upload-client';
import { UploadRejectedError } from '@/lib/uploads/upload-error';

// A payout's proof or an adjustment's evidence (Task P4.7.02, P4.7.04; docs/Security.md §8.4). The file goes to
// uploads-quarantine through api/uploads/sign as any kelurahan-level upload; the form then carries only the quarantine
// path, and the action has the server check the bytes and move the file into the private documents bucket.

const ACCEPT = [BOOKLET_PDF_TYPE, ...ACCEPTED_IMAGE_TYPES].join(',');
const text = financeCopy.upload;

export interface EvidenceFieldProps {
  label: string;
  // The quarantine path once uploaded, for the form's hidden field.
  onUploaded: (path: string) => void;
  error?: string | undefined;
}

interface UploadState {
  busy: boolean;
  name: string | null;
  failure: string | null;
}

function useEvidenceUpload(onUploaded: (path: string) => void) {
  const [state, setState] = useState<UploadState>({ busy: false, name: null, failure: null });
  async function upload(file: File) {
    setState({ busy: true, name: null, failure: null });
    try {
      onUploaded(await uploadToQuarantine(file, null));
      setState({ busy: false, name: file.name, failure: null });
    } catch (caught) {
      const failure = caught instanceof UploadRejectedError ? caught.message : text.required;
      setState({ busy: false, name: null, failure });
    }
  }
  return { state, upload };
}

function UploadedName({ name }: { name: string | null }) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-1 text-body-sm text-muted-foreground" aria-live="polite">
      <FileCheck2 aria-hidden className="size-4" />
      {text.uploaded(name)}
    </span>
  );
}

export function EvidenceField({ label, onUploaded, error }: EvidenceFieldProps) {
  const inputId = useId();
  const { state, upload } = useEvidenceUpload(onUploaded);
  const message = state.failure ?? error;
  return (
    <div className="space-y-2">
      <label htmlFor={inputId} className="text-body-sm font-medium">
        {label}
      </label>
      <div className="flex flex-wrap items-center gap-3">
        <Button asChild variant="outline" className="min-h-11" disabled={state.busy}>
          <label htmlFor={inputId} className="cursor-pointer">
            <Upload aria-hidden />
            {state.busy ? text.uploading : text.choose}
          </label>
        </Button>
        <UploadedName name={state.name} />
      </div>
      <input
        id={inputId}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        aria-invalid={message ? true : undefined}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void upload(file);
        }}
      />
      {message ? (
        <p className="text-body-sm text-destructive" role="alert">
          {message}
        </p>
      ) : null}
    </div>
  );
}
