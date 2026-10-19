'use client';

import Image from '@tiptap/extension-image';
import { EditorContent, useEditor, type Editor, type JSONContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { useState } from 'react';

import type { UploadImage } from '@/components/forms/image-uploader';
import {
  RichTextImagePanel,
  type ArticleImageInsert,
} from '@/components/forms/rich-text-image-panel';
import { RichTextLinkForm } from '@/components/forms/rich-text-link-form';
import { RichTextToolbar, type RichTextPanel } from '@/components/forms/rich-text-toolbar';
import { ARTICLE_HEADING_LEVELS, ARTICLE_LINK_REL } from '@/config/rich-text';
import { copy } from '@/lib/copy/id';
import { publicMediaPathOf, publicMediaUrl } from '@/lib/images/public-media';
import { isAllowedArticleLink, isPublicMediaImagePath } from '@/lib/rich-text/document';
import { cn } from '@/lib/utils/cn';

// Task P2.9.03: the article editor. It offers exactly what src/components/articles/rich-text.tsx renders
// (paragraphs, headings 2–4, lists, quotes, bold, italic, https/http/mailto links, captioned public-media
// photos) and stores ProseMirror JSON in articles.body_json; HTML is never stored (CLAUDE.md §7.8). The
// renderer checks the stored document again, so this is the friendly half of the rule, not the control.

// An image keeps its public-media path in `src`, the shape the renderer allows. The editor shows it by URL and
// reads a pasted image back only when it is one of ours; any other pasted image is left out.
const ArticleImage = Image.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      src: {
        default: null,
        parseHTML: (element: HTMLElement) => publicMediaPathOf(element.getAttribute('src') ?? ''),
        renderHTML: (attributes: Record<string, unknown>) => ({
          src: typeof attributes.src === 'string' ? publicMediaUrl(attributes.src) : null,
        }),
      },
    };
  },
  parseHTML() {
    return [
      {
        tag: 'img[src]',
        getAttrs: (element: HTMLElement) => {
          const path = publicMediaPathOf(element.getAttribute('src') ?? '');
          return path !== null && isPublicMediaImagePath(path) ? null : false;
        },
      },
    ];
  },
});

const EXTENSIONS = [
  StarterKit.configure({
    heading: { levels: [...ARTICLE_HEADING_LEVELS] },
    code: false,
    codeBlock: false,
    horizontalRule: false,
    strike: false,
    underline: false,
    link: {
      openOnClick: false,
      defaultProtocol: 'https',
      isAllowedUri: (url) => isAllowedArticleLink(url),
      HTMLAttributes: { rel: ARTICLE_LINK_REL, target: null },
    },
  }),
  ArticleImage,
];

const FRAME_CLASS =
  'overflow-hidden rounded-xl border border-input bg-background has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring has-[:focus-visible]:ring-offset-2';
const CONTENT_CLASS =
  'prose max-w-none min-h-64 px-4 py-3 prose-slate dark:prose-invert focus-visible:outline-none';

export interface RichTextEditorProps {
  // articles.body_json as Tiptap reads it; the editor reports every change as the whole document.
  value: JSONContent;
  onChange: (document: JSONContent) => void;
  // Usually createImageUpload({ rwId, purpose: 'article', entityId }) from src/lib/uploads/upload-client.ts.
  uploadImage: UploadImage;
  'aria-labelledby'?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

function contentAttributes(props: RichTextEditorProps): Record<string, string> {
  const labelled = props['aria-labelledby'];
  return {
    role: 'textbox',
    'aria-multiline': 'true',
    ...(labelled
      ? { 'aria-labelledby': labelled }
      : { 'aria-label': copy.forms.richText.editorLabel }),
    ...(props['aria-describedby'] ? { 'aria-describedby': props['aria-describedby'] } : {}),
    'aria-invalid': props['aria-invalid'] ? 'true' : 'false',
    class: CONTENT_CLASS,
  };
}

function insertImage(editor: Editor, image: ArticleImageInsert) {
  const { path, altText, caption, width, height } = image;
  editor.chain().focus().setImage({ src: path, alt: altText, title: caption, width, height }).run();
}

export function RichTextEditor(props: RichTextEditorProps) {
  const [panel, setPanel] = useState<RichTextPanel>(null);
  const editor = useEditor({
    extensions: EXTENSIONS,
    content: props.value,
    // Next.js renders this on the server first; the editor mounts in the browser only.
    immediatelyRender: false,
    editorProps: { attributes: contentAttributes(props) },
    onUpdate: ({ editor: current }) => {
      props.onChange(current.getJSON());
    },
  });
  const closePanel = () => {
    setPanel(null);
  };

  if (!editor) return <div className={cn(FRAME_CLASS, 'min-h-64')} aria-busy="true" />;
  return (
    <div className={cn(FRAME_CLASS, props['aria-invalid'] && 'border-destructive')}>
      <RichTextToolbar editor={editor} panel={panel} onPanel={setPanel} />
      {panel === 'link' && <RichTextLinkForm editor={editor} onDone={closePanel} />}
      {panel === 'image' && (
        <RichTextImagePanel
          upload={props.uploadImage}
          onInsert={(image) => {
            insertImage(editor, image);
            closePanel();
          }}
          onCancel={closePanel}
        />
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
