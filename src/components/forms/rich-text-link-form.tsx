'use client';

import type { Editor } from '@tiptap/react';
import { useId, useState } from 'react';
import type * as React from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { copy } from '@/lib/copy/id';
import { isAllowedArticleLink } from '@/lib/rich-text/document';
import { cn } from '@/lib/utils/cn';

function currentHref(editor: Editor): string {
  const href: unknown = editor.getAttributes('link').href;
  return typeof href === 'string' ? href : '';
}

// Only https, http and mailto are accepted, the same rule the renderer holds every stored link to
// (src/lib/rich-text/document.ts).
function useLinkDraft(editor: Editor, onDone: () => void) {
  const [href, setHref] = useState(() => currentHref(editor));
  const [isInvalid, setIsInvalid] = useState(false);

  function apply() {
    const trimmed = href.trim();
    if (!isAllowedArticleLink(trimmed)) {
      setIsInvalid(true);
      return;
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: trimmed }).run();
    onDone();
  }

  function remove() {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    onDone();
  }

  function edit(value: string) {
    setHref(value);
    setIsInvalid(false);
  }

  return { href, isInvalid, apply, remove, edit };
}

function LinkHint({ id, isInvalid }: { id: string; isInvalid: boolean }) {
  return (
    <p
      id={id}
      className={cn('text-caption', isInvalid ? 'text-destructive' : 'text-muted-foreground')}
    >
      {isInvalid ? copy.forms.richText.linkInvalid : copy.forms.richText.linkHint}
    </p>
  );
}

// Sets or removes the link on the selected text.
export function RichTextLinkForm({ editor, onDone }: { editor: Editor; onDone: () => void }) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const draft = useLinkDraft(editor, onDone);

  // Enter applies the link instead of submitting the article form around the editor.
  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    draft.apply();
  }

  return (
    <div className="grid gap-2 border-b border-border p-3">
      <Label htmlFor={inputId}>{copy.forms.richText.linkLabel}</Label>
      <Input
        id={inputId}
        type="url"
        inputMode="url"
        value={draft.href}
        aria-invalid={draft.isInvalid}
        aria-describedby={hintId}
        onChange={(event) => {
          draft.edit(event.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      <LinkHint id={hintId} isInvalid={draft.isInvalid} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={draft.apply}>
          {copy.forms.richText.linkApply}
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={draft.remove}>
          {copy.forms.richText.linkRemove}
        </Button>
      </div>
    </div>
  );
}
