import { Fragment, type ReactNode } from 'react';

import { CaptionedPhoto } from '@/components/marketing/photo';
import { IMAGE_SIZES } from '@/config/images';
import { ARTICLE_LINK_REL } from '@/config/rich-text';
import type { Json } from '@/db/types';
import {
  sanitiseRichText,
  type RichTextBlock,
  type RichTextImage,
  type RichTextInline,
  type RichTextMark,
} from '@/lib/rich-text/document';
import { articleOutline } from '@/lib/rich-text/outline';
import { cn } from '@/lib/utils/cn';

// docs/StyleGuide.md §3.3 and CLAUDE.md §7.8: an article body drawn from the allowlisted shape of
// src/lib/rich-text/document.ts, one React element per node. Text is always text (React escapes it), links
// carry rel="noopener noreferrer nofollow", and images come from public-media with their caption.

const HEADING_TAGS = { 2: 'h2', 3: 'h3', 4: 'h4' } as const;

function withMark(children: ReactNode, mark: RichTextMark): ReactNode {
  switch (mark.type) {
    case 'bold':
      return <strong>{children}</strong>;
    case 'italic':
      return <em>{children}</em>;
    case 'link':
      return (
        <a href={mark.href} rel={ARTICLE_LINK_REL}>
          {children}
        </a>
      );
  }
}

function Inlines({ content }: { content: RichTextInline[] }) {
  return content.map((inline, index) =>
    inline.type === 'hardBreak' ? (
      <br key={index} />
    ) : (
      <Fragment key={index}>{inline.marks.reduce<ReactNode>(withMark, inline.text)}</Fragment>
    ),
  );
}

function ListItems({ items }: { items: RichTextBlock[][] }) {
  return items.map((item, index) => (
    <li key={index}>
      <Blocks blocks={item} />
    </li>
  ));
}

function ArticleImage({ image }: { image: RichTextImage }) {
  const { path, alt, width, height, caption } = image;
  return (
    <CaptionedPhoto
      image={{ path, alt, width, height, placeholderColour: null }}
      caption={caption}
      sizes={IMAGE_SIZES.prose}
      className="not-prose my-8"
    />
  );
}

function Block({ block, anchor }: { block: RichTextBlock; anchor?: string | undefined }) {
  switch (block.type) {
    case 'paragraph':
      return (
        <p>
          <Inlines content={block.content} />
        </p>
      );
    case 'heading': {
      const Heading = HEADING_TAGS[block.level];
      return (
        <Heading id={anchor}>
          <Inlines content={block.content} />
        </Heading>
      );
    }
    case 'bulletList':
      return (
        <ul>
          <ListItems items={block.items} />
        </ul>
      );
    case 'orderedList':
      return (
        <ol start={block.start}>
          <ListItems items={block.items} />
        </ol>
      );
    case 'blockquote':
      return (
        <blockquote>
          <Blocks blocks={block.content} />
        </blockquote>
      );
    case 'image':
      return <ArticleImage image={block} />;
  }
}

// `anchors` maps a top-level block's index to the id its heading carries (src/lib/rich-text/outline.ts).
function Blocks({
  blocks,
  anchors,
}: {
  blocks: RichTextBlock[];
  anchors?: ReadonlyMap<number, string>;
}) {
  return blocks.map((block, index) => (
    <Block key={index} block={block} anchor={anchors?.get(index)} />
  ));
}

export interface RichTextProps {
  // articles.body_json as stored; anything off the allowlist is dropped before it is drawn.
  body: Json;
  className?: string;
  // Gives each top-level h2 the anchor of the article's contents list (DESIGN-SPEC §3.8).
  anchorHeadings?: boolean;
}

export function RichText({ body, className, anchorHeadings = false }: RichTextProps) {
  const blocks = sanitiseRichText(body);
  const anchors = anchorHeadings
    ? new Map(articleOutline(blocks).map((entry) => [entry.blockIndex, entry.id]))
    : undefined;
  return (
    <div className={cn('prose max-w-prose prose-slate dark:prose-invert', className)}>
      <Blocks blocks={blocks} anchors={anchors} />
    </div>
  );
}
