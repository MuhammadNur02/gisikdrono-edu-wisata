'use client';

import dynamic from 'next/dynamic';
import { useMemo } from 'react';
import { useWatch, type Control } from 'react-hook-form';

import { toEditorDocument } from '@/components/admin/cms/article-values';
import { SelectField, TextField } from '@/components/admin/cms/fields';
import { ImagePathField } from '@/components/admin/cms/image-path-field';
import { FormField } from '@/components/forms/form-field';
import type { UploadImage } from '@/components/forms/image-uploader';
import { SlugInput } from '@/components/forms/slug-input';
import { Input } from '@/components/ui/input';
import { CMS_LIMITS } from '@/config/cms';
import { ARTICLE_CATEGORY_LABELS } from '@/config/status';
import { DB_ENUMS } from '@/db/enums';
import { copy } from '@/lib/copy/id';
import { createImageUpload } from '@/lib/uploads/upload-client';
import type { SaveArticleInput } from '@/lib/validations/article';
import type { ContentOwner } from '@/types/content';

const text = copy.cms.articles;
const common = copy.cms.common;
const CATEGORY_OPTIONS = DB_ENUMS.article_category.map((category) => ({
  value: category,
  label: ARTICLE_CATEGORY_LABELS[category],
}));
const PUBLIC_PREFIX = '/artikel/';

// Tiptap and ProseMirror would take the page past the admin first-load budget (CLAUDE.md §8), so the editor loads
// after the page, behind a box of its own height; it renders in the browser only anyway.
const RichTextEditor = dynamic(
  () => import('@/components/forms/rich-text-editor').then((module) => module.RichTextEditor),
  {
    ssr: false,
    loading: () => <div className="min-h-64 rounded-xl border border-input" aria-busy="true" />,
  },
);

type ArticleControl = Control<SaveArticleInput>;

// One line of tags separated by commas; once the form has parsed it, the field holds the list, shown the same way.
function TagsField({ control }: { control: ArticleControl }) {
  return (
    <FormField
      control={control}
      name="tags"
      label={text.tags}
      description={text.tagsHint}
      render={(field) => (
        <Input
          {...field}
          value={Array.isArray(field.value) ? field.value.join(', ') : field.value}
        />
      )}
    />
  );
}

// A published article keeps its address for an RW admin (finding 1 of the review of PR #18): only the superadmin
// moves it, so the field is shown, not offered.
function SlugField({ control, isLocked }: { control: ArticleControl; isLocked: boolean }) {
  const title = useWatch({ control, name: 'title' });
  return (
    <FormField
      control={control}
      name="slug"
      label={common.slug}
      description={isLocked ? text.slugLocked : common.slugHint}
      required
      render={(field) =>
        isLocked ? (
          <Input {...field} readOnly />
        ) : (
          <SlugInput {...field} source={title} prefix={PUBLIC_PREFIX} />
        )
      }
    />
  );
}

export function HeadingFields({
  control,
  isSlugLocked,
}: {
  control: ArticleControl;
  isSlugLocked: boolean;
}) {
  return (
    <>
      <TextField
        control={control}
        name="title"
        label={text.titleField}
        required
        maxLength={CMS_LIMITS.articleTitle}
      />
      <SlugField control={control} isLocked={isSlugLocked} />
      <TextField
        control={control}
        name="excerpt"
        label={text.excerpt}
        description={text.excerptHint}
        maxLength={CMS_LIMITS.articleExcerpt}
        multiline
      />
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <SelectField
          control={control}
          name="category"
          label={text.category}
          required
          options={CATEGORY_OPTIONS}
        />
        <TagsField control={control} />
      </div>
    </>
  );
}

// The cover and every photo in the body go into this article's own folder of its owner (article-service.ts checks).
export function MediaFields({
  control,
  owner,
  articleId,
}: {
  control: ArticleControl;
  owner: ContentOwner;
  articleId: string;
}) {
  const upload = useMemo(
    () => createImageUpload({ rwId: owner, purpose: 'article', entityId: articleId }),
    [owner, articleId],
  );
  return (
    <>
      <CoverField control={control} upload={upload} />
      <BodyField control={control} upload={upload} />
    </>
  );
}

function CoverField({ control, upload }: { control: ArticleControl; upload: UploadImage }) {
  return (
    <FormField
      control={control}
      name="coverPath"
      label={text.cover}
      render={(field) => (
        <ImagePathField
          id={field.name}
          value={field.value}
          onChange={field.onChange}
          upload={upload}
          alt={text.cover}
        />
      )}
    />
  );
}

function BodyField({ control, upload }: { control: ArticleControl; upload: UploadImage }) {
  return (
    <FormField
      control={control}
      name="bodyJson"
      label={text.body}
      required
      render={(field) => (
        <RichTextEditor
          value={toEditorDocument(field.value)}
          onChange={field.onChange}
          uploadImage={upload}
        />
      )}
    />
  );
}

export function SeoFields({ control }: { control: ArticleControl }) {
  return (
    <div className="grid items-start gap-4 sm:grid-cols-2">
      <TextField
        control={control}
        name="seoTitle"
        label={text.seoTitle}
        maxLength={CMS_LIMITS.seoTitle}
      />
      <TextField
        control={control}
        name="seoDescription"
        label={text.seoDescription}
        maxLength={CMS_LIMITS.seoDescription}
        multiline
      />
    </div>
  );
}
