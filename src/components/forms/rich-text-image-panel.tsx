'use client';

import { useId, useState } from 'react';

import { ImageUploader, type UploadImage } from '@/components/forms/image-uploader';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ARTICLE_IMAGE_CAPTION_MAX_LENGTH } from '@/config/rich-text';
import { ALT_TEXT_MIN_LENGTH } from '@/config/uploads';
import { copy } from '@/lib/copy/id';
import type { UploadedImage } from '@/types/forms';

export type ArticleImageInsert = UploadedImage & { caption: string };

interface RichTextImagePanelProps {
  upload: UploadImage;
  onInsert: (image: ArticleImageInsert) => void;
  onCancel: () => void;
}

function CaptionField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{copy.forms.richText.captionLabel}</Label>
      <Input
        id={id}
        required
        maxLength={ARTICLE_IMAGE_CAPTION_MAX_LENGTH}
        aria-describedby={hintId}
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
        }}
      />
      <p id={hintId} className="text-caption text-muted-foreground">
        {copy.forms.richText.captionHint}
      </p>
    </div>
  );
}

// The finished photo, or null while its alt text or caption is still missing.
function readyImage(image: UploadedImage | null, caption: string): ArticleImageInsert | null {
  const altText = image?.altText.trim() ?? '';
  const trimmedCaption = caption.trim();
  if (!image || altText.length < ALT_TEXT_MIN_LENGTH || trimmedCaption === '') return null;
  return { ...image, altText, caption: trimmedCaption };
}

// A photo goes into an article through the upload pipeline like any other, and only with the alt text and the
// caption the renderer requires (docs/StyleGuide.md §3.3); without both the insert button stays disabled.
export function RichTextImagePanel({ upload, onInsert, onCancel }: RichTextImagePanelProps) {
  const [image, setImage] = useState<UploadedImage | null>(null);
  const [caption, setCaption] = useState('');
  const ready = readyImage(image, caption);

  return (
    <div className="grid gap-3 border-b border-border p-3">
      <ImageUploader value={image} onChange={setImage} upload={upload} />
      {image && <CaptionField value={caption} onChange={setCaption} />}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          disabled={!ready}
          onClick={() => {
            if (ready) onInsert(ready);
          }}
        >
          {copy.forms.richText.insertImage}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          {copy.forms.richText.cancel}
        </Button>
      </div>
    </div>
  );
}
